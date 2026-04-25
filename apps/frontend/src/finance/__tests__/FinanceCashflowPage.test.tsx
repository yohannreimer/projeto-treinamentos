import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinanceCashflowPage } from '../pages/FinanceCashflowPage';

const mocks = vi.hoisted(() => ({
  getCashflow: vi.fn()
}));

vi.mock('../api', () => ({
  financeApi: {
    getCashflow: mocks.getCashflow
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCashflow.mockImplementation(async (horizon = 90) => ({
    organization_id: 'org-holand',
    organization_name: 'Holand',
    generated_at: '2026-04-22T16:00:00.000Z',
    horizon_days: horizon,
    points: [
      {
        date: '2026-04-22',
        inflow_cents: horizon === 30 ? 450000 : 780000,
        outflow_cents: horizon === 30 ? 250000 : 510000,
        net_cents: horizon === 30 ? 200000 : 270000,
        balance_cents: horizon === 30 ? 200000 : 270000
      }
    ],
    windows: [
      {
        horizon_days: 30,
        inflow_cents: 450000,
        outflow_cents: 250000,
        net_cents: 200000,
        starting_balance_cents: 0,
        ending_balance_cents: 200000,
        lowest_balance_cents: 0,
        risk_level: 'healthy'
      },
      {
        horizon_days: 60,
        inflow_cents: 610000,
        outflow_cents: 420000,
        net_cents: 190000,
        starting_balance_cents: 0,
        ending_balance_cents: 190000,
        lowest_balance_cents: -25000,
        risk_level: 'attention'
      },
      {
        horizon_days: 90,
        inflow_cents: 780000,
        outflow_cents: 510000,
        net_cents: 270000,
        starting_balance_cents: 0,
        ending_balance_cents: 270000,
        lowest_balance_cents: -50000,
        risk_level: 'critical'
      }
    ],
    alerts: [
      {
        id: 'cash-pressure',
        tone: 'warning',
        title: 'Compressão de caixa',
        detail: 'Existe pressão de caixa em janelas futuras.'
      }
    ],
    totals: {
      inflow_cents: horizon === 30 ? 450000 : 780000,
      outflow_cents: horizon === 30 ? 250000 : 510000,
      ending_balance_cents: horizon === 30 ? 200000 : 270000,
      starting_balance_cents: 0
    }
  }));
});

test('cashflow page renders the 30 60 90 day horizon controls', async () => {
  render(<FinanceCashflowPage />);

  expect((await screen.findAllByRole('button', { name: /30 dias/i })).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('button', { name: /60 dias/i }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('button', { name: /90 dias/i }).length).toBeGreaterThan(0);
  expect(screen.getByText('Fluxo de caixa projetado')).toBeInTheDocument();
  expect(await screen.findByText('Compressão de caixa')).toBeInTheDocument();

  await userEvent.click(screen.getAllByRole('button', { name: /30 dias/i })[0]);

  await waitFor(() => {
    expect(mocks.getCashflow).toHaveBeenCalledWith(30);
  });
});

test('cashflow page allows switching across all horizon buttons', async () => {
  const user = userEvent.setup();
  render(<FinanceCashflowPage />);

  expect(await screen.findByText('Resumo principal — 90 dias')).toBeInTheDocument();

  await user.click(screen.getAllByRole('button', { name: /60 dias/i })[0]);
  await waitFor(() => {
    expect(mocks.getCashflow).toHaveBeenCalledWith(60);
  });

  await user.click(screen.getAllByRole('button', { name: /30 dias/i })[0]);
  await waitFor(() => {
    expect(mocks.getCashflow).toHaveBeenCalledWith(30);
  });

  await user.click(screen.getAllByRole('button', { name: /90 dias/i })[0]);
  await waitFor(() => {
    expect(mocks.getCashflow).toHaveBeenCalledWith(90);
  });
});
