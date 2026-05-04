import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinanceWhisperFlow } from '../components/FinanceWhisperFlow';
import { FINANCE_QUICK_LAUNCH_CREATED_EVENT } from '../components/financeFloatingEvents';

const mocks = vi.hoisted(() => ({
  interpretAssistantCommand: vi.fn(),
  executeAssistantPlan: vi.fn(),
  settlePayable: vi.fn(),
  undoSettlePayable: vi.fn()
}));

vi.mock('../api', () => ({
  financeApi: {
    interpretAssistantCommand: mocks.interpretAssistantCommand,
    executeAssistantPlan: mocks.executeAssistantPlan,
    settlePayable: mocks.settlePayable,
    undoSettlePayable: mocks.undoSettlePayable
  }
}));

beforeEach(() => {
  mocks.interpretAssistantCommand.mockReset();
  mocks.executeAssistantPlan.mockReset();
  mocks.settlePayable.mockReset();
  mocks.undoSettlePayable.mockReset();
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
  mocks.settlePayable.mockResolvedValue({
    id: 'payable-1',
    status: 'paid',
    paid_amount_cents: 800000
  });
  mocks.undoSettlePayable.mockResolvedValue({
    id: 'payable-1',
    status: 'open',
    paid_amount_cents: 0
  });
});

function analysisPlan(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'plan-analysis-1',
    transcript: 'analise minhas categorias',
    surface_path: '/financeiro/reports',
    status: 'draft',
    mode: 'analysis',
    risk_level: 'low',
    requires_confirmation: false,
    human_summary: 'Analisei categorias e sugeri melhorias.',
    actions: [],
    answer: {
      title: 'Categorias e centros sugeridos',
      summary: 'Você tem categorias genéricas e pode separar Produto, Suporte e Administrativo.',
      primary_metric: {
        label: 'Sugestões',
        count: 3
      },
      breakdown: [
        {
          id: 'rec-produto',
          resource_type: 'recommendation',
          title: 'Produto',
          status: 'suggested',
          meta: ['Centro de custo sugerido'],
          available_actions: []
        }
      ],
      insights: ['Produto e suporte deveriam ser separados para melhorar DRE.'],
      suggested_actions: ['Criar centros sugeridos']
    },
    ...overrides
  };
}

test('FinanceWhisperFlow interprets a typed command and executes the confirmed plan', async () => {
  const user = userEvent.setup();
  const created = vi.fn();
  window.addEventListener(FINANCE_QUICK_LAUNCH_CREATED_EVENT, created);

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
    surface_path: '/financeiro/payables',
    conversation_context: []
  });
  expect(await screen.findByText('Criar conta a pagar de aluguel no valor de R$ 8.000,00.')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Confirmar e executar' }));

  await waitFor(() => expect(mocks.executeAssistantPlan).toHaveBeenCalledTimes(1));
  expect(mocks.executeAssistantPlan).toHaveBeenCalledWith('plan-whisper-1');
  expect(await screen.findByText('Plano executado.')).toBeInTheDocument();
  expect(created).toHaveBeenCalledTimes(1);
  expect(created.mock.calls[0]?.[0]).toMatchObject({
    detail: {
      type: 'payable',
      id: 'payable-1'
    }
  });

  await user.click(screen.getByRole('button', { name: 'Fechar Whisper Flow' }));
  await user.click(screen.getByRole('button', { name: 'Abrir Whisper Flow' }));

  expect(screen.getByLabelText('Comando do Whisper Flow')).toHaveValue('');
  expect(screen.queryByText('Plano executado.')).not.toBeInTheDocument();
  expect(screen.queryByText('Criar conta a pagar de aluguel no valor de R$ 8.000,00.')).not.toBeInTheDocument();

  window.removeEventListener(FINANCE_QUICK_LAUNCH_CREATED_EVENT, created);
});

