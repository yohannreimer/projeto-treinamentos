import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinanceSimulationPage } from '../pages/FinanceSimulationPage';

const mocks = vi.hoisted(() => {
  const baseScenario = {
    id: 'sim-1',
    organization_id: 'org-holand',
    company_id: null,
    name: 'Cenário de caixa da semana',
    description: 'Mesa para testar entradas, pagamentos e negociações.',
    start_date: '2026-10-01',
    end_date: '2026-10-05',
    starting_balance_cents: 100000,
    created_by: 'financeiro',
    created_at: '2026-04-23T20:00:00.000Z',
    updated_at: '2026-04-23T20:00:00.000Z',
    result: {
      starting_balance_cents: 100000,
      total_inflow_cents: 0,
      total_outflow_cents: 0,
      ending_balance_cents: 100000,
      minimum_balance_cents: 100000,
      first_negative_date: null,
      item_count: 0,
      timeline: [
        { date: '2026-10-01', inflow_cents: 0, outflow_cents: 0, net_cents: 0, balance_cents: 100000 },
        { date: '2026-10-02', inflow_cents: 0, outflow_cents: 0, net_cents: 0, balance_cents: 100000 }
      ]
    }
  };
  const detail = {
    ...baseScenario,
    items: []
  };
  const withItem = {
    ...baseScenario,
    result: {
      ...baseScenario.result,
      total_inflow_cents: 200000,
      ending_balance_cents: 300000,
      item_count: 1,
      timeline: [
        { date: '2026-10-01', inflow_cents: 0, outflow_cents: 0, net_cents: 0, balance_cents: 100000 },
        { date: '2026-10-02', inflow_cents: 200000, outflow_cents: 0, net_cents: 200000, balance_cents: 300000 }
      ]
    },
    items: [
      {
        id: 'item-1',
        organization_id: 'org-holand',
        company_id: null,
        financial_simulation_scenario_id: 'sim-1',
        source_type: 'manual',
        source_id: null,
        kind: 'expected_inflow',
        label: 'Entrada prevista',
        amount_cents: 200000,
        event_date: '2026-10-02',
        probability_percent: 100,
        note: null,
        created_at: '2026-04-23T20:00:00.000Z',
        updated_at: '2026-04-23T20:00:00.000Z'
      }
    ]
  };
  const withOutflow = {
    ...baseScenario,
    result: {
      ...baseScenario.result,
      total_outflow_cents: 680000,
      ending_balance_cents: 9320000,
      item_count: 1,
      timeline: [
        { date: '2026-10-01', inflow_cents: 0, outflow_cents: 0, net_cents: 0, balance_cents: 10000000 },
        { date: '2026-10-03', inflow_cents: 0, outflow_cents: 680000, net_cents: -680000, balance_cents: 9320000 }
      ]
    },
    items: [
      {
        id: 'item-outflow-1',
        organization_id: 'org-holand',
        company_id: null,
        financial_simulation_scenario_id: 'sim-1',
        source_type: 'manual',
        source_id: null,
        kind: 'scheduled_outflow',
        label: 'Aluguel sala',
        amount_cents: 680000,
        event_date: '2026-10-03',
        probability_percent: 100,
        note: null,
        created_at: '2026-04-23T20:00:00.000Z',
        updated_at: '2026-04-23T20:00:00.000Z'
      }
    ]
  };
  const sources = {
    balance: {
      id: 'balance-current',
      label: 'Saldo atual em conta',
      detail: 'Saldo consolidado da visão geral',
      amount_cents: 18120367,
      event_date: '2026-10-01',
      kind: 'starting_balance',
      source_type: 'balance',
      source_id: null,
      tone: 'balance',
      cadence: 'one_time'
    },
    sources: [
      {
        id: 'receivable-rec-1',
        label: 'Contrato Versalis',
        detail: 'Conta a receber em aberto',
        amount_cents: 450000,
        event_date: '2026-10-02',
        kind: 'expected_inflow',
        source_type: 'receivable',
        source_id: 'rec-1',
        tone: 'inflow',
        cadence: 'one_time'
      },
      {
        id: 'payable-pay-1',
        label: 'Aluguel sala',
        detail: 'Recorrente · Conta a pagar pendente',
        amount_cents: 680000,
        event_date: '2026-10-03',
        kind: 'scheduled_outflow',
        source_type: 'payable',
        source_id: 'pay-1',
        tone: 'outflow',
        cadence: 'recurring'
      }
    ]
  };
  return {
    baseScenario,
    detail,
    withItem,
    withOutflow,
    sources,
    listSimulations: vi.fn(),
    listSimulationSources: vi.fn(),
    createSimulation: vi.fn(),
    getSimulation: vi.fn(),
    updateSimulation: vi.fn(),
    deleteSimulation: vi.fn(),
    createSimulationItem: vi.fn(),
    updateSimulationItem: vi.fn(),
    deleteSimulationItem: vi.fn(),
    duplicateSimulation: vi.fn()
  };
});

