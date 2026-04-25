const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const consoleMessages = [];
  page.on('console', (msg) => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (error) => consoleMessages.push(`pageerror: ${error.message}`));

  await page.goto(`${BASE_URL}/financeiro/overview`);
  await page.waitForLoadState('networkidle');

  const loginResponse = await page.request.post('http://localhost:4000/auth/login', {
    data: { username: 'holand', password: 'Holand2026!@#' },
  });
  if (!loginResponse.ok()) {
    throw new Error(`Login API failed: ${loginResponse.status()} ${await loginResponse.text()}`);
  }
  const session = await loginResponse.json();
  await page.evaluate((payload) => {
    window.localStorage.setItem('orquestrador_internal_auth_v2', JSON.stringify(payload));
    window.sessionStorage.setItem('orquestrador_internal_tab_initialized_v1', '1');
  }, session);
  await page.goto(`${BASE_URL}/financeiro/overview`);
  await page.waitForLoadState('networkidle');

  const routes = [
    '/financeiro/overview',
    '/financeiro/transactions',
    '/financeiro/receivables',
    '/financeiro/payables',
    '/financeiro/reconciliation',
    '/financeiro/cashflow',
    '/financeiro/reports',
    '/financeiro/cadastros',
  ];

  for (const route of routes) {
    await page.goto(`${BASE_URL}${route}`);
    await page.waitForLoadState('networkidle');
    console.log(`\n=== ${route} ===`);
    console.log('url:', page.url());
    console.log('title:', await page.title());
    console.log('headings:', await page.locator('h1, h2, h3').evaluateAll((items) => items.slice(0, 12).map((item) => item.textContent.trim())));
    console.log('buttons:', await page.locator('button').evaluateAll((items) => items.slice(0, 30).map((item) => item.textContent.trim())));
    console.log('fields:', await page.locator('input, select, textarea').evaluateAll((items) => items.slice(0, 40).map((item) => ({
      tag: item.tagName.toLowerCase(),
      type: item.getAttribute('type'),
      name: item.getAttribute('name'),
      placeholder: item.getAttribute('placeholder'),
      value: item.value,
      label: item.labels?.[0]?.textContent?.trim() ?? null,
    }))));
    console.log('alerts:', await page.locator('[role="alert"], .finance-page-error, .finance-page-success').evaluateAll((items) => items.map((item) => item.textContent.trim())));
  }

  if (consoleMessages.length) {
    console.log('\n=== console ===');
    for (const message of consoleMessages) console.log(message);
  }

  await browser.close();
})();
