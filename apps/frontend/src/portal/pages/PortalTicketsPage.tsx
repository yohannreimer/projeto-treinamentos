import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from 'react';
import type {
  CreatePortalTicketPayload,
  PortalAuthedApi,
  PortalRealtimeSide,
  PortalTicket,
  PortalTicketMessage,
  PortalTicketPriority,
  PortalTicketThreadResponse
} from '../types';

type PortalTicketsPageProps = {
  api: Pick<
    PortalAuthedApi,
    'tickets' | 'createTicket' | 'ticketThread' | 'createTicketMessage' | 'updateTicketWorkflow' | 'markTicketRead'
  >;
  isInternal: boolean;
  sessionToken?: string;
};

type WorkflowStage = 'Backlog' | 'A_fazer' | 'Em_andamento' | 'Concluido';

type DraftAttachment = {
  file_name: string;
  file_data_base64: string;
  size_bytes: number;
};

type ThreadRealtimeState = {
  unreadCount: number;
  lastReadAt: string | null;
  presence: {
    client_online?: boolean | null;
    holand_online?: boolean | null;
  };
  typing: {
    side?: PortalRealtimeSide | null;
    is_typing?: boolean | null;
    created_at?: string | null;
  };
};

type PortalSocketEvent =
  | { type: 'ready' }
  | { type: 'ticket_message_created'; ticket_id: string; message_id: string; author_side: PortalRealtimeSide; created_at: string }
  | { type: 'ticket_read'; ticket_id: string; side: PortalRealtimeSide; read_at: string }
  | { type: 'ticket_workflow_changed'; ticket_id: string; workflow_stage: string; updated_at: string }
  | { type: 'ticket_presence'; ticket_id: string; side: PortalRealtimeSide; online: boolean }
  | { type: 'ticket_typing'; ticket_id: string; side: PortalRealtimeSide; is_typing: boolean; created_at: string }
  | { type: 'error'; message: string };

const priorityOptions: PortalTicketPriority[] = ['Baixa', 'Normal', 'Alta', 'Critica'];
const workflowOptions: Array<{ value: WorkflowStage; label: string }> = [
  { value: 'Backlog', label: 'Backlog' },
  { value: 'A_fazer', label: 'A fazer' },
  { value: 'Em_andamento', label: 'Em andamento' },
  { value: 'Concluido', label: 'Concluído' }
];
const ATTACHMENT_MAX_BYTES = 8_000_000;
const MAX_ATTACHMENTS = 8;
const ACCEPTED_ATTACHMENT_TYPES = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt';
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const API_BASE_URL = env?.VITE_API_BASE_URL ?? `http://${window.location.hostname}:4000`;
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });

const emptyThreadRealtime: ThreadRealtimeState = {
  unreadCount: 0,
  lastReadAt: null,
  presence: {},
  typing: {}
};

function priorityTone(priority: PortalTicketPriority) {
  if (priority === 'Critica') return 'is-critical';
  if (priority === 'Alta') return 'is-warning';
  if (priority === 'Baixa') return 'is-muted';
  return 'is-progress';
}

function ticketStatusTone(status: string) {
  if (status === 'Resolvido') return 'is-success';
  if (status === 'Em execução') return 'is-progress';
  if (status === 'Aguardando cliente') return 'is-warning';
  if (status === 'Em análise') return 'is-analysis';
  if (status === 'Recebido') return 'is-received';
  return 'is-muted';
}

function workflowStageTone(stage?: string) {
  if (!stage) return 'is-muted';
  const normalized = stage.toLowerCase();
  if (normalized.includes('conclu')) return 'is-success';
  if (normalized.includes('andamento')) return 'is-progress';
  if (normalized.includes('fazer') || normalized.includes('backlog')) return 'is-analysis';
  return 'is-muted';
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`Não foi possível ler o arquivo "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

function formatDate(value?: string | null) {
  if (!value) return 'Sem data';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sem data';
  return dateFormatter.format(parsed);
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sem horário';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sem horário';
  return dateTimeFormatter.format(parsed);
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function workflowStageLabel(stage?: string | null) {
  if (!stage) return 'Sem etapa';
  const normalized = stage.replace(/_/g, ' ').trim();
  if (!normalized) return 'Sem etapa';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function sourceLabel(source: PortalTicket['source']) {
  return source === 'Portal' ? 'Cliente via portal' : 'Operação Holand';
}

function summarizeTicket(item: PortalTicket) {
  return item.realtime?.last_message_preview?.trim() || item.description?.trim() || 'Sem resumo adicional por enquanto.';
}

function normalizeContactPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return digits;
}

function resolveRealtimeApiBase(rawBaseUrl: string) {
  const trimmed = rawBaseUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const absolute = new URL(trimmed);
      return {
        protocol: absolute.protocol,
        host: absolute.host,
        pathPrefix: absolute.pathname.replace(/\/$/, '')
      };
    } catch {
      return {
        protocol: window.location.protocol,
        host: window.location.host,
        pathPrefix: ''
      };
    }
  }

  const normalizedPath = trimmed
    ? `/${trimmed.replace(/^\/+|\/+$/g, '')}`
    : '';

  return {
    protocol: window.location.protocol,
    host: window.location.host,
    pathPrefix: normalizedPath
  };
}

function makePortalWsUrl(sessionToken: string) {
  const base = resolveRealtimeApiBase(API_BASE_URL);
  const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsPath = `${base.pathPrefix}/portal/ws`.replace(/\/{2,}/g, '/');
  return `${protocol}//${base.host}${wsPath}?token=${encodeURIComponent(sessionToken)}`;
}

