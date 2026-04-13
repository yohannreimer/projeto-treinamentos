import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { db } from '../db.js';
import { readPortalSessionByToken, type PortalSessionContext } from './auth.js';

type PortalRealtimeSide = 'holand' | 'cliente';
type PortalRealtimeEvent =
  | { type: 'ready' }
  | { type: 'ticket_message_created'; ticket_id: string; message_id: string; author_side: PortalRealtimeSide; created_at: string }
  | { type: 'ticket_read'; ticket_id: string; side: PortalRealtimeSide; read_at: string }
  | { type: 'ticket_workflow_changed'; ticket_id: string; workflow_stage: string; updated_at: string }
  | { type: 'ticket_presence'; ticket_id: string; side: PortalRealtimeSide; online: boolean }
  | { type: 'ticket_typing'; ticket_id: string; side: PortalRealtimeSide; is_typing: boolean; created_at: string }
  | { type: 'error'; message: string };

type IncomingClientEvent =
  | { type: 'subscribe_company' }
  | { type: 'unsubscribe_company' }
  | { type: 'join_ticket'; ticket_id: string }
  | { type: 'leave_ticket'; ticket_id: string }
  | { type: 'typing'; ticket_id: string; is_typing: boolean }
  | { type: 'ping' };

type ClientSocket = {
  send(data: string): void;
  on(event: 'message', listener: (buffer: Buffer) => void): void;
  on(event: 'close', listener: () => void): void;
  on(event: 'error', listener: () => void): void;
  close(code?: number): void;
};

type WsServer = {
  on(event: 'connection', listener: (socket: ClientSocket, request: IncomingMessage) => void): void;
};

type WsModule = {
  WebSocketServer: new (options: { server: HttpServer; path: string }) => WsServer;
};

type ClientState = {
  socket: ClientSocket;
  context: PortalSessionContext;
  side: PortalRealtimeSide;
  companySubscribed: boolean;
  tickets: Set<string>;
};

function parseTokenFromRequest(request: IncomingMessage): string | null {
  const host = request.headers.host || 'localhost';
  const url = request.url || '/';
  let parsed: URL;
  try {
    parsed = new URL(url, `http://${host}`);
  } catch {
    return null;
  }
  const token = parsed.searchParams.get('token');
  if (!token) return null;
  return token.trim() || null;
}

function canAccessTicket(context: PortalSessionContext, ticketId: string): boolean {
  const row = db.prepare(`
    select id
    from portal_ticket
    where id = ?
      and company_id = ?
    limit 1
  `).get(ticketId, context.company_id) as { id: string } | undefined;
  return Boolean(row);
}

function safeJsonParse(value: string): IncomingClientEvent | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.type === 'join_ticket' && typeof parsed.ticket_id === 'string') {
      return { type: 'join_ticket', ticket_id: parsed.ticket_id };
    }
    if (parsed.type === 'leave_ticket' && typeof parsed.ticket_id === 'string') {
      return { type: 'leave_ticket', ticket_id: parsed.ticket_id };
    }
    if (
      parsed.type === 'typing'
      && typeof parsed.ticket_id === 'string'
      && typeof parsed.is_typing === 'boolean'
    ) {
      return { type: 'typing', ticket_id: parsed.ticket_id, is_typing: parsed.is_typing };
    }
    if (parsed.type === 'ping') {
      return { type: 'ping' };
    }
    if (parsed.type === 'subscribe_company') {
      return { type: 'subscribe_company' };
    }
    if (parsed.type === 'unsubscribe_company') {
      return { type: 'unsubscribe_company' };
    }
  } catch {
    return null;
  }
  return null;
}

class PortalRealtimeHub {
  private clients = new Set<ClientState>();
  private byCompany = new Map<string, Set<ClientState>>();
  private byTicket = new Map<string, Set<ClientState>>();
  private presenceCounts = new Map<string, number>();

