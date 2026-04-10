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
          client_status: 'Recebido'
        }
      ]
    }),
    createTicket: vi.fn().mockResolvedValue({ id: 'ptk-02' })
  };

  render(<PortalTicketsPage api={fakeApi} />);

  expect(await screen.findByText(/chamados/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /novo chamado/i }));
  expect(screen.getByLabelText(/assunto/i)).toBeInTheDocument();
});