vi.mock('../api', () => ({
  financeApi: {
    listSimulations: mocks.listSimulations,
    listSimulationSources: mocks.listSimulationSources,
    createSimulation: mocks.createSimulation,
    getSimulation: mocks.getSimulation,
    updateSimulation: mocks.updateSimulation,
    deleteSimulation: mocks.deleteSimulation,
    createSimulationItem: mocks.createSimulationItem,
    updateSimulationItem: mocks.updateSimulationItem,
    deleteSimulationItem: mocks.deleteSimulationItem,
    duplicateSimulation: mocks.duplicateSimulation
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  mocks.listSimulations.mockResolvedValue({ scenarios: [mocks.baseScenario] });
  mocks.listSimulationSources.mockResolvedValue(mocks.sources);
  mocks.getSimulation.mockResolvedValue(mocks.detail);
  mocks.createSimulation.mockResolvedValue(mocks.detail);
  mocks.updateSimulation.mockResolvedValue(mocks.detail);
  mocks.deleteSimulation.mockResolvedValue({ ok: true, scenario_id: 'sim-1' });
  mocks.createSimulationItem.mockResolvedValue(mocks.withItem);
  mocks.updateSimulationItem.mockResolvedValue(mocks.withItem);
  mocks.deleteSimulationItem.mockResolvedValue(mocks.detail);
  mocks.duplicateSimulation.mockResolvedValue({ ...mocks.withItem, id: 'sim-2', name: 'Cenário de caixa da semana - cópia' });
});

test('FinanceSimulationPage creates a table and pulls real financial sources into the planning flow', async () => {
  const user = userEvent.setup();
  render(<FinanceSimulationPage />);

  expect(await screen.findByText('Mesa de simulação')).toBeInTheDocument();
  expect(await screen.findByText('Fontes do financeiro')).toBeInTheDocument();
  expect(screen.getByText('Planilha de cenário')).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Planilha de simulação financeira' })).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Prob.' })).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Origem' })).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Tipo' })).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Ações' })).not.toBeInTheDocument();
  expect(screen.getByText('Solte uma conta aqui para começar ou clique para adicionar uma linha manual')).toBeInTheDocument();
  expect(screen.getByText('Contrato Versalis')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Recorrentes' }));
  expect(screen.getByText('Aluguel sala')).toBeInTheDocument();
  expect(screen.queryByText('Contrato Versalis')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Todos' }));

  await user.click(screen.getByRole('button', { name: 'Nova mesa' }));
  await user.click(screen.getByRole('button', { name: 'Criar cenário' }));
  await waitFor(() => {
    expect(mocks.createSimulation).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Cenário de caixa da semana',
      starting_balance_cents: 10000000
    }));
  });

  await user.click(screen.getByRole('button', { name: 'Usar saldo' }));
  await waitFor(() => {
    expect(mocks.updateSimulation).toHaveBeenCalledWith('sim-1', { starting_balance_cents: 18120367 });
  });

  const table = screen.getByRole('table', { name: 'Planilha de simulação financeira' });
  const startingBalanceCell = within(table).getAllByRole('button').find((button) => button.textContent?.includes('1.000,00'));
  expect(startingBalanceCell).toBeDefined();
  await user.dblClick(startingBalanceCell as HTMLButtonElement);
  await user.clear(screen.getByRole('textbox', { name: 'Editar saldo inicial' }));
  await user.type(screen.getByRole('textbox', { name: 'Editar saldo inicial' }), '10.500,00{Enter}');
  await waitFor(() => {
    expect(mocks.updateSimulation).toHaveBeenCalledWith('sim-1', { starting_balance_cents: 1050000 });
  });

  const sourceCard = screen.getByText('Contrato Versalis').closest('article');
  expect(sourceCard).not.toBeNull();
  await user.click(within(sourceCard as HTMLElement).getByRole('button', { name: 'Adicionar' }));
  await waitFor(() => {
    expect(mocks.createSimulationItem).toHaveBeenCalledWith('sim-1', expect.objectContaining({
      source_type: 'receivable',
      source_id: 'rec-1',
      kind: 'expected_inflow',
      label: 'Contrato Versalis',
      amount_cents: 450000
    }));
  });

  expect(await screen.findByText('Linha puxada do financeiro.')).toBeInTheDocument();
});

