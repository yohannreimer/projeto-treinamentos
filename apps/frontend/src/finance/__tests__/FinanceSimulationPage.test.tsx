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
  expect(screen.getByText('Planejamento por eventos')).toBeInTheDocument();
  expect(screen.getByText('Solte uma conta aqui para começar a simular')).toBeInTheDocument();
  expect(screen.queryByText('Solte aqui para usar a data original do card')).not.toBeInTheDocument();
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

  await user.click(screen.getByRole('button', { name: 'Editar saldo inicial' }));
  expect(await screen.findByRole('heading', { name: 'Saldo inicial' })).toBeInTheDocument();
  await user.clear(screen.getByRole('textbox', { name: 'Editar saldo inicial' }));
  await user.type(screen.getByRole('textbox', { name: 'Editar saldo inicial' }), '10.500,00');
  await user.click(screen.getByRole('button', { name: 'Salvar' }));
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

  expect(await screen.findByText('Bloco puxado do financeiro.')).toBeInTheDocument();
});

test('FinanceSimulationPage supports manual blocks, inline editing, removal and scenario actions', async () => {
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
  await user.click(screen.getByRole('button', { name: 'Editar' }));
  await user.clear(screen.getByLabelText('Editar descrição do bloco'));
  await user.type(screen.getByLabelText('Editar descrição do bloco'), 'Entrada ajustada');
  await user.click(screen.getByRole('button', { name: 'Salvar' }));
  await waitFor(() => {
    expect(mocks.updateSimulationItem).toHaveBeenCalledWith('sim-1', 'item-1', expect.objectContaining({
      label: 'Entrada ajustada'
    }));
  });

  await user.click(screen.getByRole('button', { name: 'Remover' }));
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

test('FinanceSimulationPage keeps original source date unless dropped on an existing movement', async () => {
  mocks.getSimulation.mockResolvedValue(mocks.withItem);
  const user = userEvent.setup();
  render(<FinanceSimulationPage />);

  await screen.findByText('Aluguel sala');
  const sourceCard = screen.getByText('Aluguel sala').closest('article');
  const movementCard = screen.getAllByText('02/10/2026')
    .map((element) => element.closest('article'))
    .find((element) => element?.className.includes('finance-simulation-flow-step'));
  expect(sourceCard).not.toBeNull();
  expect(movementCard).not.toBeNull();

  fireEvent.dragStart(sourceCard as HTMLElement);
  fireEvent.dragEnter(movementCard as HTMLElement);
  expect(movementCard).toHaveClass('is-drop-active');
  fireEvent.drop(movementCard as HTMLElement);
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