test('FinanceWhisperFlow shows analytical answers with composition and direct undoable actions', async () => {
  const user = userEvent.setup();
  mocks.interpretAssistantCommand.mockResolvedValueOnce({
    id: 'plan-analysis-1',
    transcript: 'quanto tenho para pagar nos próximos 7 dias?',
    surface_path: '/financeiro/payables',
    status: 'draft',
    mode: 'analysis',
    risk_level: 'low',
    requires_confirmation: false,
    human_summary: 'Você tem R$ 15.900,00 a pagar nos próximos 7 dias em 3 contas.',
    actions: [],
    answer: {
      title: 'Contas a pagar nos próximos 7 dias',
      summary: 'Você tem R$ 15.900,00 a pagar nos próximos 7 dias em 3 contas.',
      primary_metric: {
        label: 'Total a pagar',
        amount_cents: 1590000,
        count: 3
      },
      breakdown: [
        {
          id: 'payable-1',
          resource_type: 'payable',
          title: 'Aluguel',
          amount_cents: 800000,
          due_date: '2026-04-27',
          status: 'open',
          meta: ['Administrativo', 'Despesas Operacionais'],
          available_actions: ['settle', 'partial', 'postpone']
        }
      ],
      insights: ['Aluguel é o maior impacto do período, com R$ 8.000,00.'],
      suggested_actions: ['Simular caixa']
    }
  });

  render(
    <MemoryRouter initialEntries={['/financeiro/payables']}>
      <FinanceWhisperFlow />
    </MemoryRouter>
  );

  await user.click(screen.getByRole('button', { name: 'Abrir Whisper Flow' }));
  await user.type(screen.getByLabelText('Comando do Whisper Flow'), 'quanto tenho para pagar nos próximos 7 dias?');
  await user.click(screen.getByRole('button', { name: 'Interpretar comando' }));

  expect(await screen.findByText('Contas a pagar nos próximos 7 dias')).toBeInTheDocument();
  expect(screen.getByText('R$ 15.900,00')).toBeInTheDocument();
  expect(screen.getByText('Aluguel')).toBeInTheDocument();
  expect(screen.getByText('Administrativo · Despesas Operacionais')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Baixar Aluguel' }));
  await waitFor(() => expect(mocks.settlePayable).toHaveBeenCalledWith('payable-1', {
    note: 'Baixa pelo Chat Financeiro.'
  }));
  expect(await screen.findByText('Baixado agora')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Desfazer baixa de Aluguel' }));
  await waitFor(() => expect(mocks.undoSettlePayable).toHaveBeenCalledWith('payable-1', {
    note: 'Baixa desfeita pelo Chat Financeiro.'
  }));
});

test('FinanceWhisperFlow keeps a continuous thread and sends prior context on follow-up', async () => {
  const user = userEvent.setup();
  mocks.interpretAssistantCommand
    .mockResolvedValueOnce(analysisPlan())
    .mockResolvedValueOnce({
      id: 'plan-create-centers',
      transcript: 'então crie',
      surface_path: '/financeiro/reports',
      status: 'draft',
      mode: 'hybrid',
      risk_level: 'medium',
      requires_confirmation: true,
      human_summary: 'Criar centro de custo Produto.',
      actions: [
        {
          id: 'action-cost-center-1',
          intent: 'create_cost_center',
          confidence: 0.91,
          risk_level: 'medium',
          requires_confirmation: true,
          requires_permission: 'finance.write',
          human_summary: 'Criar centro de custo Produto.',
          payload: { name: 'Produto' }
        }
      ]
    });

  render(
    <MemoryRouter initialEntries={['/financeiro/reports']}>
      <FinanceWhisperFlow />
    </MemoryRouter>
  );

  await user.click(screen.getByRole('button', { name: 'Abrir Whisper Flow' }));
  await user.type(screen.getByLabelText('Comando do Whisper Flow'), 'analise minhas categorias');
  await user.click(screen.getByRole('button', { name: 'Interpretar comando' }));

  expect(await screen.findByText('Categorias e centros sugeridos')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Continuar conversa financeira'), 'então crie');
  await user.click(screen.getByRole('button', { name: 'Enviar' }));

  await waitFor(() => expect(mocks.interpretAssistantCommand).toHaveBeenCalledTimes(2));
  expect(mocks.interpretAssistantCommand.mock.calls[1]?.[0]).toMatchObject({
    transcript: 'então crie',
    surface_path: '/financeiro/reports'
  });
  const secondContext = mocks.interpretAssistantCommand.mock.calls[1]?.[0].conversation_context;
  expect(secondContext).toEqual(expect.arrayContaining([
    expect.objectContaining({ role: 'user', content: 'analise minhas categorias' }),
    expect.objectContaining({ role: 'assistant', content: expect.stringContaining('Produto') })
  ]));
  expect(screen.getByText('analise minhas categorias')).toBeInTheDocument();
  expect(screen.getByText('então crie')).toBeInTheDocument();
  expect(screen.getAllByText('Criar centro de custo Produto.').length).toBeGreaterThan(0);
});

test('FinanceWhisperFlow sends contextual prompt when a suggested action is clicked', async () => {
  const user = userEvent.setup();
  mocks.interpretAssistantCommand
    .mockResolvedValueOnce(analysisPlan())
    .mockResolvedValueOnce(analysisPlan({
      id: 'plan-suggestion-follow-up',
      transcript: 'O usuário clicou na sugestão "Criar centros sugeridos" da sua resposta anterior.',
      human_summary: 'Preparei criação dos centros sugeridos.'
    }));

  render(
    <MemoryRouter initialEntries={['/financeiro/reports']}>
      <FinanceWhisperFlow />
    </MemoryRouter>
  );

  await user.click(screen.getByRole('button', { name: 'Abrir Whisper Flow' }));
  await user.type(screen.getByLabelText('Comando do Whisper Flow'), 'analise minhas categorias');
  await user.click(screen.getByRole('button', { name: 'Interpretar comando' }));

  await user.click(await screen.findByRole('button', { name: 'Criar centros sugeridos' }));

  await waitFor(() => expect(mocks.interpretAssistantCommand).toHaveBeenCalledTimes(2));
  const followUp = mocks.interpretAssistantCommand.mock.calls[1]?.[0].transcript;
  expect(followUp).toContain('O usuário clicou na sugestão "Criar centros sugeridos"');
  expect(followUp).toContain('Não repita a mesma pergunta');
  expect(followUp).toContain('Produto');
});
