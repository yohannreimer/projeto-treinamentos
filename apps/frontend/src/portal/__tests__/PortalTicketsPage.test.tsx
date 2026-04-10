import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test, expect, vi } from 'vitest';
import { PortalTicketsPage } from '../pages/PortalTicketsPage';

test('renders ticket list and opens new ticket form', async () => {
  const fakeApi = {
    tickets: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'ptk-01',
          title: 'Chamado inicial',
          description: 'Detalhe',
          priority: 'Normal',
          created_at: '2026-04-01T10:00:00.000Z',
          updated_at: '2026-04-01T10:00:00.000Z',
          client_status: 'Recebido',
          source: 'Portal'
        }
      ]
    }),
    createTicket: vi.fn().mockResolvedValue({ id: 'ptk-02' }),
    ticketThread: vi.fn().mockResolvedValue({ ticket_id: 'ptk-01', messages: [] }),
    createTicketMessage: vi.fn().mockResolvedValue({ id: 'ptmsg-01' })
  };

  render(<PortalTicketsPage api={fakeApi} />);

  expect(await screen.findByText(/suporte/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /nova solicitação/i }));
  expect(screen.getByLabelText(/assunto/i)).toBeInTheDocument();
});
