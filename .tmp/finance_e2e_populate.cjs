const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:4000';
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

async function login(page) {
  const loginResponse = await page.request.post(`${API_URL}/auth/login`, {
    data: { username: 'holand', password: 'Holand2026!@#' },
  });
  if (!loginResponse.ok()) {
    throw new Error(`Login API failed: ${loginResponse.status()} ${await loginResponse.text()}`);
  }
  const session = await loginResponse.json();
  await page.goto(BASE_URL);
  await page.evaluate((payload) => {
    window.localStorage.setItem('orquestrador_internal_auth_v2', JSON.stringify(payload));
    window.sessionStorage.setItem('orquestrador_internal_tab_initialized_v1', '1');
  }, session);
  return session.token;
}

async function apiGet(page, token, path) {
  const response = await page.request.get(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok()) {
    throw new Error(`GET ${path} failed: ${response.status()} ${await response.text()}`);
  }
  return response.json();
}

async function gotoFinance(page, route, heading) {
  await page.goto(`${BASE_URL}${route}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { name: heading }).first().waitFor({ timeout: 10000 });
}

async function fillWrappedField(page, label, value) {
  await page.getByLabel(label, { exact: true }).fill(value);
}

async function selectOnlyFormSelect(page, value) {
  await page.locator('form select').first().selectOption(value);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const browserIssues = [];
  page.on('pageerror', (error) => browserIssues.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (['error'].includes(msg.type())) browserIssues.push(`${msg.type()}: ${msg.text()}`);
  });

  const token = await login(page);
  const before = {
    entities: (await apiGet(page, token, '/finance/entities')).length,
    receivables: (await apiGet(page, token, '/finance/receivables')).receivables.length,
    payables: (await apiGet(page, token, '/finance/payables')).payables.length,
    transactions: (await apiGet(page, token, '/finance/transactions')).transactions.length,
    reconciliationPending: (await apiGet(page, token, '/finance/reconciliation/inbox')).summary.pending_count,
  };

  const created = {
    entity: `Companhia QA ${stamp}`,
    receivableOpen: `Mensalidade QA ${stamp}`,
    receivableReceived: `Patrocínio quitado QA ${stamp}`,
    payableOpen: `Fornecedor palco QA ${stamp}`,
    payablePaid: `Cachê pago QA ${stamp}`,
    transaction: `Receita avulsa QA ${stamp}`,
  };

  await gotoFinance(page, '/financeiro/cadastros', 'Cadastros híbridos');
  await fillWrappedField(page, 'Razão social', created.entity);
  await fillWrappedField(page, 'Nome fantasia', `QA ${stamp}`);
  await fillWrappedField(page, 'CNPJ / CPF', `99.888.777/0001-${stamp.slice(-2)}`);
  await fillWrappedField(page, 'E-mail', `financeiro+${stamp}@qa.test`);
  await fillWrappedField(page, 'Telefone', `(11) 9${stamp.slice(-8)}`);
  await page.getByRole('button', { name: 'Ambos' }).click();
  await page.getByRole('button', { name: 'Cadastrar entidade' }).click();
  await page.getByText('Entidade cadastrada com sucesso').waitFor({ timeout: 10000 });
  await page.getByText(created.entity).waitFor({ timeout: 10000 });

  await gotoFinance(page, '/financeiro/receivables', 'Rotina operacional de recebíveis');
  await fillWrappedField(page, 'Descrição', created.receivableOpen);
  await fillWrappedField(page, 'Cliente', created.entity);
  await fillWrappedField(page, 'Valor (R$)', '12345,67');
  await fillWrappedField(page, 'Vencimento', '2026-05-10');
  await selectOnlyFormSelect(page, 'pendente');
  await fillWrappedField(page, 'Observação', 'Massa fake criada no QA financeiro.');
  await page.getByRole('button', { name: 'Registrar conta a receber' }).click();
  await page.getByText('Conta registrada com sucesso').waitFor({ timeout: 10000 });
  await page.getByText(created.receivableOpen).waitFor({ timeout: 10000 });

  await fillWrappedField(page, 'Descrição', created.receivableReceived);
  await fillWrappedField(page, 'Cliente', created.entity);
  await fillWrappedField(page, 'Valor (R$)', '5432,10');
  await fillWrappedField(page, 'Vencimento', '2026-04-20');
  await selectOnlyFormSelect(page, 'recebido');
  await fillWrappedField(page, 'Observação', 'Recebível liquidado fake.');
  await page.getByRole('button', { name: 'Registrar conta a receber' }).click();
  await page.getByText('Conta registrada com sucesso').waitFor({ timeout: 10000 });
  await page.getByText(created.receivableReceived).waitFor({ timeout: 10000 });

  await gotoFinance(page, '/financeiro/payables', 'Rotina operacional de obrigações');
  await fillWrappedField(page, 'Descrição', created.payableOpen);
  await fillWrappedField(page, 'Fornecedor', created.entity);
  await fillWrappedField(page, 'Valor (R$)', '8765,43');
  await fillWrappedField(page, 'Vencimento', '2026-05-15');
  await selectOnlyFormSelect(page, 'pendente');
  await fillWrappedField(page, 'Observação', 'Obrigação fake em aberto.');
  await page.getByRole('button', { name: 'Registrar conta a pagar' }).click();
  await page.getByText('Conta registrada com sucesso').waitFor({ timeout: 10000 });
  await page.getByText(created.payableOpen).waitFor({ timeout: 10000 });

  await fillWrappedField(page, 'Descrição', created.payablePaid);
  await fillWrappedField(page, 'Fornecedor', created.entity);
  await fillWrappedField(page, 'Valor (R$)', '2222,22');
  await fillWrappedField(page, 'Vencimento', '2026-04-22');
  await selectOnlyFormSelect(page, 'pago');
  await fillWrappedField(page, 'Observação', 'Obrigação fake liquidada.');
  await page.getByRole('button', { name: 'Registrar conta a pagar' }).click();
  await page.getByText('Conta registrada com sucesso').waitFor({ timeout: 10000 });
  await page.getByText(created.payablePaid).waitFor({ timeout: 10000 });

  await gotoFinance(page, '/financeiro/transactions', 'Ledger financeiro');
  await page.getByRole('button', { name: 'Novo lançamento' }).click();
  await page.getByLabel('Descrição', { exact: true }).fill(created.transaction);
  await page.getByLabel('Valor', { exact: true }).fill('4567,89');
  await page.getByLabel('Tipo do lançamento').selectOption('income');
  await page.getByLabel('Status do lançamento').selectOption('settled');
  await page.getByLabel('Conta', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Data de emissão').fill('2026-04-23');
  await page.getByRole('button', { name: 'Salvar lançamento' }).click();
  await page.getByText('Novo lançamento manual registrado com sucesso').waitFor({ timeout: 10000 });
  await page.getByPlaceholder('Buscar lançamento ou entidade...').fill(created.transaction);
  await page.getByText(created.transaction).waitFor({ timeout: 10000 });

  await gotoFinance(page, '/financeiro/reconciliation', 'Inbox operacional de extratos');
  const matchButtons = page.getByRole('button', { name: 'Match' });
  if (await matchButtons.count()) {
    await matchButtons.first().click();
    await page.getByText('Match aplicado com sucesso').waitFor({ timeout: 10000 });
  }
  await gotoFinance(page, '/financeiro/cashflow', 'Fluxo de caixa projetado');
  for (const horizon of ['30 dias', '60 dias', '90 dias']) {
    await page.getByRole('button', { name: horizon, exact: true }).click();
    await page.waitForLoadState('networkidle');
  }

  await gotoFinance(page, '/financeiro/reports', 'Leituras gerenciais');
  for (const report of ['DRE Gerencial', 'Realizado vs Projetado', 'Receitas por categoria', 'Despesas por categoria', 'Rec. a receber vencidos', 'Pag. a pagar vencidos', 'Fluxo consolidado']) {
    await page.getByRole('button', { name: new RegExp(report) }).click();
  }

  await gotoFinance(page, '/financeiro/overview', 'Visão Geral');
  await page.screenshot({ path: '.tmp/finance-overview-after-populate.png', fullPage: true });

  const after = {
    entities: (await apiGet(page, token, '/finance/entities')).length,
    receivables: (await apiGet(page, token, '/finance/receivables')).receivables.length,
    payables: (await apiGet(page, token, '/finance/payables')).payables.length,
    transactions: (await apiGet(page, token, '/finance/transactions')).transactions.length,
    reconciliationPending: (await apiGet(page, token, '/finance/reconciliation/inbox')).summary.pending_count,
  };

  const checks = [
    ['entities', after.entities >= before.entities + 1],
    ['receivables', after.receivables >= before.receivables + 2],
    ['payables', after.payables >= before.payables + 2],
    ['transactions', after.transactions >= before.transactions + 1],
    ['reconciliation did not increase pending', after.reconciliationPending <= before.reconciliationPending],
    ['no browser errors', browserIssues.length === 0],
  ];

  const failed = checks.filter(([, ok]) => !ok);
  console.log(JSON.stringify({ before, after, created, browserIssues, checks }, null, 2));
  await browser.close();

  if (failed.length) {
    throw new Error(`Finance QA failed: ${failed.map(([name]) => name).join(', ')}`);
  }
})();
