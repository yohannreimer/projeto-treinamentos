import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const backend = 'http://127.0.0.1:4000';
const frontend = 'http://localhost:5173';

const loginResponse = await fetch(`${backend}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'holand', password: 'Holand2026!@#' })
});

if (!loginResponse.ok) {
  throw new Error(`Login failed: ${loginResponse.status} ${await loginResponse.text()}`);
}

const session = await loginResponse.json();
session.user = {
  ...session.user,
  permissions: Array.from(new Set([
    ...(session.user?.permissions ?? []),
    'finance.read',
    'finance.write',
    'finance.reconcile'
  ]))
};
const reportsResponse = await fetch(`${backend}/finance/reports`, {
  headers: { authorization: `Bearer ${session.token}` }
});
const overviewResponse = await fetch(`${backend}/finance/overview/executive`, {
  headers: { authorization: `Bearer ${session.token}` }
});

if (!reportsResponse.ok) {
  throw new Error(`Reports failed: ${reportsResponse.status} ${await reportsResponse.text()}`);
}
if (!overviewResponse.ok) {
  throw new Error(`Overview failed: ${overviewResponse.status} ${await overviewResponse.text()}`);
}

const reports = await reportsResponse.json();
const overview = await overviewResponse.json();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addInitScript((savedSession) => {
  window.localStorage.setItem('orquestrador_internal_auth_v2', JSON.stringify(savedSession));
  window.sessionStorage.setItem('orquestrador_internal_tab_initialized_v1', '1');
}, session);

const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.route('**/auth/me', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: session.user })
  });
});

for (let attempt = 0; attempt < 20; attempt += 1) {
  try {
    const ready = await fetch(frontend);
    if (ready.ok) break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

await page.goto(`${frontend}/financeiro/reports`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
if (await page.getByRole('heading', { name: /DRE Gerencial/i }).count() === 0) {
  await page.screenshot({ path: '.tmp/finance-reports-load-failure.png', fullPage: true });
  throw new Error(`Reports page did not load DRE. URL=${page.url()} BODY=${(await page.locator('body').innerText()).slice(0, 1200)}`);
}
await page.getByRole('heading', { name: /DRE Gerencial/i }).waitFor();
const reportsText = await page.locator('body').innerText();
await page.screenshot({ path: '.tmp/finance-reports-after-fixes.png', fullPage: true });

await page.goto(`${frontend}/financeiro/overview`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: 'Visão Geral' }).waitFor();
const overviewText = await page.locator('body').innerText();
await page.screenshot({ path: '.tmp/finance-overview-after-calc-fix.png', fullPage: true });

await page.goto(`${frontend}/financeiro/reconciliation`, { waitUntil: 'domcontentloaded' });
await page.getByText('Pendências de conciliação').waitFor();
const hasRadar = await page.getByText('Radar').count();
await page.getByRole('tab', { name: /Importados/i }).click();
await page.waitForTimeout(150);
const importedOverflow = await page.evaluate(() => ({
  bodyScrollWidth: document.body.scrollWidth,
  bodyClientWidth: document.body.clientWidth,
  documentScrollWidth: document.documentElement.scrollWidth,
  documentClientWidth: document.documentElement.clientWidth
}));
await page.getByRole('tab', { name: /Matches recentes/i }).click();
await page.waitForTimeout(150);
const matchesOverflow = await page.evaluate(() => ({
  bodyScrollWidth: document.body.scrollWidth,
  bodyClientWidth: document.body.clientWidth,
  documentScrollWidth: document.documentElement.scrollWidth,
  documentClientWidth: document.documentElement.clientWidth
}));
await page.screenshot({ path: '.tmp/finance-reconciliation-after-fixes.png', fullPage: true });

await browser.close();

const brl = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const pickKpi = (id) => overview.kpis.find((kpi) => kpi.id === id)?.amount_cents ?? null;

console.log(JSON.stringify({
  backend: {
    dre: {
      gross: brl(reports.dre.gross_revenue_cents),
      net: brl(reports.dre.net_revenue_cents),
      expenses: brl(reports.dre.operating_expenses_cents),
      result: brl(reports.dre.operating_result_cents)
    },
    overview: {
      receivables: brl(pickKpi('receivables')),
      payables: brl(pickKpi('payables')),
      projection: brl(pickKpi('projection')),
      revenueMonth: brl(pickKpi('revenue-month')),
      expenseMonth: brl(pickKpi('expense-month'))
    }
  },
  ui: {
    reportsHasCorrectNet: reportsText.includes(brl(reports.dre.net_revenue_cents)),
    reportsHasOldScaledNet: reportsText.includes('R$ 33.982.421,00'),
    overviewHasProjection: overviewText.includes(brl(pickKpi('projection'))),
    reconciliationRadarCount: hasRadar,
    importedOverflow,
    matchesOverflow,
    screenshots: [
      '.tmp/finance-reports-after-fixes.png',
      '.tmp/finance-overview-after-calc-fix.png',
      '.tmp/finance-reconciliation-after-fixes.png'
    ]
  },
  browserErrors: errors
}, null, 2));