  attach(server: HttpServer) {
    // Lazy import to avoid loading ws during tests that do not need sockets.
    import('ws')
      .then((module) => this.startServer(server, module))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[portal-ws] failed to initialize:', message);
      });
  }

  private startServer(server: HttpServer, wsModule: WsModule) {
    const wss = new wsModule.WebSocketServer({
      server,
      path: '/portal/ws'
    });

    wss.on('connection', (socket, request) => {
      const token = parseTokenFromRequest(request);
      if (!token) {
        socket.close(4401);
        return;
      }
      const context = readPortalSessionByToken(token);
      if (!context) {
        socket.close(4401);
        return;
      }

      const client: ClientState = {
        socket,
        context,
        side: context.is_internal ? 'holand' : 'cliente',
        companySubscribed: false,
        tickets: new Set<string>()
      };

      this.clients.add(client);
      this.send(client, { type: 'ready' });

      socket.on('message', (buffer) => {
        const incoming = safeJsonParse(buffer.toString('utf8'));
        if (!incoming) {
          this.send(client, { type: 'error', message: 'Mensagem de socket inválida.' });
          return;
        }
        if (incoming.type === 'ping') {
          this.send(client, { type: 'ready' });
          return;
        }
        if (incoming.type === 'subscribe_company') {
          this.subscribeCompany(client);
          return;
        }
        if (incoming.type === 'unsubscribe_company') {
          this.unsubscribeCompany(client);
          return;
        }
        if (incoming.type === 'join_ticket') {
          this.joinTicket(client, incoming.ticket_id);
          return;
        }
        if (incoming.type === 'leave_ticket') {
          this.leaveTicket(client, incoming.ticket_id);
          return;
        }
        if (incoming.type === 'typing') {
          this.sendToTicket(client.context.company_id, incoming.ticket_id, {
            type: 'ticket_typing',
            ticket_id: incoming.ticket_id,
            side: client.side,
            is_typing: incoming.is_typing,
            created_at: new Date().toISOString()
          }, client);
        }
      });

      const teardown = () => {
        this.clients.delete(client);
        this.unsubscribeCompany(client);
        Array.from(client.tickets).forEach((ticketId) => this.leaveTicket(client, ticketId));
      };
      socket.on('close', teardown);
      socket.on('error', teardown);
    });
  }

  private presenceKey(ticketId: string, side: PortalRealtimeSide) {
    return `${ticketId}::${side}`;
  }

  private subscribeCompany(client: ClientState) {
    if (client.companySubscribed) return;
    client.companySubscribed = true;
    const room = this.byCompany.get(client.context.company_id) ?? new Set<ClientState>();
    room.add(client);
    this.byCompany.set(client.context.company_id, room);
  }

  private unsubscribeCompany(client: ClientState) {
    if (!client.companySubscribed) return;
    client.companySubscribed = false;
    const room = this.byCompany.get(client.context.company_id);
    if (!room) return;
    room.delete(client);
    if (room.size === 0) {
      this.byCompany.delete(client.context.company_id);
    }
  }

  private sendPresenceSnapshot(client: ClientState, ticketId: string) {
    const sides: PortalRealtimeSide[] = ['cliente', 'holand'];
    sides.forEach((side) => {
      const key = this.presenceKey(ticketId, side);
      const online = (this.presenceCounts.get(key) ?? 0) > 0;
      this.send(client, {
        type: 'ticket_presence',
        ticket_id: ticketId,
        side,
        online
      });
    });
  }

  private joinTicket(client: ClientState, ticketId: string) {
    if (!canAccessTicket(client.context, ticketId)) {
      this.send(client, { type: 'error', message: 'Acesso negado ao ticket.' });
      return;
    }
    if (client.tickets.has(ticketId)) {
      // Rejoin idempotente: mantém contagem, mas reenvia snapshot para evitar
      // perda visual de presença no frontend após reabrir thread.
      this.sendPresenceSnapshot(client, ticketId);
      return;
    }
    client.tickets.add(ticketId);
    const room = this.byTicket.get(ticketId) ?? new Set<ClientState>();
    room.add(client);
    this.byTicket.set(ticketId, room);

    const key = this.presenceKey(ticketId, client.side);
    const currentCount = this.presenceCounts.get(key) ?? 0;
    this.presenceCounts.set(key, currentCount + 1);
    if (currentCount === 0) {
      this.sendToTicket(client.context.company_id, ticketId, {
        type: 'ticket_presence',
        ticket_id: ticketId,
        side: client.side,
        online: true
      });
    }
    this.sendPresenceSnapshot(client, ticketId);
  }

  private leaveTicket(client: ClientState, ticketId: string) {
    if (!client.tickets.has(ticketId)) return;
    client.tickets.delete(ticketId);

    const room = this.byTicket.get(ticketId);
    if (room) {
      room.delete(client);
      if (room.size === 0) {
        this.byTicket.delete(ticketId);
      }
    }

    const key = this.presenceKey(ticketId, client.side);
    const currentCount = this.presenceCounts.get(key) ?? 0;
    const nextCount = Math.max(0, currentCount - 1);
    if (nextCount === 0) {
      this.presenceCounts.delete(key);
      this.sendToTicket(client.context.company_id, ticketId, {
        type: 'ticket_presence',
        ticket_id: ticketId,
        side: client.side,
        online: false
      });
      return;
    }
    this.presenceCounts.set(key, nextCount);
  }

  private send(client: ClientState, payload: PortalRealtimeEvent) {
    try {
      client.socket.send(JSON.stringify(payload));
    } catch {
      // Ignore socket send errors.
    }
  }

  private sendToTicket(companyId: string, ticketId: string, payload: PortalRealtimeEvent, exclude?: ClientState) {
    const room = this.byTicket.get(ticketId);
    if (!room || room.size === 0) return;
    room.forEach((client) => {
      if (exclude && client === exclude) return;
      if (client.context.company_id !== companyId) return;
      this.send(client, payload);
    });
  }

  private sendToCompany(companyId: string, payload: PortalRealtimeEvent, ticketId?: string) {
    const room = this.byCompany.get(companyId);
    if (!room || room.size === 0) return;
    room.forEach((client) => {
      if (ticketId && client.tickets.has(ticketId)) return;
      this.send(client, payload);
    });
  }

  emitMessageCreated(params: { companyId: string; ticketId: string; messageId: string; authorSide: PortalRealtimeSide; createdAt: string }) {
    const payload: PortalRealtimeEvent = {
      type: 'ticket_message_created',
      ticket_id: params.ticketId,
      message_id: params.messageId,
      author_side: params.authorSide,
      created_at: params.createdAt
    };
    this.sendToTicket(params.companyId, params.ticketId, payload);
    this.sendToCompany(params.companyId, payload, params.ticketId);
  }

  emitRead(params: { companyId: string; ticketId: string; side: PortalRealtimeSide; readAt: string }) {
    const payload: PortalRealtimeEvent = {
      type: 'ticket_read',
      ticket_id: params.ticketId,
      side: params.side,
      read_at: params.readAt
    };
    this.sendToTicket(params.companyId, params.ticketId, payload);
    this.sendToCompany(params.companyId, payload, params.ticketId);
  }

  emitWorkflowChanged(params: { companyId: string; ticketId: string; workflowStage: string; updatedAt: string }) {
    const payload: PortalRealtimeEvent = {
      type: 'ticket_workflow_changed',
      ticket_id: params.ticketId,
      workflow_stage: params.workflowStage,
      updated_at: params.updatedAt
    };
    this.sendToTicket(params.companyId, params.ticketId, payload);
    this.sendToCompany(params.companyId, payload, params.ticketId);
  }
}

export const portalRealtimeHub = new PortalRealtimeHub();
