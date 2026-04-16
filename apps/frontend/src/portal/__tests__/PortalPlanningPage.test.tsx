import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { PortalPlanningPage } from '../pages/PortalPlanningPage';
import type { PortalAuthedApi } from '../types';

function createPlanningApi(overrides?: {
  planning?: ReturnType<typeof vi.fn>;
}) {
  const api = {
    me: vi.fn(),
    overview: vi.fn(),
    planning: overrides?.planning ?? vi.fn().mockResolvedValue({
      items: [],
      hours_summary: null
    }),
    agenda: vi.fn(),
    operatorDisplaySettings: vi.fn().mockResolvedValue({
      support_intro_text: null,
      hidden_module_ids: [],
      module_date_overrides: [],
      module_status_overrides: []
    }),
    updateOperatorDisplaySettings: vi.fn().mockResolvedValue({ ok: true }),
    operatorAgendaItems: vi.fn(),
    createOperatorAgendaItem: vi.fn(),
    deleteOperatorAgendaItem: vi.fn(),
    updateTicketWorkflow: vi.fn(),
    tickets: vi.fn(),
    ticketThread: vi.fn(),
    createTicket: vi.fn(),
    createTicketMessage: vi.fn(),
    markTicketRead: vi.fn(),
    ticketRealtimeHeartbeat: vi.fn()
  };
  return api as unknown as PortalAuthedApi;
}

test('renderiza card de banco de horas no planejamento do portal', async () => {
  const api = createPlanningApi({
    planning: vi.fn().mockResolvedValue({
      items: [
        {
          company_id: 'comp-01',
          module_id: 'mod-01',
          module_code: '020101020',
          module_name: 'Treinamento TopSolid Cam 2D',
          status: 'Planejado',
          completed_at: null
        }
      ],
      hours_summary: {
        available_hours: 80,
        consumed_hours: 40,
        balance_hours: 40,
        remaining_diarias: 5
      }
    })
  });

  render(<PortalPlanningPage api={api} isInternal={false} />);

  expect(await screen.findByText(/banco de horas/i)).toBeInTheDocument();
  expect(screen.getByText('40 h de saldo disponível')).toBeInTheDocument();
  expect(screen.getByText('80 h')).toBeInTheDocument();
  expect(screen.getByText(/Diárias restantes/i)).toBeInTheDocument();
  expect(screen.getByText(/Treinamento TopSolid Cam 2D/i)).toBeInTheDocument();
});

test('aplica fallback quando hours_summary não vier no payload', async () => {
  const api = createPlanningApi({
    planning: vi.fn().mockResolvedValue({
      items: [],
      hours_summary: null
    })
  });

  render(<PortalPlanningPage api={api} isInternal={false} />);

  expect(await screen.findByText('0 h de saldo disponível')).toBeInTheDocument();
});
