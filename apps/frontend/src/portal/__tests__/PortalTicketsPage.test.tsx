import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { PortalTicketsPage } from '../pages/PortalTicketsPage';

function createFakeApi() {
  return {
    tickets: vi.fn(),
    createTicket: vi.fn().mockResolvedValue({ id: 'ptk-02' }),
    ticketThread: vi.fn().mockResolvedValue({ ticket_id: 'ptk-01', messages: [] }),
    createTicketMessage: vi.fn().mockResolvedValue({ id: 'ptmsg-01' }),
    updateTicketWorkflow: vi.fn().mockResolvedValue({ ok: true, workflow_stage: 'A_fazer' }),
    markTicketRead: vi.fn().mockResolvedValue({ ok: true, ticket_id: 'ptk-01', read_at: '2026-04-10T10:00:00.000Z' })
  };
}

test('abre o formulário premium e envia ticket com WhatsApp normalizado', async () => {
  const fakeApi = createFakeApi();
  fakeApi.tickets
    .mockResolvedValueOnce({
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
      ],
      support_intro_text: 'Canal oficial para dúvidas do time.'
    })
    .mockResolvedValueOnce({
      items: [
        {
          id: 'ptk-02',
          title: 'Novo chamado',
          description: 'Contexto enviado',
          priority: 'Alta',
          created_at: '2026-04-02T10:00:00.000Z',
          updated_at: '2026-04-02T10:00:00.000Z',
          client_status: 'Recebido',
          source: 'Portal'
        },
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
    });
  fakeApi.ticketThread.mockResolvedValueOnce({ ticket_id: 'ptk-02', messages: [] });

  render(<PortalTicketsPage api={fakeApi} isInternal={false} sessionToken="token-123" />);

  expect(await screen.findByText(/inbox premium holand/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /nova solicitação/i }));

  await userEvent.type(screen.getByLabelText(/assunto/i), 'Novo chamado');
  await userEvent.type(screen.getByLabelText(/whatsapp para retorno rápido/i), '+55 (47) 99999-9999');
  await userEvent.type(screen.getByLabelText(/descrição/i), 'Contexto enviado');
  await userEvent.click(screen.getByRole('button', { name: /criar solicitação/i }));

  await waitFor(() => {
    expect(fakeApi.createTicket).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Novo chamado',
      description: 'Contexto enviado',
      whatsapp_number: '5547999999999'
    }));
  });

  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText(/conversa do suporte/i)).toBeInTheDocument();
});

test('mantém o controle interno de workflow com ação refinada', async () => {
  const fakeApi = createFakeApi();
  fakeApi.tickets.mockResolvedValue({
    items: [
      {
        id: 'ptk-01',
        title: 'Chamado inicial',
        description: 'Detalhe',
        priority: 'Normal',
        created_at: '2026-04-01T10:00:00.000Z',
        updated_at: '2026-04-01T10:00:00.000Z',
        client_status: 'Em análise',
        workflow_stage: 'A fazer',
        source: 'Portal'
      }
    ]
  });
  fakeApi.updateTicketWorkflow.mockResolvedValue({ ok: true, workflow_stage: 'Concluido' });

  render(<PortalTicketsPage api={fakeApi} isInternal sessionToken="token-123" />);

  expect(await screen.findByText(/chamado inicial/i)).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText(/etapa interna de chamado inicial/i), 'Concluido');
  await userEvent.click(screen.getByRole('button', { name: /aplicar etapa/i }));

  await waitFor(() => {
    expect(fakeApi.updateTicketWorkflow).toHaveBeenCalledWith('ptk-01', { workflow_stage: 'Concluido' });
  });
});