test('FinanceSimulationPage supports manual rows, cell editing, removal and scenario actions', async () => {
  const user = userEvent.setup();
  render(<FinanceSimulationPage />);

  await screen.findByText('Fontes do financeiro');
  await user.click(screen.getByRole('button', { name: 'Adicionar manual' }));
  await waitFor(() => {
    expect(mocks.createSimulationItem).toHaveBeenCalledWith('sim-1', expect.objectContaining({
      kind: 'expected_inflow',
      label: 'Entrada prevista',
      amount_cents: 2000000
    }));
  });

  await waitFor(() => {
    expect(screen.getAllByText('Entrada prevista').length).toBeGreaterThan(1);
  });
  const table = screen.getByRole('table', { name: 'Planilha de simulação financeira' });
  await user.dblClick(within(table).getAllByRole('button', { name: 'Entrada prevista' })[0]);
  await user.clear(screen.getByLabelText('Editar descrição'));
  await user.type(screen.getByLabelText('Editar descrição'), 'Entrada ajustada{Enter}');
  await waitFor(() => {
    expect(mocks.updateSimulationItem).toHaveBeenCalledWith('sim-1', 'item-1', expect.objectContaining({
      label: 'Entrada ajustada'
    }));
  });

  const editedRow = within(table).getAllByRole('button', { name: 'Entrada prevista' })[0].closest('tr');
  expect(editedRow).not.toBeNull();
  fireEvent.click(editedRow as HTMLElement);
  fireEvent.keyDown(editedRow as HTMLElement, { key: 'Delete' });
  await waitFor(() => {
    expect(mocks.deleteSimulationItem).toHaveBeenCalledWith('sim-1', 'item-1');
  });

  await user.click(screen.getByRole('button', { name: 'Duplicar cenário' }));
  await waitFor(() => {
    expect(mocks.duplicateSimulation).toHaveBeenCalledWith('sim-1');
  });

  await user.click(screen.getByRole('button', { name: 'Excluir cenário' }));
  await waitFor(() => {
    expect(mocks.deleteSimulation).toHaveBeenCalledWith('sim-2');
  });
});

test('FinanceSimulationPage keeps original source date unless dropped on an existing grid row', async () => {
  mocks.getSimulation.mockResolvedValue(mocks.withItem);
  const user = userEvent.setup();
  render(<FinanceSimulationPage />);

  await screen.findByText('Aluguel sala');
  const sourceCard = screen.getByText('Aluguel sala').closest('article');
  const table = screen.getByRole('table', { name: 'Planilha de simulação financeira' });
  const movementRow = within(table).getAllByRole('button', { name: 'Entrada prevista' })[0].closest('tr');
  expect(sourceCard).not.toBeNull();
  expect(movementRow).not.toBeNull();

  fireEvent.dragStart(sourceCard as HTMLElement);
  await waitFor(() => expect(sourceCard).toHaveClass('is-dragging'));
  fireEvent.dragEnter(movementRow as HTMLElement);
  await waitFor(() => expect(movementRow).toHaveClass('is-drop-active'));
  fireEvent.drop(movementRow as HTMLElement);
  await waitFor(() => {
    expect(mocks.createSimulationItem).toHaveBeenCalledWith('sim-1', expect.objectContaining({
      source_id: 'pay-1',
      event_date: '2026-10-02'
    }));
  });

  await user.click(screen.getByText('Aluguel sala').closest('article')!.querySelector('button') as HTMLButtonElement);
  await waitFor(() => {
    expect(mocks.createSimulationItem).toHaveBeenCalledWith('sim-1', expect.objectContaining({
      source_id: 'pay-1',
      event_date: '2026-10-03'
    }));
  });
});

