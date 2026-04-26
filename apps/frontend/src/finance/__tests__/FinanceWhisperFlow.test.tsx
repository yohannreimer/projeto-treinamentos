import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinanceWhisperFlow } from '../components/FinanceWhisperFlow';

const mocks = vi.hoisted(() => ({
  interpretAssistantCommand: vi.fn(),
  executeAssistantPlan: vi.fn()
}));

vi.mock('../api', () => ({
  financeApi: {
    interpretAssistantCommand: mocks.interpretAssistantCommand,
    executeAssistantPlan: mocks.executeAssistantPlan
  }
}));

beforeEach(() => {
  mocks.interpretAssistantCommand.mockReset();
  mocks.executeAssistantPlan.mockReset();
  mocks.interpretAssistantCommand.mockResolvedValue({
    id: 'plan-whisper-1',
    transcript: 'lança aluguel de 8000',
    surface_path: '/financeiro/payables',
    status: 'draft',
    risk_level: 'medium',
    requires_confirmation: true,
    human_summary: 'Criar conta a pagar de aluguel no valor de R$ 8.000,00.',
    actions: [
      {
        id: 'action-payable-1',
        intent: 'create_payable',
        confidence: 0.92,
        risk_level: 'medium',
        requires_confirmation: true,
        requires_permission: 'finance.write',
        human_summary: 'Lançar aluguel como conta a pagar.',
        payload: { amount_cents: 800000 }
      }
    ]
  });
  mocks.executeAssistantPlan.mockResolvedValue({
    id: 'plan-whisper-1',
    status: 'executed',
    results: [
      {
        action_id: 'action-payable-1',
        intent: 'create_payable',
        resource_type: 'payable',
        resource_id: 'payable-1'
      }
    ]
  });
});

test('FinanceWhisperFlow interprets a typed command and executes the confirmed plan', async () => {
  const user = userEvent.setup();

  render(
    <MemoryRouter initialEntries={['/financeiro/payables']}>
      <FinanceWhisperFlow />
    </MemoryRouter>
  );

  await user.click(screen.getByRole('button', { name: 'Abrir Whisper Flow' }));
  await user.type(screen.getByLabelText('Comando do Whisper Flow'), 'lança aluguel de 8000');
  await user.click(screen.getByRole('button', { name: 'Interpretar comando' }));

  await waitFor(() => expect(mocks.interpretAssistantCommand).toHaveBeenCalledTimes(1));
  expect(mocks.interpretAssistantCommand).toHaveBeenCalledWith({
    transcript: 'lança aluguel de 8000',
    surface_path: '/financeiro/payables'
  });
  expect(await screen.findByText('Criar conta a pagar de aluguel no valor de R$ 8.000,00.')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Confirmar e executar' }));

  await waitFor(() => expect(mocks.executeAssistantPlan).toHaveBeenCalledTimes(1));
  expect(mocks.executeAssistantPlan).toHaveBeenCalledWith('plan-whisper-1');
  expect(await screen.findByText('Plano executado.')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Fechar Whisper Flow' }));
  await user.click(screen.getByRole('button', { name: 'Abrir Whisper Flow' }));

  expect(screen.getByLabelText('Comando do Whisper Flow')).toHaveValue('');
  expect(screen.queryByText('Plano executado.')).not.toBeInTheDocument();
  expect(screen.queryByText('Criar conta a pagar de aluguel no valor de R$ 8.000,00.')).not.toBeInTheDocument();
});