function presenceLabel(sideLabel: string, isOnline?: boolean | null) {
  if (isOnline === true) return `${sideLabel} online`;
  if (isOnline === false) return `${sideLabel} offline`;
  return `${sideLabel} aguardando presença`;
}

function typingLabel(typing: ThreadRealtimeState['typing']) {
  if (!typing.is_typing || !typing.side) return 'Sem digitação no momento';
  return typing.side === 'holand' ? 'Holand está digitando...' : 'Cliente está digitando...';
}

function initialWorkflowFromStage(stage?: string): WorkflowStage {
  const normalized = (stage ?? '').toLowerCase();
  if (normalized.includes('backlog')) return 'Backlog';
  if (normalized.includes('conclu')) return 'Concluido';
  if (normalized.includes('andamento')) return 'Em_andamento';
  return 'A_fazer';
}

function threadRealtimeFromResponse(response: PortalTicketThreadResponse): ThreadRealtimeState {
  const unreadFallback = response.has_unread ? 1 : 0;
  return {
    unreadCount: response.unread_count ?? unreadFallback,
    lastReadAt: response.last_read_at ?? response.last_read_cliente_at ?? response.last_read_holand_at ?? null,
    presence: {
      client_online: response.presence?.client_online ?? null,
      holand_online: response.presence?.holand_online ?? null
    },
    typing: {
      side: response.typing?.side ?? null,
      is_typing: response.typing?.is_typing ?? null,
      created_at: response.typing?.created_at ?? null
    }
  };
}

function hydrateTicketRealtime(ticket: PortalTicket) {
  if (ticket.realtime) return ticket;
  const fallbackUnread = (ticket as PortalTicket & { has_unread?: boolean }).has_unread ? 1 : 0;
  return {
    ...ticket,
    realtime: {
      unread_count: fallbackUnread,
      client_online: null,
      holand_online: null,
      typing_side: null,
      typing_at: null,
      last_message_preview: ticket.description
    }
  };
}

function sortTickets(items: PortalTicket[]) {
  const statusWeight = (ticket: PortalTicket) => {
    if (ticket.client_status === 'Resolvido') return 2;
    if (ticket.client_status === 'Aguardando cliente') return 1;
    return 0;
  };

  return [...items].sort((left, right) => {
    const weightDiff = statusWeight(left) - statusWeight(right);
    if (weightDiff !== 0) return weightDiff;
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  });
}