test('FinanceSimulationPage copies and pastes rows with spreadsheet shortcuts', async () => {
  mocks.getSimulation.mockResolvedValue(mocks.withItem);
  const user = userEvent.setup();
  render(<FinanceSimulationPage />);

  const table = await screen.findByRole('table', { name: 'Planilha de simulação financeira' });
  const row = within(table).getAllByRole('button', { name: 'Entrada prevista' })[0].closest('tr');
  expect(row).not.toBeNull();

  await user.click(row as HTMLElement);
  fireEvent.keyDown(table.closest('.finance-simulation-workbench') as HTMLElement, { key: 'c', ctrlKey: true });
  expect(await screen.findByText('Linha "Entrada prevista" copiada.')).toBeInTheDocument();
  fireEvent.keyDown(table.closest('.finance-simulation-workbench') as HTMLElement, { key: 'v', ctrlKey: true });

  await waitFor(() => {
    expect(mocks.createSimulationItem).toHaveBeenCalledWith('sim-1', expect.objectContaining({
      source_type: 'manual',
      source_id: null,
      label: 'Entrada prevista',
      event_date: '2026-10-02'
    }));
  });
});

test('FinanceSimulationPage deletes the selected spreadsheet row with Delete', async () => {
  mocks.getSimulation.mockResolvedValue(mocks.withItem);
  render(<FinanceSimulationPage />);

  const table = await screen.findByRole('table', { name: 'Planilha de simulação financeira' });
  const row = within(table).getAllByRole('button', { name: 'Entrada prevista' })[0].closest('tr');
  expect(row).not.toBeNull();

  fireEvent.click(row as HTMLElement);
  fireEvent.keyDown(row as HTMLElement, { key: 'Delete' });

  await waitFor(() => {
    expect(mocks.deleteSimulationItem).toHaveBeenCalledWith('sim-1', 'item-1');
  });
});

test('FinanceSimulationPage marks negative impacted dates as red even when final balance stays positive', async () => {
  mocks.getSimulation.mockResolvedValue(mocks.withOutflow);
  render(<FinanceSimulationPage />);

  const impactValues = await screen.findAllByText((content) => content.includes('-R$') && content.includes('6.800,00'));
  const impactValue = impactValues.find((element) => element.closest('div')?.classList.contains('is-negative'));
  expect(impactValue).toBeDefined();

  expect(impactValue?.closest('div')).toHaveClass('is-negative');
});

test('FinanceSimulationPage exports the scenario table as a polished print document', async () => {
  const write = vi.fn();
  const close = vi.fn();
  const open = vi.spyOn(window, 'open').mockReturnValue({
    document: { write, close }
  } as unknown as Window);
  const user = userEvent.setup();
  mocks.getSimulation.mockResolvedValue(mocks.withOutflow);

  render(<FinanceSimulationPage />);

  await user.click(await screen.findByRole('button', { name: 'Exportar planilha em PDF' }));

  expect(open).toHaveBeenCalledWith('', '_blank', 'width=1180,height=820');
  expect(write).toHaveBeenCalledWith(expect.stringContaining('class="sheet"'));
  expect(write).toHaveBeenCalledWith(expect.stringContaining('Grade de movimentos'));
  expect(write).toHaveBeenCalledWith(expect.stringContaining('<th>Movimento</th>'));
  expect(write).not.toHaveBeenCalledWith(expect.stringContaining('<th>Prob.</th>'));
  expect(write).not.toHaveBeenCalledWith(expect.stringContaining('<th>Origem</th>'));
  expect(write).not.toHaveBeenCalledWith(expect.stringContaining('<th>Status</th>'));
  expect(write).toHaveBeenCalledWith(expect.stringContaining('Holand Financeiro ERP'));
  expect(close).toHaveBeenCalled();
});
