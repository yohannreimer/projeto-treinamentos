import { chromium } from 'playwright';

const baseUrl = 'http://localhost:5173';
const errors = [];
const results = [];

function logResult(name, status, detail = '') {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail ? ` - ${detail}` : ''}`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    errors.push(`console:${msg.text()}`);
  }
});
page.on('pageerror', (err) => errors.push(`pageerror:${err.message}`));

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  if ((await page.title()).includes('Orquestrador') || (await page.locator('text=Login').count()) > 0) {
    await page.getByLabel('Login').fill('holand');
    await page.getByLabel('Senha').fill('Holand2026!@#');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForLoadState('networkidle');
  }

  const financeNav = page.getByRole('link', { name: /Financeiro/i });
  if (await financeNav.count()) {
    await financeNav.click();
    await page.waitForLoadState('networkidle');
  }

  const routes = [
    ['overview', '/financeiro/overview'],
    ['transactions', '/financeiro/transactions'],
    ['receivables', '/financeiro/receivables'],
    ['payables', '/financeiro/payables'],
    ['reconciliation', '/financeiro/reconciliation'],
    ['cashflow', '/financeiro/cashflow'],
    ['reports', '/financeiro/reports'],
    ['cadastros', '/financeiro/cadastros'],
  ];

  for (const [name, path] of routes) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
    const bodyText = await page.locator('body').innerText();
    if (/Cannot GET|fieldErrors|Unhandled Runtime Error|ERR_/i.test(bodyText)) {
      logResult(name, 'FAIL', bodyText.slice(0, 200));
    } else {
      logResult(name, 'PASS');
    }
  }

  // Transaction creation happy path
  await page.goto(`${baseUrl}/financeiro/transactions`, { waitUntil: 'networkidle' });
  const novoBtn = page.getByRole('button', { name: /novo/i }).first();
  if (await novoBtn.count()) {
    await novoBtn.click();
    await page.waitForTimeout(300);
    const descricao = page.getByLabel(/descrição/i).first();
    if (await descricao.count()) {
      await descricao.fill('Smoke lançamento aberto');
      const valor = page.getByLabel(/valor/i).first();
      if (await valor.count()) await valor.fill('1234');
      const tipo = page.getByLabel(/^tipo$/i).first();
      if (await tipo.count()) await tipo.selectOption('income');
      const status = page.getByLabel(/^status$/i).first();
      if (await status.count()) await status.selectOption('open');
      const submit = page.getByRole('button', { name: /salvar|criar|registrar/i }).last();
      await submit.click();
      await page.waitForTimeout(600);
      const text = await page.locator('body').innerText();
      if (/fieldErrors|formErrors|Falha|erro/i.test(text) && /Smoke lançamento aberto/.test(text) === false) {
        logResult('transaction-open-create', 'FAIL', text.slice(0, 200));
      } else {
        logResult('transaction-open-create', 'PASS');
      }
    } else {
      logResult('transaction-open-create', 'SKIP', 'form not found');
    }
  } else {
    logResult('transaction-open-create', 'SKIP', 'novo button not found');
  }

  // Transaction settled path to reproduce settlement_date bug
  await page.goto(`${baseUrl}/financeiro/transactions`, { waitUntil: 'networkidle' });
  if (await novoBtn.count()) {
    await novoBtn.click();
    await page.waitForTimeout(300);
    const descricao = page.getByLabel(/descrição/i).first();
    if (await descricao.count()) {
      await descricao.fill('Smoke lançamento liquidado');
      const valor = page.getByLabel(/valor/i).first();
      if (await valor.count()) await valor.fill('2500');
      const tipo = page.getByLabel(/^tipo$/i).first();
      if (await tipo.count()) await tipo.selectOption('expense');
      const status = page.getByLabel(/^status$/i).first();
      if (await status.count()) await status.selectOption('settled');
      const settlementDate = page.getByLabel(/settlement|liquidação|baixa/i).first();
      if (await settlementDate.count()) await settlementDate.fill('2026-04-23');
      const submit = page.getByRole('button', { name: /salvar|criar|registrar/i }).last();
      await submit.click();
      await page.waitForTimeout(800);
      const text = await page.locator('body').innerText();
      if (/settlement_date|fieldErrors|formErrors/i.test(text)) {
        logResult('transaction-settled-create', 'FAIL', text.slice(0, 240));
      } else {
        logResult('transaction-settled-create', 'PASS');
      }
    } else {
      logResult('transaction-settled-create', 'SKIP', 'form not found');
    }
  }

  // quick smoke for cadastros button interactions
  await page.goto(`${baseUrl}/financeiro/cadastros`, { waitUntil: 'networkidle' });
  for (const tab of ['Todos', 'Clientes', 'Fornecedores']) {
    const el = page.getByRole('tab', { name: new RegExp(tab, 'i') });
    if (await el.count()) {
      await el.click();
      await page.waitForTimeout(150);
      logResult(`cadastros-tab-${tab.toLowerCase()}`, 'PASS');
    } else {
      logResult(`cadastros-tab-${tab.toLowerCase()}`, 'FAIL', 'tab missing');
    }
  }

} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (errors.length) {
    console.log('\nBROWSER_ERRORS_START');
    for (const err of errors) console.log(err);
    console.log('BROWSER_ERRORS_END');
  }
  await browser.close();
}