export function PortalTicketsPage({ api, isInternal, sessionToken }: PortalTicketsPageProps) {
  const [items, setItems] = useState<PortalTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [supportIntroText, setSupportIntroText] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [priority, setPriority] = useState<PortalTicketPriority>('Normal');
  const [createAttachments, setCreateAttachments] = useState<DraftAttachment[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<PortalTicketMessage[]>([]);
  const [threadNote, setThreadNote] = useState('');
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadSubmitting, setThreadSubmitting] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<DraftAttachment[]>([]);
  const [workflowByTicket, setWorkflowByTicket] = useState<Record<string, WorkflowStage>>({});
  const [workflowSavingTicketId, setWorkflowSavingTicketId] = useState<string | null>(null);
  const [threadRealtime, setThreadRealtime] = useState<ThreadRealtimeState>(emptyThreadRealtime);
  const latestThreadRequestRef = useRef(0);
  const selectedTicketIdRef = useRef<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const typingStopTimerRef = useRef<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await api.tickets();
      const nextItems = (response.items ?? []).map(hydrateTicketRealtime);
      setItems(nextItems);
      setSupportIntroText(response.support_intro_text?.trim() ?? '');
      setWorkflowByTicket(
        Object.fromEntries(nextItems.map((item) => [item.id, initialWorkflowFromStage(item.workflow_stage)]))
      );
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar a inbox de suporte.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api]);

  useEffect(() => {
    selectedTicketIdRef.current = selectedTicketId;
  }, [selectedTicketId]);

  useEffect(() => {
    if (!selectedTicketId) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeThread();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedTicketId]);

  useEffect(() => () => {
    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
  }, []);

  const sortedItems = useMemo(() => sortTickets(items), [items]);
  const selectedTicket = useMemo(
    () => items.find((item) => item.id === selectedTicketId) ?? null,
    [items, selectedTicketId]
  );
  const selectedIsReadonlyOperational = Boolean(selectedTicket && selectedTicket.id.startsWith('kcard-'));
  const openCount = useMemo(() => items.filter((item) => item.client_status !== 'Resolvido').length, [items]);
  const criticalCount = useMemo(() => items.filter((item) => item.priority === 'Critica' || item.priority === 'Alta').length, [items]);
  const unreadCount = useMemo(
    () => items.reduce((sum, item) => sum + Math.max(0, item.realtime?.unread_count ?? 0), 0),
    [items]
  );
  const realtimeReady = Boolean(sessionToken);
  const hasSelectedThread = Boolean(selectedTicketId);

  function sendSocketEvent(event: Record<string, unknown>) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(event));
  }

  useEffect(() => {
    if (!sessionToken || typeof WebSocket === 'undefined') return undefined;
    let socket: WebSocket;
    try {
      socket = new WebSocket(makePortalWsUrl(sessionToken));
    } catch {
      setError('Falha ao iniciar realtime da conversa. Recarregue a página.');
      return undefined;
    }
    socketRef.current = socket;

    socket.onmessage = (rawEvent) => {
      let payload: PortalSocketEvent | null = null;
      try {
        payload = JSON.parse(rawEvent.data as string) as PortalSocketEvent;
      } catch {
        return;
      }
      if (!payload) return;
      if (payload.type === 'ready') {
        if (selectedTicketIdRef.current) {
          sendSocketEvent({ type: 'join_ticket', ticket_id: selectedTicketIdRef.current });
        }
        return;
      }
      if (payload.type === 'error') return;

      if (payload.type === 'ticket_presence') {
        setItems((prev) => prev.map((item) => (
          item.id !== payload.ticket_id
            ? item
            : {
              ...item,
              realtime: {
                ...item.realtime,
                client_online: payload.side === 'cliente' ? payload.online : item.realtime?.client_online ?? null,
                holand_online: payload.side === 'holand' ? payload.online : item.realtime?.holand_online ?? null
              }
            }
        )));
        if (selectedTicketIdRef.current === payload.ticket_id) {
          setThreadRealtime((prev) => ({
            ...prev,
            presence: {
              ...prev.presence,
              client_online: payload.side === 'cliente' ? payload.online : prev.presence.client_online,
              holand_online: payload.side === 'holand' ? payload.online : prev.presence.holand_online
            }
          }));
        }
        return;
      }

      if (payload.type === 'ticket_typing') {
        setItems((prev) => prev.map((item) => (
          item.id !== payload.ticket_id
            ? item
            : {
              ...item,
              realtime: {
                ...item.realtime,
                typing_side: payload.is_typing ? payload.side : null,
                typing_at: payload.is_typing ? payload.created_at : null
              }
            }
        )));
        if (selectedTicketIdRef.current === payload.ticket_id) {
          setThreadRealtime((prev) => ({
            ...prev,
            typing: {
              side: payload.is_typing ? payload.side : null,
              is_typing: payload.is_typing,
              created_at: payload.created_at
            }
          }));
        }
        return;
      }

      if (payload.type === 'ticket_read') {
        setItems((prev) => prev.map((item) => (
          item.id !== payload.ticket_id
            ? item
            : {
              ...item,
              realtime: {
                ...item.realtime,
                unread_count: payload.side === 'cliente'
                  ? (item.realtime?.unread_count ?? 0)
                  : 0
              }
            }
        )));
        if (selectedTicketIdRef.current === payload.ticket_id) {
          setThreadRealtime((prev) => ({
            ...prev,
            unreadCount: payload.side === 'holand' ? 0 : prev.unreadCount,
            lastReadAt: payload.read_at
          }));
        }
        return;
      }

      if (
        payload.type === 'ticket_message_created'
        || payload.type === 'ticket_workflow_changed'
      ) {
        void load();
        if (selectedTicketIdRef.current === payload.ticket_id) {
          void loadThread(payload.ticket_id);
        }
      }
    };

    return () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      socket.close();
    };
  }, [sessionToken]);

  async function filesToDraftAttachments(files: FileList | null) {
    if (!files || files.length === 0) return [] as DraftAttachment[];
    const nextAttachments: DraftAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > ATTACHMENT_MAX_BYTES) {
        throw new Error(`Arquivo "${file.name}" excede 8 MB.`);
      }
      const fileDataUrl = await toDataUrl(file);
      nextAttachments.push({
        file_name: file.name,
        file_data_base64: fileDataUrl,
        size_bytes: file.size
      });
    }
    return nextAttachments;
  }

  async function onPickCreateAttachments(event: ChangeEvent<HTMLInputElement>) {
    try {
      const picked = await filesToDraftAttachments(event.target.files);
      setCreateAttachments((prev) => [...prev, ...picked].slice(0, MAX_ATTACHMENTS));
      setError('');
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'Falha ao anexar arquivo.');
    } finally {
      event.target.value = '';
    }
  }

  async function onPickReplyAttachments(event: ChangeEvent<HTMLInputElement>) {
    try {
      const picked = await filesToDraftAttachments(event.target.files);
      setReplyAttachments((prev) => [...prev, ...picked].slice(0, MAX_ATTACHMENTS));
      setError('');
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'Falha ao anexar arquivo.');
    } finally {
      event.target.value = '';
    }
  }

  async function loadThread(ticketId: string) {
    const requestId = latestThreadRequestRef.current + 1;
    latestThreadRequestRef.current = requestId;
    setThreadLoading(true);
    try {
      const response = await api.ticketThread(ticketId);
      if (latestThreadRequestRef.current !== requestId) return;
      setThreadMessages(response.messages ?? []);
      setThreadNote(response.note ?? '');
      setThreadRealtime(threadRealtimeFromResponse(response));
      setError('');
    } catch (threadError) {
      if (latestThreadRequestRef.current !== requestId) return;
      setError(threadError instanceof Error ? threadError.message : 'Falha ao carregar a conversa do suporte.');
    } finally {
      if (latestThreadRequestRef.current === requestId) {
        setThreadLoading(false);
      }
    }
  }

  async function markThreadAsRead(ticketId: string) {
    try {
      await api.markTicketRead(ticketId);
      setItems((prev) => prev.map((item) => (
        item.id !== ticketId
          ? item
          : { ...item, realtime: { ...item.realtime, unread_count: 0 } }
      )));
      setThreadRealtime((prev) => ({ ...prev, unreadCount: 0, lastReadAt: new Date().toISOString() }));
    } catch {
      // leitura silenciosa para não degradar UX de conversa
    }
  }

  async function openThread(ticketId: string) {
    if (selectedTicketId && selectedTicketId !== ticketId) {
      sendSocketEvent({ type: 'leave_ticket', ticket_id: selectedTicketId });
    }
    setSelectedTicketId(ticketId);
    setReplyBody('');
    setReplyAttachments([]);
    setThreadMessages([]);
    setThreadNote('');
    setThreadRealtime(emptyThreadRealtime);
    await loadThread(ticketId);
    sendSocketEvent({ type: 'join_ticket', ticket_id: ticketId });
    await markThreadAsRead(ticketId);
  }

  function closeThread() {
    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (selectedTicketId) {
      sendSocketEvent({ type: 'typing', ticket_id: selectedTicketId, is_typing: false });
    }
    if (selectedTicketId) {
      sendSocketEvent({ type: 'leave_ticket', ticket_id: selectedTicketId });
    }
    setSelectedTicketId(null);
    setThreadMessages([]);
    setThreadNote('');
    setReplyBody('');
    setReplyAttachments([]);
    setThreadRealtime(emptyThreadRealtime);
  }

  function emitTypingSignal(ticketId: string, isTyping: boolean) {
    sendSocketEvent({
      type: 'typing',
      ticket_id: ticketId,
      is_typing: isTyping
    });
  }

  function handleReplyBodyChange(value: string) {
    setReplyBody(value);
    if (!selectedTicketId) return;
    emitTypingSignal(selectedTicketId, value.trim().length > 0);
    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (!value.trim()) return;
    typingStopTimerRef.current = window.setTimeout(() => {
      emitTypingSignal(selectedTicketId, false);
      typingStopTimerRef.current = null;
    }, 1400);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError('Informe o assunto da solicitação.');
      return;
    }

    const normalizedContactPhone = normalizeContactPhone(contactPhone);
    if (contactPhone.trim() && (!normalizedContactPhone || normalizedContactPhone.length < 10)) {
      setError('Informe um WhatsApp válido com DDD, ou deixe o campo em branco.');
      return;
    }

    setSubmitting(true);
    const payload: CreatePortalTicketPayload = {
      title: title.trim(),
      description: description.trim() || null,
      whatsapp_number: normalizedContactPhone,
      priority,
      attachments: createAttachments.map((item) => ({
        file_name: item.file_name,
        file_data_base64: item.file_data_base64
      }))
    };

    try {
      const created = await api.createTicket(payload);
      setShowForm(false);
      setTitle('');
      setDescription('');
      setContactPhone('');
      setPriority('Normal');
      setCreateAttachments([]);
      await load();
      if (created?.id) {
        await openThread(created.id);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha ao criar solicitação de suporte.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicketId) return;
    if (!replyBody.trim() && replyAttachments.length === 0) {
      setError('Escreva uma mensagem ou adicione anexo.');
      return;
    }

    setThreadSubmitting(true);
    try {
      await api.createTicketMessage(selectedTicketId, {
        body: replyBody.trim() || null,
        attachments: replyAttachments.map((item) => ({
          file_name: item.file_name,
          file_data_base64: item.file_data_base64
        }))
      });
      emitTypingSignal(selectedTicketId, false);
      setReplyBody('');
      setReplyAttachments([]);
      await loadThread(selectedTicketId);
      await markThreadAsRead(selectedTicketId);
      await load();
      setError('');
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Falha ao enviar resposta no suporte.');
    } finally {
      setThreadSubmitting(false);
    }
  }

  async function updateTicketWorkflow(ticketId: string) {
    const workflowStage = workflowByTicket[ticketId] ?? 'A_fazer';
    setWorkflowSavingTicketId(ticketId);
    try {
      await api.updateTicketWorkflow(ticketId, { workflow_stage: workflowStage });
      await load();
      if (selectedTicketId === ticketId) {
        await loadThread(ticketId);
      }
      setError('');
    } catch (workflowError) {
      setError(workflowError instanceof Error ? workflowError.message : 'Falha ao atualizar etapa do suporte.');
    } finally {
      setWorkflowSavingTicketId(null);
    }
  }

  return (
    <section className="portal-panel portal-support-shell">
      <header className="portal-panel-header portal-panel-header-row portal-support-header">
        <div className="portal-support-heading">
          <span className="portal-support-kicker">Inbox premium Holand</span>
          <h2>Suporte com contexto, leitura clara e conversa contínua.</h2>
          <p>
            {supportIntroText || 'Abra solicitações, acompanhe a etapa do workflow e mantenha toda a conversa do atendimento no mesmo lugar.'}
          </p>
        </div>
        <div className="portal-support-header-actions">
          <span className={`portal-support-realtime-pill ${realtimeReady ? 'is-ready' : ''}`}>
            {realtimeReady ? 'Canal pronto para realtime' : 'Canal visual pronto para realtime'}
          </span>
          <button type="button" className="portal-primary-btn portal-support-cta" onClick={() => setShowForm((prev) => !prev)}>
            {showForm ? 'Fechar abertura' : 'Nova solicitação'}
          </button>
        </div>
      </header>

      <section className="portal-support-hero-grid">
        <article className="portal-support-hero-card portal-support-hero-card-primary">
          <span className="portal-support-card-label">Leitura rápida</span>
          <strong className="portal-support-metric">{openCount}</strong>
          <p>Solicitações ativas na sua fila com CTA direto para abrir a conversa.</p>
        </article>
        <article className="portal-support-hero-card">
          <span className="portal-support-card-label">Atenção</span>
          <strong className="portal-support-metric">{criticalCount}</strong>
          <p>Chamados com prioridade alta ou crítica para priorização imediata.</p>
        </article>
        <article className="portal-support-hero-card">
          <span className="portal-support-card-label">Não lidas</span>
          <strong className="portal-support-metric">{unreadCount}</strong>
          <p>Indicador preparado para unread mesmo quando a API ainda não preencher todos os sinais.</p>
        </article>
      </section>

      {showForm ? (
        <form className="portal-ticket-form portal-ticket-form-premium" onSubmit={submit}>
          <div className="portal-support-form-head">
            <div>
              <span className="portal-support-card-label">Abrir nova solicitação</span>
              <strong>Conte o contexto uma vez e deixe a thread nascer organizada.</strong>
            </div>
            <p className="form-hint">Anexe imagens ou documentos. O WhatsApp abaixo é opcional e serve como contato de apoio.</p>
          </div>
          <div className="portal-support-form-grid">
            <label>
              Assunto
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: acesso bloqueado para o time comercial"
              />
            </label>
            <label>
              Prioridade
              <select value={priority} onChange={(event) => setPriority(event.target.value as PortalTicketPriority)}>
                {priorityOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="portal-support-form-span-2">
              WhatsApp para retorno rápido (opcional)
              <input
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                inputMode="tel"
                placeholder="+55 47 99999-9999"
              />
            </label>
            <label className="portal-support-form-span-2">
              Descrição
              <textarea
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Explique o cenário, impacto, urgência e qualquer passo já tentado."
              />
            </label>
            <label className="portal-support-form-span-2">
              Anexos (imagem ou documento)
              <input type="file" accept={ACCEPTED_ATTACHMENT_TYPES} multiple onChange={onPickCreateAttachments} />
            </label>
          </div>
          {createAttachments.length > 0 ? (
            <div className="portal-ticket-attachments portal-ticket-attachments-premium">
              {createAttachments.map((attachment, index) => (
                <span key={`${attachment.file_name}-${index}`} className="portal-status-chip is-muted">
                  {attachment.file_name}
                  <small>{formatBytes(attachment.size_bytes)}</small>
                  <button
                    type="button"
                    className="portal-attachment-remove"
                    onClick={() => setCreateAttachments((prev) => prev.filter((_, current) => current !== index))}
                  >
                    remover
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="actions actions-compact">
            <button type="submit" className="portal-primary-btn" disabled={submitting}>
              {submitting ? 'Enviando...' : 'Criar solicitação'}
            </button>
            <button type="button" className="portal-secondary-btn" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p>Carregando inbox de suporte...</p> : null}

      {!loading ? (
        <div className="portal-support-layout">
          <div className="portal-support-column">
            <div className="portal-support-list-head">
              <div>
                <span className="portal-support-card-label">Fila de atendimento</span>
                <strong>{items.length === 0 ? 'Nenhuma solicitação ainda.' : `${items.length} solicitações na inbox`}</strong>
              </div>
              <span className="portal-support-list-note">Timestamps em PT-BR, badges claros e CTA de conversa sempre visível.</span>
            </div>

            <div className="portal-ticket-list portal-ticket-list-premium">
              {sortedItems.length === 0 ? (
                <div className="portal-empty-state portal-support-empty-state">
                  <strong>Nenhuma solicitação de suporte até agora.</strong>
                  <p>Use “Nova solicitação” para registrar a primeira demanda ao time Holand.</p>
                </div>
              ) : null}

              {sortedItems.map((item) => {
                const unread = Math.max(0, item.realtime?.unread_count ?? 0);
                const workflowStage = workflowByTicket[item.id] ?? initialWorkflowFromStage(item.workflow_stage);
                return (
                  <article
                    key={item.id}
                    className={`portal-ticket-item portal-ticket-item-premium ${selectedTicketId === item.id ? 'is-selected' : ''}`}
                  >
                    <div className="portal-ticket-main portal-ticket-main-premium">
                      <div className="portal-ticket-main-topline">
                        <span className="portal-support-thread-id">{item.id}</span>
                        <span className={`portal-support-presence-pill ${item.realtime?.holand_online ? 'is-online' : item.realtime?.holand_online === false ? 'is-offline' : ''}`}>
                          {presenceLabel('Holand', item.realtime?.holand_online)}
                        </span>
                      </div>
                      <strong>{item.title}</strong>
                      <p>{summarizeTicket(item)}</p>
                      <div className="portal-ticket-main-details">
                        <span>Atualizado em {formatDateTime(item.updated_at)}</span>
                        <span>Criado em {formatDate(item.created_at)}</span>
                        <span>{sourceLabel(item.source)}</span>
                      </div>
                    </div>

                    <div className="portal-ticket-meta portal-ticket-meta-premium">
                      <div className="portal-ticket-badges portal-ticket-badges-premium">
                        <span className={`portal-status-chip ${priorityTone(item.priority)}`}>Prioridade: {item.priority}</span>
                        <span className={`portal-status-chip ${workflowStageTone(item.workflow_stage)}`}>
                          Etapa: {workflowStageLabel(item.workflow_stage)}
                        </span>
                        <span className={`portal-status-chip ${ticketStatusTone(item.client_status)}`}>
                          Status: {item.client_status}
                        </span>
                        <span className={`portal-status-chip ${unread > 0 ? 'is-analysis' : 'is-muted'}`}>
                          {unread > 0 ? `${unread} não lida${unread > 1 ? 's' : ''}` : 'Sem novas'}
                        </span>
                      </div>
                      <div className="portal-ticket-realtime-strip">
                        <span className={`portal-support-typing-indicator ${(item.realtime?.typing_side ?? null) ? 'is-active' : ''}`}>
                          {item.realtime?.typing_side === 'holand'
                            ? 'Holand digitando'
                            : item.realtime?.typing_side === 'cliente'
                              ? 'Cliente digitando'
                              : 'Typing pronto'}
                        </span>
                      </div>
                      {isInternal ? (
                        <div className="portal-ticket-operator-inline">
                          <label>
                            Etapa interna
                            <select
                              aria-label={`Etapa interna de ${item.title}`}
                              value={workflowStage}
                              onChange={(event) => setWorkflowByTicket((prev) => ({
                                ...prev,
                                [item.id]: event.target.value as WorkflowStage
                              }))}
                            >
                              {workflowOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="portal-secondary-btn"
                            onClick={() => void updateTicketWorkflow(item.id)}
                            disabled={workflowSavingTicketId === item.id}
                          >
                            {workflowSavingTicketId === item.id ? 'Salvando...' : 'Aplicar etapa'}
                          </button>
                        </div>
                      ) : null}
                      <button type="button" className="portal-primary-btn" onClick={() => void openThread(item.id)}>
                        Abrir conversa
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="portal-support-sidecards">
            <article className="portal-support-sidecard">
              <span className="portal-support-card-label">Leitura lógica</span>
              <strong>Prioridade, etapa, status e origem aparecem sempre na mesma ordem.</strong>
              <p>Isso reduz o esforço para entender o momento de cada chamado, no desktop e no mobile.</p>
            </article>
            <article className="portal-support-sidecard">
              <span className="portal-support-card-label">Realtime-ready</span>
              <strong>{realtimeReady ? 'Sessão apta para presença e typing futuro.' : 'Estados visuais prontos para presença e typing.'}</strong>
              <p>Mesmo sem todos os sinais da API, a interface já reserva unread, presença e digitação de forma elegante.</p>
            </article>
            <article className="portal-support-sidecard">
              <span className="portal-support-card-label">Anexos preservados</span>
              <strong>Imagens e documentos continuam no fluxo.</strong>
              <p>O histórico da thread mantém CTA claro para download e resposta com contexto completo.</p>
            </article>
          </aside>
        </div>
      ) : null}

      {selectedTicket ? (
        <div className="portal-ticket-overlay" role="dialog" aria-modal="true" aria-labelledby="portal-ticket-overlay-title">
          <button type="button" className="portal-ticket-overlay-backdrop" aria-label="Fechar conversa" onClick={closeThread} />
          <section className="portal-ticket-overlay-panel">
            <header className="portal-ticket-overlay-header">
              <div className="portal-ticket-overlay-heading">
                <span className="portal-support-kicker">Conversa do suporte</span>
                <h3 id="portal-ticket-overlay-title">{selectedTicket.title}</h3>
                <p>
                  Thread organizada para responder rápido, acompanhar anexos e enxergar sinais de realtime sem ruído.
                </p>
              </div>
              <button type="button" className="portal-secondary-btn" onClick={closeThread}>
                Fechar
              </button>
            </header>

            <div className="portal-ticket-overlay-meta">
              <div className="portal-ticket-badges portal-ticket-badges-premium">
                <span className={`portal-status-chip ${priorityTone(selectedTicket.priority)}`}>Prioridade: {selectedTicket.priority}</span>
                <span className={`portal-status-chip ${workflowStageTone(selectedTicket.workflow_stage)}`}>
                  Etapa: {workflowStageLabel(selectedTicket.workflow_stage)}
                </span>
                <span className={`portal-status-chip ${ticketStatusTone(selectedTicket.client_status)}`}>
                  Status: {selectedTicket.client_status}
                </span>
                <span className={`portal-status-chip ${threadRealtime.unreadCount > 0 ? 'is-analysis' : 'is-muted'}`}>
                  {threadRealtime.unreadCount > 0
                    ? `${threadRealtime.unreadCount} não lida${threadRealtime.unreadCount > 1 ? 's' : ''}`
                    : 'Sem novas'}
                </span>
              </div>
              <div className="portal-ticket-overlay-realtime-row">
                <span className={`portal-support-presence-pill ${threadRealtime.presence.holand_online ? 'is-online' : threadRealtime.presence.holand_online === false ? 'is-offline' : ''}`}>
                  {presenceLabel('Holand', threadRealtime.presence.holand_online ?? selectedTicket.realtime?.holand_online ?? null)}
                </span>
                <span className={`portal-support-presence-pill ${threadRealtime.presence.client_online ? 'is-online' : threadRealtime.presence.client_online === false ? 'is-offline' : ''}`}>
                  {presenceLabel('Cliente', threadRealtime.presence.client_online ?? selectedTicket.realtime?.client_online ?? null)}
                </span>
                <span className={`portal-support-typing-indicator ${threadRealtime.typing.is_typing ? 'is-active' : ''}`}>
                  {typingLabel(threadRealtime.typing)}
                </span>
              </div>
            </div>

            <div className="portal-ticket-overlay-body">
              <div className="portal-ticket-conversation-column">
                {threadNote ? <p className="form-hint portal-thread-note">{threadNote}</p> : null}
                <div className="portal-ticket-thread-messages portal-ticket-thread-messages-premium">
                  {threadLoading ? <p>Carregando conversa...</p> : null}
                  {!threadLoading && threadMessages.length === 0 ? (
                    <div className="portal-empty-state portal-support-empty-state">
                      <strong>Nenhuma mensagem ainda.</strong>
                      <p>Use o composer abaixo para iniciar esta conversa com o time Holand.</p>
                    </div>
                  ) : null}
                  {threadMessages.map((message) => (
                    <article
                      key={message.id}
                      className={`portal-ticket-message portal-ticket-message-premium ${message.author_type === 'Holand' ? 'is-holand' : 'is-client'}`}
                    >
                      <div className="portal-ticket-message-avatar" aria-hidden="true">
                        {message.author_type === 'Holand' ? 'H' : 'C'}
                      </div>
                      <div className="portal-ticket-message-bubble">
                        <div className="portal-ticket-message-head">
                          <strong>{message.author_label || message.author_type}</strong>
                          <span>{formatDateTime(message.created_at)}</span>
                        </div>
                        <p>{message.body || 'Mensagem sem texto.'}</p>
                        {message.attachments.length > 0 ? (
                          <div className="portal-ticket-message-attachments">
                            {message.attachments.map((attachment) => (
                              <a
                                key={attachment.id}
                                href={`${API_BASE_URL}${attachment.download_url}`}
                                target="_blank"
                                rel="noreferrer"
                                className="portal-secondary-btn portal-ticket-attachment-link"
                              >
                                {attachment.file_name}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <aside className="portal-ticket-overlay-sidebar">
                <div className="portal-ticket-sidebar-card">
                  <span className="portal-support-card-label">Resumo do ticket</span>
                  <strong>{sourceLabel(selectedTicket.source)}</strong>
                  <p>{summarizeTicket(selectedTicket)}</p>
                  <div className="portal-ticket-sidebar-meta">
                    <span>Criado em {formatDateTime(selectedTicket.created_at)}</span>
                    <span>Atualizado em {formatDateTime(selectedTicket.updated_at)}</span>
                    <span>
                      {threadRealtime.lastReadAt
                        ? `Última leitura em ${formatDateTime(threadRealtime.lastReadAt)}`
                        : 'Última leitura aguardando sinal'}
                    </span>
                  </div>
                </div>

                <div className="portal-ticket-sidebar-card">
                  <span className="portal-support-card-label">Realtime visual</span>
                  <strong>Presença, typing e unread já têm lugar na interface.</strong>
                  <p>Quando a API começar a preencher esses campos, a conversa absorve o sinal sem precisar redesenhar a UX.</p>
                </div>

                {isInternal ? (
                  <div className="portal-ticket-sidebar-card portal-ticket-sidebar-card-operator">
                    <span className="portal-support-card-label">Controle interno</span>
                    <strong>Atualize a etapa do workflow com a mesma leitura premium.</strong>
                    <label>
                      Etapa do workflow
                      <select
                        value={workflowByTicket[selectedTicket.id] ?? initialWorkflowFromStage(selectedTicket.workflow_stage)}
                        onChange={(event) => setWorkflowByTicket((prev) => ({
                          ...prev,
                          [selectedTicket.id]: event.target.value as WorkflowStage
                        }))}
                      >
                        {workflowOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="portal-primary-btn"
                      onClick={() => void updateTicketWorkflow(selectedTicket.id)}
                      disabled={workflowSavingTicketId === selectedTicket.id}
                    >
                      {workflowSavingTicketId === selectedTicket.id ? 'Atualizando...' : 'Salvar etapa'}
                    </button>
                  </div>
                ) : null}
              </aside>
            </div>

            {!selectedIsReadonlyOperational ? (
              <form className="portal-ticket-form portal-ticket-form-reply" onSubmit={submitReply}>
                <div className="portal-support-form-head">
                  <div>
                    <span className="portal-support-card-label">Responder na thread</span>
                    <strong>Envie atualização, confirmação ou novo contexto.</strong>
                  </div>
                  <p className="form-hint">A conversa permanece encadeada, com anexos e timestamps locais.</p>
                </div>
                <label>
                  Nova mensagem
                  <textarea
                    rows={4}
                    value={replyBody}
                    onChange={(event) => handleReplyBodyChange(event.target.value)}
                    placeholder="Compartilhe a próxima ação, retorno do time ou validação do cliente."
                  />
                </label>
                <label>
                  Anexos
                  <input type="file" accept={ACCEPTED_ATTACHMENT_TYPES} multiple onChange={onPickReplyAttachments} />
                </label>
                {replyAttachments.length > 0 ? (
                  <div className="portal-ticket-attachments portal-ticket-attachments-premium">
                    {replyAttachments.map((attachment, index) => (
                      <span key={`${attachment.file_name}-${index}`} className="portal-status-chip is-muted">
                        {attachment.file_name}
                        <small>{formatBytes(attachment.size_bytes)}</small>
                        <button
                          type="button"
                          className="portal-attachment-remove"
                          onClick={() => setReplyAttachments((prev) => prev.filter((_, current) => current !== index))}
                        >
                          remover
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="actions actions-compact">
                  <button type="submit" className="portal-primary-btn" disabled={threadSubmitting}>
                    {threadSubmitting ? 'Enviando...' : 'Enviar resposta'}
                  </button>
                </div>
              </form>
            ) : (
              <p className="form-hint portal-thread-note">
                Este item veio da operação interna e fica em modo somente leitura no portal, mas o histórico visual continua acessível.
              </p>
            )}
          </section>
        </div>
      ) : null}

      {!hasSelectedThread ? (
        <div className="portal-support-overlay-hint" aria-hidden="true">
          <span className="portal-support-card-label">Popup overlay</span>
          <strong>Abra qualquer solicitação para ver a conversa em modo mensageria.</strong>
        </div>
      ) : null}
    </section>
  );
}
