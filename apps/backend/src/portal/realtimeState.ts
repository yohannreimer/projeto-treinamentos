export type PortalRealtimeSide = 'cliente' | 'holand';

type PresenceRecord = {
  lastSeenAtMs: number;
};

type TypingRecord = {
  createdAtMs: number;
  expiresAtMs: number;
};

type TicketRealtimeSnapshot = {
  presence: {
    client_online: boolean;
    holand_online: boolean;
  };
  typing: {
    side: PortalRealtimeSide | null;
    is_typing: boolean;
    created_at: string | null;
  };
};

const PRESENCE_TTL_MS = 16_000;
const TYPING_TTL_MS = 5_000;

const presenceStore = new Map<string, PresenceRecord>();
const typingStore = new Map<string, TypingRecord>();

function makeKey(companyId: string, ticketId: string, side: PortalRealtimeSide) {
  return `${companyId}::${ticketId}::${side}`;
}

function pruneExpired(nowMs: number) {
  for (const [key, record] of presenceStore.entries()) {
    if (nowMs - record.lastSeenAtMs > PRESENCE_TTL_MS) {
      presenceStore.delete(key);
    }
  }

  for (const [key, record] of typingStore.entries()) {
    if (record.expiresAtMs <= nowMs) {
      typingStore.delete(key);
    }
  }
}

export function touchPortalPresence(params: {
  companyId: string;
  ticketId: string;
  side: PortalRealtimeSide;
  active?: boolean;
  nowMs?: number;
}) {
  const nowMs = params.nowMs ?? Date.now();
  pruneExpired(nowMs);
  const key = makeKey(params.companyId, params.ticketId, params.side);

  if (params.active === false) {
    presenceStore.delete(key);
    typingStore.delete(key);
    return;
  }

  presenceStore.set(key, { lastSeenAtMs: nowMs });
}

export function setPortalTypingState(params: {
  companyId: string;
  ticketId: string;
  side: PortalRealtimeSide;
  isTyping: boolean;
  nowMs?: number;
}) {
  const nowMs = params.nowMs ?? Date.now();
  pruneExpired(nowMs);
  const key = makeKey(params.companyId, params.ticketId, params.side);

  if (!params.isTyping) {
    typingStore.delete(key);
    return;
  }

  typingStore.set(key, {
    createdAtMs: nowMs,
    expiresAtMs: nowMs + TYPING_TTL_MS
  });
}

export function readPortalRealtimeSnapshot(params: {
  companyId: string;
  ticketId: string;
  nowMs?: number;
}): TicketRealtimeSnapshot {
  const nowMs = params.nowMs ?? Date.now();
  pruneExpired(nowMs);

  const clientPresence = presenceStore.get(makeKey(params.companyId, params.ticketId, 'cliente'));
  const holandPresence = presenceStore.get(makeKey(params.companyId, params.ticketId, 'holand'));
  const clientTyping = typingStore.get(makeKey(params.companyId, params.ticketId, 'cliente'));
  const holandTyping = typingStore.get(makeKey(params.companyId, params.ticketId, 'holand'));

  let typingSide: PortalRealtimeSide | null = null;
  let typingCreatedAt: string | null = null;

  if (clientTyping && holandTyping) {
    typingSide = clientTyping.createdAtMs >= holandTyping.createdAtMs ? 'cliente' : 'holand';
  } else if (clientTyping) {
    typingSide = 'cliente';
  } else if (holandTyping) {
    typingSide = 'holand';
  }

  if (typingSide === 'cliente' && clientTyping) {
    typingCreatedAt = new Date(clientTyping.createdAtMs).toISOString();
  } else if (typingSide === 'holand' && holandTyping) {
    typingCreatedAt = new Date(holandTyping.createdAtMs).toISOString();
  }

  return {
    presence: {
      client_online: Boolean(clientPresence),
      holand_online: Boolean(holandPresence)
    },
    typing: {
      side: typingSide,
      is_typing: Boolean(typingSide),
      created_at: typingCreatedAt
    }
  };
}

