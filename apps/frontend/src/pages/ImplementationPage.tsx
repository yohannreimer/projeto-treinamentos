import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { Section } from '../components/Section';
import { api } from '../services/api';
import { askDestructiveConfirmation } from '../utils/destructive';
import holandSeloIcon from '../assets/holand-selo.svg';

type KanbanPriority = 'Alta' | 'Normal' | 'Baixa' | 'Critica';
type KanbanSubcategory = 'Pre_vendas' | 'Pos_vendas' | 'Suporte' | 'Implementacao';
type KanbanSupportHandoffTarget = 'Conosco' | 'Sao_Paulo';
type KanbanBoardMode = 'implementation' | 'support';

const KANBAN_PRIORITY_OPTIONS: KanbanPriority[] = ['Alta', 'Normal', 'Baixa', 'Critica'];
const KANBAN_SUBCATEGORY_OPTIONS_IMPLEMENTATION: Exclude<KanbanSubcategory, 'Suporte'>[] = ['Pre_vendas', 'Pos_vendas', 'Implementacao'];
const KANBAN_IMAGE_MAX_BYTES = 750_000;
const KANBAN_FILE_MAX_BYTES = 8_000_000;
const KANBAN_CONVERSATION_MAX_ATTACHMENTS = 8;
const KANBAN_FILTERS_COLLAPSED_STORAGE_KEY = 'orquestrador_kanban_filters_collapsed_v1';
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const API_BASE_URL = env?.VITE_API_BASE_URL ?? `http://${window.location.hostname}:4000`;
const KANBAN_REALTIME_ENABLED = env?.VITE_PORTAL_REALTIME !== '0';

type KanbanCard = {
  id: string;
  title: string;
  description: string | null;
  column_id: string | null;
  client_name: string | null;
  license_name: string | null;
  technician_id: string | null;
  subcategory: KanbanSubcategory | null;
  support_resolution: string | null;
  support_third_party_notes: string | null;
  support_handoff_target: KanbanSupportHandoffTarget | null;
  support_handoff_date: string | null;
  support_alert_level: 'none' | 'stale' | 'done';
  support_alert_message: string | null;
  support_ticket_id: string | null;
  support_unread_count: number;
  priority: KanbanPriority;
  due_date: string | null;
  attachment_image_data_url: string | null;
  attachment_file_name: string | null;
  attachment_file_data_base64: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

type KanbanColumn = {
  id: string;
  title: string;
  color: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  cards: KanbanCard[];
};

type ColumnDraft = {
  isOpen: boolean;
  title: string;
  description: string;
};

const defaultColumnDraft: ColumnDraft = {
  isOpen: false,
  title: '',
  description: ''
};

type CardDetailDraft = {
  cardId: string;
  title: string;
  description: string;
  client_name: string;
  license_name: string;
  technician_id: string;
  subcategory: KanbanSubcategory | '';
  support_resolution: string;
  support_third_party_notes: string;
  support_handoff_target: KanbanSupportHandoffTarget | '';
  support_handoff_date: string;
  priority: KanbanPriority;
  due_date: string;
  attachment_image_data_url: string | null;
  attachment_file_name: string;
  attachment_file_data_base64: string | null;
} | null;

type ConversationAttachmentDraft = {
  file_name: string;
  file_data_base64: string;
  size_bytes: number;
};

type ConversationMessage = {
  id: string;
  author_type: 'Cliente' | 'Holand';
  author_label: string | null;
  body: string | null;
  created_at: string;
  attachments: Array<{
    id: string;
    file_name: string;
    mime_type: string;
    file_size_bytes: number;
    created_at: string;
  }>;
};

type PortalRealtimeSide = 'cliente' | 'holand';
type ConversationRealtimeState = {
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

type ConversationSocketEvent =
  | { type: 'ready' }
  | { type: 'ticket_message_created'; ticket_id: string; message_id: string; author_side: PortalRealtimeSide; created_at: string }
  | { type: 'ticket_read'; ticket_id: string; side: PortalRealtimeSide; read_at: string }
  | { type: 'ticket_workflow_changed'; ticket_id: string; workflow_stage: string; updated_at: string }
  | { type: 'ticket_presence'; ticket_id: string; side: PortalRealtimeSide; online: boolean }
  | { type: 'ticket_typing'; ticket_id: string; side: PortalRealtimeSide; is_typing: boolean; created_at: string }
  | { type: 'error'; message: string };

const emptyConversationRealtime: ConversationRealtimeState = {
  unreadCount: 0,
  lastReadAt: null,
  presence: {},
  typing: {}
};

type ClientOption = {
  id: string;
  name: string;
};

type LicenseProgramOption = {
  id: string;
  name: string;
};

type TechnicianOption = {
  id: string;
  name: string;
};

function cardDetailFromCard(card: KanbanCard): Exclude<CardDetailDraft, null> {
  return {
    cardId: card.id,
    title: card.title,
    description: card.description ?? '',
    client_name: card.client_name ?? '',
    license_name: card.license_name ?? '',
    technician_id: card.technician_id ?? '',
    subcategory: card.subcategory ?? '',
    support_resolution: card.support_resolution ?? '',
    support_third_party_notes: card.support_third_party_notes ?? '',
    support_handoff_target: card.support_handoff_target ?? '',
    support_handoff_date: card.support_handoff_date ?? '',
    priority: card.priority ?? 'Normal',
    due_date: card.due_date ?? '',
    attachment_image_data_url: card.attachment_image_data_url ?? null,
    attachment_file_name: card.attachment_file_name ?? '',
    attachment_file_data_base64: card.attachment_file_data_base64 ?? null
  };
}

function subcategoryLabel(value?: KanbanSubcategory | '' | null): string {
  if (!value) return '-';
  if (value === 'Pre_vendas') return 'Pré-vendas';
  if (value === 'Pos_vendas') return 'Pós-vendas';
  if (value === 'Implementacao') return 'Implementação';
  return 'Suporte';
}

function isSupportCard(card: Pick<KanbanCard, 'subcategory'>): boolean {
  return card.subcategory === 'Suporte';
}

function cardMatchesBoardMode(card: Pick<KanbanCard, 'subcategory'>, boardMode: KanbanBoardMode): boolean {
  if (boardMode === 'support') {
    return isSupportCard(card);
  }
  return !isSupportCard(card);
}

function formatDateBr(dateIso?: string | null): string {
  if (!dateIso) return '-';
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateIso;
  return date.toLocaleDateString('pt-BR');
}

function formatDateTimeBr(dateIso?: string | null): string {
  if (!dateIso) return '-';
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return parsed.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

function todayIsoLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dataUrlSizeBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? '';
  if (!base64) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function resolveRealtimeApiBase(rawBaseUrl: string) {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) {
    return {
      protocol: window.location.protocol,
      host: window.location.host,
      pathPrefix: ''
    };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const absolute = new URL(trimmed);
      return {
        protocol: absolute.protocol,
        host: absolute.host,
        pathPrefix: absolute.pathname === '/' ? '' : absolute.pathname.replace(/\/+$/g, '')
      };
    } catch {
      return {
        protocol: window.location.protocol,
        host: window.location.host,
        pathPrefix: ''
      };
    }
  }

  return {
    protocol: window.location.protocol,
    host: window.location.host,
    pathPrefix: `/${trimmed.replace(/^\/+|\/+$/g, '')}`
  };
}

function makePortalWsUrls(sessionToken: string) {
  const base = resolveRealtimeApiBase(API_BASE_URL);
  const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  const tokenParam = `token=${encodeURIComponent(sessionToken)}`;
  const candidates: string[] = [];
  if (window.location.port === '5173') {
    candidates.push(`${protocol}//${window.location.hostname}:4000/portal/ws?${tokenParam}`);
    candidates.push(`${protocol}//${window.location.hostname}:4010/portal/ws?${tokenParam}`);
  }
  if (base.pathPrefix) {
    candidates.push(`${protocol}//${base.host}${base.pathPrefix}/portal/ws?${tokenParam}`);
  }
  candidates.push(`${protocol}//${base.host}/portal/ws?${tokenParam}`);
  return Array.from(new Set(candidates));
}

function presenceTone(online: boolean | null | undefined) {
  if (online === true) return 'is-online';
  if (online === false) return 'is-offline';
  return 'is-muted';
}

type ImplementationPageProps = {
  boardMode?: KanbanBoardMode;
};

type LoadConversationOptions = {
  autoScrollOnLoad?: boolean;
  background?: boolean;
};

export function ImplementationPage({ boardMode = 'implementation' }: ImplementationPageProps) {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [columnDrafts, setColumnDrafts] = useState<Record<string, ColumnDraft>>({});
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [newColumnColor, setNewColumnColor] = useState('#7b8ea8');
  const [isConfigCollapsed, setIsConfigCollapsed] = useState(true);
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState<boolean>(() => {
    const saved = window.localStorage.getItem(KANBAN_FILTERS_COLLAPSED_STORAGE_KEY);
    if (saved === '0') return false;
    return true;
  });

  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [licenseProgramOptions, setLicenseProgramOptions] = useState<LicenseProgramOption[]>([]);
  const [technicianOptions, setTechnicianOptions] = useState<TechnicianOption[]>([]);

  const [cardDetail, setCardDetail] = useState<CardDetailDraft>(null);
  const [isSavingCardDetail, setIsSavingCardDetail] = useState(false);
  const [conversationCard, setConversationCard] = useState<KanbanCard | null>(null);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [conversationTicketId, setConversationTicketId] = useState<string | null>(null);
  const [conversationNote, setConversationNote] = useState('');
  const [conversationUnreadCount, setConversationUnreadCount] = useState(0);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationSubmitting, setConversationSubmitting] = useState(false);
  const [conversationReply, setConversationReply] = useState('');
  const [conversationAttachments, setConversationAttachments] = useState<ConversationAttachmentDraft[]>([]);
  const [conversationError, setConversationError] = useState('');
  const [conversationRealtimeToken, setConversationRealtimeToken] = useState<string | null>(null);
  const [conversationRealtime, setConversationRealtime] = useState<ConversationRealtimeState>(emptyConversationRealtime);
  const [showConversationJumpToLatest, setShowConversationJumpToLatest] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [filterClientName, setFilterClientName] = useState('');
  const [filterTechnicianId, setFilterTechnicianId] = useState('');
  const [filterPriority, setFilterPriority] = useState<'ALL' | KanbanPriority>('ALL');
  const [filterDueFrom, setFilterDueFrom] = useState('');
  const [filterDueTo, setFilterDueTo] = useState('');
  const selectedConversationCardIdRef = useRef<string | null>(null);
  const selectedConversationTicketIdRef = useRef<string | null>(null);
  const joinedConversationTicketIdRef = useRef<string | null>(null);
  const conversationSocketRef = useRef<WebSocket | null>(null);
  const conversationTypingStopTimerRef = useRef<number | null>(null);
  const conversationReconnectTimerRef = useRef<number | null>(null);
  const conversationMessagesContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollConversationRef = useRef(false);

  async function loadBoard() {
    const response = await api.implementationKanban() as { columns: KanbanColumn[] };
    const loadedColumns = (response.columns ?? [])
      .map((column) => ({
        ...column,
        cards: (column.cards ?? []).map((card) => ({
          ...card,
          support_ticket_id: card.support_ticket_id ?? null,
          support_unread_count: Math.max(0, Number(card.support_unread_count ?? 0))
        }))
      }))
      .sort((a, b) => a.position - b.position);
    setColumns(loadedColumns);
    setConversationCard((prev) => {
      if (!prev) return prev;
      const refreshed = loadedColumns
        .flatMap((column) => column.cards)
        .find((card) => card.id === prev.id);
      return refreshed ?? prev;
    });
    return loadedColumns;
  }

  async function loadOptions() {
    const [companies, licensePrograms, technicians] = await Promise.all([
      api.companies() as Promise<Array<{ id: string; name: string }>>,
      api.licensePrograms() as Promise<Array<{ id: string; name: string }>>,
      api.technicians() as Promise<Array<{ id: string; name: string }>>
    ]);

    setClientOptions((companies ?? [])
      .map((company) => ({ id: company.id, name: company.name }))
      .sort((a, b) => a.name.localeCompare(b.name)));

    setLicenseProgramOptions((licensePrograms ?? [])
      .map((program) => ({ id: program.id, name: program.name }))
      .sort((a, b) => a.name.localeCompare(b.name)));

    setTechnicianOptions((technicians ?? [])
      .map((technician) => ({ id: technician.id, name: technician.name }))
      .sort((a, b) => a.name.localeCompare(b.name)));
  }

  function patchCardConversationMeta(cardId: string, patch: Partial<Pick<KanbanCard, 'support_unread_count' | 'support_ticket_id'>>) {
    setColumns((prev) => prev.map((column) => ({
      ...column,
      cards: column.cards.map((card) => (
        card.id === cardId
          ? {
            ...card,
            support_unread_count: Object.prototype.hasOwnProperty.call(patch, 'support_unread_count')
              ? Math.max(0, patch.support_unread_count ?? 0)
              : card.support_unread_count,
            support_ticket_id: Object.prototype.hasOwnProperty.call(patch, 'support_ticket_id')
              ? (patch.support_ticket_id ?? null)
              : card.support_ticket_id
          }
          : card
      ))
    })));
  }

  async function loadConversation(cardId: string, options?: LoadConversationOptions) {
    const background = options?.background === true;
    if (!background) {
      setConversationLoading(true);
      setConversationError('');
    }
    try {
      const response = await api.implementationKanbanConversation(cardId) as {
        linked: boolean;
        ticket_id: string | null;
        unread_count: number;
        note?: string;
        messages: ConversationMessage[];
      };
      setConversationTicketId(response.ticket_id ?? null);
      selectedConversationTicketIdRef.current = response.ticket_id ?? null;
      setConversationNote(response.note ?? '');
      setConversationUnreadCount(Math.max(0, response.unread_count ?? 0));
      setConversationRealtime((prev) => ({
        ...prev,
        unreadCount: Math.max(0, response.unread_count ?? 0)
      }));
      if (options?.autoScrollOnLoad) {
        shouldAutoScrollConversationRef.current = true;
      }
      setConversationMessages(response.messages ?? []);
      patchCardConversationMeta(cardId, {
        support_ticket_id: response.ticket_id ?? null,
        support_unread_count: Math.max(0, response.unread_count ?? 0)
      });
      return response;
    } catch (loadError) {
      if (!background) {
        setConversationError(loadError instanceof Error ? loadError.message : 'Falha ao carregar a conversa.');
        setConversationMessages([]);
        setConversationTicketId(null);
        selectedConversationTicketIdRef.current = null;
        setConversationUnreadCount(0);
        setConversationRealtime((prev) => ({ ...prev, unreadCount: 0 }));
      }
      return null;
    } finally {
      if (!background) {
        setConversationLoading(false);
      }
    }
  }

  async function markConversationAsRead(cardId: string) {
    try {
      await api.markImplementationKanbanConversationRead(cardId);
      setConversationUnreadCount(0);
      setConversationRealtime((prev) => ({
        ...prev,
        unreadCount: 0,
        lastReadAt: new Date().toISOString()
      }));
      patchCardConversationMeta(cardId, { support_unread_count: 0 });
    } catch {
      // leitura silenciosa para não atrapalhar o operador
    }
  }

  async function loadConversationRealtimeSession(cardId: string) {
    try {
      const response = await api.implementationKanbanConversationRealtimeSession(cardId) as {
        linked: boolean;
        ticket_id: string | null;
        realtime_token: string;
        expires_at: string;
      };
      setConversationRealtimeToken(response.realtime_token ?? null);
      if (response.ticket_id) {
        setConversationTicketId(response.ticket_id);
        selectedConversationTicketIdRef.current = response.ticket_id;
      }
      return response;
    } catch {
      setConversationRealtimeToken(null);
      return null;
    }
  }

  async function openConversation(card: KanbanCard) {
    shouldAutoScrollConversationRef.current = true;
    setShowConversationJumpToLatest(false);
    setConversationCard(card);
    setConversationReply('');
    setConversationAttachments([]);
    setConversationMessages([]);
    setConversationTicketId(card.support_ticket_id ?? null);
    selectedConversationTicketIdRef.current = card.support_ticket_id ?? null;
    setConversationUnreadCount(Math.max(0, card.support_unread_count ?? 0));
    setConversationNote('');
    setConversationRealtime(emptyConversationRealtime);
    setConversationRealtimeToken(null);
    const response = await loadConversation(card.id, { autoScrollOnLoad: true });
    if ((response?.ticket_id ?? card.support_ticket_id) != null) {
      await loadConversationRealtimeSession(card.id);
    }
    await markConversationAsRead(card.id);
  }

  function closeConversation() {
    if (conversationTypingStopTimerRef.current) {
      window.clearTimeout(conversationTypingStopTimerRef.current);
      conversationTypingStopTimerRef.current = null;
    }
    if (selectedConversationTicketIdRef.current) {
      const socket = conversationSocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'typing', ticket_id: selectedConversationTicketIdRef.current, is_typing: false }));
        socket.send(JSON.stringify({ type: 'leave_ticket', ticket_id: selectedConversationTicketIdRef.current }));
      }
    }
    setConversationCard(null);
    setConversationMessages([]);
    setConversationTicketId(null);
    selectedConversationTicketIdRef.current = null;
    setConversationUnreadCount(0);
    setConversationReply('');
    setConversationAttachments([]);
    setConversationNote('');
    setConversationLoading(false);
    setConversationSubmitting(false);
    setConversationError('');
    setConversationRealtimeToken(null);
    setConversationRealtime(emptyConversationRealtime);
    setShowConversationJumpToLatest(false);
    shouldAutoScrollConversationRef.current = false;
  }

  function sendConversationSocketEvent(event: Record<string, unknown>) {
    const socket = conversationSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(event));
  }

  function emitConversationTypingSignal(ticketId: string, isTyping: boolean) {
    sendConversationSocketEvent({
      type: 'typing',
      ticket_id: ticketId,
      is_typing: isTyping
    });
  }

  function isConversationNearBottom(container: HTMLDivElement) {
    const distance = container.scrollHeight - (container.scrollTop + container.clientHeight);
    return distance <= 56;
  }

  function scrollConversationToBottom(behavior: ScrollBehavior = 'auto') {
    const container = conversationMessagesContainerRef.current;
    if (!container) return;
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: container.scrollHeight, behavior });
    } else {
      container.scrollTop = container.scrollHeight;
    }
    setShowConversationJumpToLatest(false);
  }

  function onConversationMessagesScroll() {
    const container = conversationMessagesContainerRef.current;
    if (!container) return;
    if (isConversationNearBottom(container)) {
      setShowConversationJumpToLatest(false);
    }
  }

  function handleConversationReplyChange(value: string) {
    setConversationReply(value);
    if (!conversationTicketId) return;
    emitConversationTypingSignal(conversationTicketId, value.trim().length > 0);
    if (conversationTypingStopTimerRef.current) {
      window.clearTimeout(conversationTypingStopTimerRef.current);
      conversationTypingStopTimerRef.current = null;
    }
    if (!value.trim()) return;
    conversationTypingStopTimerRef.current = window.setTimeout(() => {
      emitConversationTypingSignal(conversationTicketId, false);
      conversationTypingStopTimerRef.current = null;
    }, 1400);
  }

  async function onPickConversationFiles(event: ChangeEvent<HTMLInputElement>) {
    try {
      const files = Array.from(event.target.files ?? []);
      if (files.length === 0) return;
      const nextDrafts: ConversationAttachmentDraft[] = [];
      for (const file of files) {
        if (file.size > KANBAN_FILE_MAX_BYTES) {
          throw new Error(`Arquivo "${file.name}" excede 8 MB.`);
        }
        const fileDataUrl = await toDataUrl(file);
        nextDrafts.push({
          file_name: file.name,
          file_data_base64: fileDataUrl,
          size_bytes: file.size
        });
      }
      setConversationAttachments((prev) => [...prev, ...nextDrafts].slice(0, KANBAN_CONVERSATION_MAX_ATTACHMENTS));
      setConversationError('');
    } catch (fileError) {
      setConversationError(fileError instanceof Error ? fileError.message : 'Falha ao anexar arquivo.');
    } finally {
      event.target.value = '';
    }
  }

  async function sendConversationReply() {
    if (!conversationCard) return;
    const body = conversationReply.trim();
    if (!body && conversationAttachments.length === 0) {
      setConversationError('Escreva uma mensagem ou adicione um anexo.');
      return;
    }

    setConversationSubmitting(true);
    setConversationError('');
    try {
      if (conversationTicketId) {
        emitConversationTypingSignal(conversationTicketId, false);
      }
      if (conversationTypingStopTimerRef.current) {
        window.clearTimeout(conversationTypingStopTimerRef.current);
        conversationTypingStopTimerRef.current = null;
      }
      await api.createImplementationKanbanConversationMessage(conversationCard.id, {
        body: body || null,
        attachments: conversationAttachments.map((item) => ({
          file_name: item.file_name,
          file_data_base64: item.file_data_base64
        }))
      });
      setConversationReply('');
      setConversationAttachments([]);
      shouldAutoScrollConversationRef.current = true;
      await loadConversation(conversationCard.id, { autoScrollOnLoad: true, background: true });
      await markConversationAsRead(conversationCard.id);
    } catch (submitError) {
      setConversationError(submitError instanceof Error ? submitError.message : 'Falha ao enviar resposta.');
    } finally {
      setConversationSubmitting(false);
    }
  }

  useEffect(() => {
    Promise.all([loadBoard(), loadOptions()]).catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    selectedConversationCardIdRef.current = conversationCard?.id ?? null;
  }, [conversationCard?.id]);

  useEffect(() => {
    selectedConversationTicketIdRef.current = conversationTicketId;
  }, [conversationTicketId]);

  useEffect(() => {
    if (!conversationCard) {
      setShowConversationJumpToLatest(false);
      shouldAutoScrollConversationRef.current = false;
      return;
    }
    const container = conversationMessagesContainerRef.current;
    if (!container) return;
    const nearBottom = isConversationNearBottom(container);
    if (shouldAutoScrollConversationRef.current || nearBottom) {
      window.requestAnimationFrame(() => scrollConversationToBottom('auto'));
    } else {
      setShowConversationJumpToLatest(true);
    }
    shouldAutoScrollConversationRef.current = false;
  }, [conversationCard?.id, conversationMessages]);

  useEffect(() => () => {
    if (conversationTypingStopTimerRef.current) {
      window.clearTimeout(conversationTypingStopTimerRef.current);
      conversationTypingStopTimerRef.current = null;
    }
    if (conversationReconnectTimerRef.current) {
      window.clearTimeout(conversationReconnectTimerRef.current);
      conversationReconnectTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!conversationCard || !conversationTicketId || conversationRealtimeToken) return;
    void loadConversationRealtimeSession(conversationCard.id);
  }, [conversationCard?.id, conversationTicketId, conversationRealtimeToken]);

  useEffect(() => {
    if (!KANBAN_REALTIME_ENABLED || !conversationRealtimeToken || typeof WebSocket === 'undefined') {
      return undefined;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let retryDelayMs = 1000;
    let pingTimer: number | null = null;
    let bootTimer: number | null = null;
    let wsCandidateIndex = 0;
    const wsUrls = makePortalWsUrls(conversationRealtimeToken);

    const clearReconnectTimer = () => {
      if (conversationReconnectTimerRef.current) {
        window.clearTimeout(conversationReconnectTimerRef.current);
        conversationReconnectTimerRef.current = null;
      }
    };

    const clearPingTimer = () => {
      if (pingTimer) {
        window.clearInterval(pingTimer);
        pingTimer = null;
      }
    };

    const scheduleReconnect = (delayOverrideMs?: number) => {
      if (disposed || conversationReconnectTimerRef.current) return;
      const delayMs = delayOverrideMs ?? retryDelayMs;
      conversationReconnectTimerRef.current = window.setTimeout(() => {
        conversationReconnectTimerRef.current = null;
        if (typeof delayOverrideMs !== 'number') {
          retryDelayMs = Math.min(Math.round(retryDelayMs * 1.7), 10_000);
        }
        connect();
      }, delayMs);
    };

    const connect = () => {
      if (disposed) return;
      let opened = false;
      let nextSocket: WebSocket;
      try {
        const targetUrl = wsUrls[wsCandidateIndex % wsUrls.length] ?? wsUrls[0];
        wsCandidateIndex += 1;
        nextSocket = new WebSocket(targetUrl);
      } catch {
        scheduleReconnect();
        return;
      }
      socket = nextSocket;
      conversationSocketRef.current = nextSocket;

      nextSocket.onopen = () => {
        opened = true;
        retryDelayMs = 1000;
        clearPingTimer();
        pingTimer = window.setInterval(() => {
          try {
            if (nextSocket.readyState === WebSocket.OPEN) {
              nextSocket.send(JSON.stringify({ type: 'ping' }));
            }
          } catch {
            // noop
          }
        }, 15000);
      };

      nextSocket.onmessage = (rawEvent) => {
        let payload: ConversationSocketEvent | null = null;
        try {
          payload = JSON.parse(rawEvent.data as string) as ConversationSocketEvent;
        } catch {
          return;
        }
        if (!payload) return;
        if (payload.type === 'ready') {
          sendConversationSocketEvent({ type: 'subscribe_company' });
          if (selectedConversationTicketIdRef.current) {
            sendConversationSocketEvent({ type: 'join_ticket', ticket_id: selectedConversationTicketIdRef.current });
            joinedConversationTicketIdRef.current = selectedConversationTicketIdRef.current;
          }
          return;
        }
        if (payload.type === 'error') return;
        if (selectedConversationTicketIdRef.current !== payload.ticket_id) return;

        if (payload.type === 'ticket_presence') {
          setConversationRealtime((prev) => ({
            ...prev,
            presence: {
              ...prev.presence,
              client_online: payload.side === 'cliente' ? payload.online : prev.presence.client_online,
              holand_online: payload.side === 'holand' ? payload.online : prev.presence.holand_online
            }
          }));
          return;
        }

        if (payload.type === 'ticket_typing') {
          setConversationRealtime((prev) => ({
            ...prev,
            typing: {
              side: payload.is_typing ? payload.side : null,
              is_typing: payload.is_typing,
              created_at: payload.created_at
            }
          }));
          return;
        }

        if (payload.type === 'ticket_read') {
          setConversationRealtime((prev) => ({
            ...prev,
            unreadCount: payload.side === 'holand' ? 0 : prev.unreadCount,
            lastReadAt: payload.read_at
          }));
          return;
        }

        if (payload.type === 'ticket_message_created' || payload.type === 'ticket_workflow_changed') {
          const activeCardId = selectedConversationCardIdRef.current;
          if (!activeCardId) return;
          void loadConversation(activeCardId, {
            background: true,
            autoScrollOnLoad: payload.type === 'ticket_message_created' && payload.author_side === 'cliente'
          });
          void markConversationAsRead(activeCardId);
        }
      };

      nextSocket.onclose = (event) => {
        if (conversationSocketRef.current === nextSocket) {
          conversationSocketRef.current = null;
        }
        clearPingTimer();
        if (joinedConversationTicketIdRef.current) {
          joinedConversationTicketIdRef.current = null;
        }
        if (!disposed && event.code !== 4401) {
          scheduleReconnect(!opened && wsUrls.length > 1 ? 120 : undefined);
        }
      };
    };

    // Evita conexão fantasma no primeiro ciclo do StrictMode em dev.
    bootTimer = window.setTimeout(() => connect(), 0);

    return () => {
      disposed = true;
      clearReconnectTimer();
      clearPingTimer();
      if (bootTimer) {
        window.clearTimeout(bootTimer);
        bootTimer = null;
      }
      if (socket?.readyState === WebSocket.OPEN && joinedConversationTicketIdRef.current) {
        socket.send(JSON.stringify({ type: 'typing', ticket_id: joinedConversationTicketIdRef.current, is_typing: false }));
        socket.send(JSON.stringify({ type: 'leave_ticket', ticket_id: joinedConversationTicketIdRef.current }));
        joinedConversationTicketIdRef.current = null;
      }
      if (conversationSocketRef.current === socket) {
        conversationSocketRef.current = null;
      }
      if (socket) {
        socket.close();
      }
    };
  }, [conversationRealtimeToken]);

  useEffect(() => {
    const socket = conversationSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const currentTicketId = joinedConversationTicketIdRef.current;
    const nextTicketId = conversationTicketId;
    if (currentTicketId && currentTicketId !== nextTicketId) {
      socket.send(JSON.stringify({ type: 'typing', ticket_id: currentTicketId, is_typing: false }));
      socket.send(JSON.stringify({ type: 'leave_ticket', ticket_id: currentTicketId }));
    }
    if (nextTicketId && currentTicketId !== nextTicketId) {
      socket.send(JSON.stringify({ type: 'join_ticket', ticket_id: nextTicketId }));
    }
    joinedConversationTicketIdRef.current = nextTicketId ?? null;
  }, [conversationTicketId, conversationRealtimeToken]);

  useEffect(() => {
    if (boardMode !== 'support') return undefined;
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      if (conversationCard && conversationSocketRef.current?.readyState === WebSocket.OPEN) return;
      void loadBoard().catch((err: Error) => setError(err.message));
    }, 4500);
    return () => window.clearInterval(intervalId);
  }, [boardMode, conversationCard]);

  useEffect(() => {
    if (!conversationCard) return undefined;
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      if (conversationSocketRef.current?.readyState === WebSocket.OPEN) return;
      void (async () => {
        try {
          await loadConversation(conversationCard.id, { background: true });
          await markConversationAsRead(conversationCard.id);
        } catch {
          // atualização silenciosa
        }
      })();
    }, 3500);
    return () => window.clearInterval(intervalId);
  }, [conversationCard?.id]);

  useEffect(() => {
    window.localStorage.setItem(KANBAN_FILTERS_COLLAPSED_STORAGE_KEY, isFiltersCollapsed ? '1' : '0');
  }, [isFiltersCollapsed]);

  function getDraft(columnId: string): ColumnDraft {
    return columnDrafts[columnId] ?? defaultColumnDraft;
  }

  function setDraft(columnId: string, patch: Partial<ColumnDraft>) {
    setColumnDrafts((prev) => ({
      ...prev,
      [columnId]: {
        ...getDraft(columnId),
        ...patch
      }
    }));
  }

  async function persistBoard(nextColumns: KanbanColumn[]) {
    await api.reorderImplementationKanban({
      columns: nextColumns.map((column) => ({
        column_id: column.id,
        card_ids: column.cards.map((card) => card.id)
      }))
    });
  }

  async function onDragEnd(result: DropResult) {
    const { destination, source, type } = result;
    if (!destination) return;

    if (type === 'COLUMN') {
      if (destination.index === source.index) return;

      const reordered = [...columns];
      const [movedColumn] = reordered.splice(source.index, 1);
      if (!movedColumn) return;
      reordered.splice(destination.index, 0, movedColumn);
      setColumns(reordered);
      try {
        await api.reorderImplementationKanbanColumns({ column_ids: reordered.map((column) => column.id) });
      } catch (err) {
        setError((err as Error).message);
        await loadBoard();
      }
      return;
    }

    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const sourceVisibleColumn = visibleColumns.find((column) => column.id === source.droppableId);
    const destinationVisibleColumn = visibleColumns.find((column) => column.id === destination.droppableId);
    const movedVisibleCard = sourceVisibleColumn?.cards[source.index];
    if (!sourceVisibleColumn || !destinationVisibleColumn || !movedVisibleCard) return;

    const sourceColumnIndex = columns.findIndex((column) => column.id === source.droppableId);
    const destinationColumnIndex = columns.findIndex((column) => column.id === destination.droppableId);
    if (sourceColumnIndex === -1 || destinationColumnIndex === -1) return;

    const sourceColumn = columns[sourceColumnIndex];
    const destinationColumn = columns[destinationColumnIndex];
    const sourceCards = [...sourceColumn.cards];
    const movedSourceIndex = sourceCards.findIndex((card) => card.id === movedVisibleCard.id);
    if (movedSourceIndex === -1) return;
    const [movedCard] = sourceCards.splice(movedSourceIndex, 1);
    if (!movedCard) return;

    const movedCardNext: KanbanCard = {
      ...movedCard,
      column_id: destinationColumn.id
    };

    const destinationCardsBase = sourceColumn.id === destinationColumn.id ? sourceCards : [...destinationColumn.cards];
    const destinationVisibleCards = (sourceColumn.id === destinationColumn.id ? sourceVisibleColumn.cards : destinationVisibleColumn.cards)
      .filter((card) => card.id !== movedCard.id);
    const destinationReferenceCard = destinationVisibleCards[destination.index];
    const destinationCards = [...destinationCardsBase];
    if (!destinationReferenceCard) {
      const lastVisible = destinationVisibleCards[destinationVisibleCards.length - 1];
      if (!lastVisible) {
        destinationCards.push(movedCardNext);
      } else {
        const lastVisibleIndex = destinationCards.findIndex((card) => card.id === lastVisible.id);
        destinationCards.splice(lastVisibleIndex + 1, 0, movedCardNext);
      }
    } else {
      const destinationInsertIndex = destinationCards.findIndex((card) => card.id === destinationReferenceCard.id);
      destinationCards.splice(destinationInsertIndex, 0, movedCardNext);
    }

    const nextColumns = columns.map((column) => {
      if (column.id === sourceColumn.id && column.id === destinationColumn.id) {
        return { ...column, cards: destinationCards };
      }
      if (column.id === sourceColumn.id) {
        return { ...column, cards: sourceCards };
      }
      if (column.id === destinationColumn.id) {
        return { ...column, cards: destinationCards };
      }
      return column;
    });

    setColumns(nextColumns);
    setError('');
    setMessage('');
    try {
      await persistBoard(nextColumns);
      if (sourceColumn.id !== destinationColumn.id) {
        await api.updateImplementationKanbanCard(movedCard.id, { column_id: destinationColumn.id });
      }
    } catch (err) {
      setError((err as Error).message);
      await loadBoard();
    }
  }

  async function createColumn() {
    if (!newColumnTitle.trim()) {
      setError('Informe o nome da coluna.');
      return;
    }

    setError('');
    setMessage('');
    try {
      await api.createImplementationKanbanColumn({
        title: newColumnTitle.trim(),
        color: newColumnColor
      });
      setNewColumnTitle('');
      setNewColumnColor('#7b8ea8');
      setMessage('Coluna criada.');
      await loadBoard();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function editColumn(column: KanbanColumn) {
    const nextTitle = window.prompt('Nome da coluna:', column.title);
    if (!nextTitle?.trim()) return;
    const nextColor = window.prompt('Cor da coluna (hex):', column.color ?? '#7b8ea8');
    if (!nextColor?.trim()) return;

    setError('');
    setMessage('');
    try {
      await api.updateImplementationKanbanColumn(column.id, {
        title: nextTitle.trim(),
        color: nextColor.trim()
      });
      setMessage('Coluna atualizada.');
      await loadBoard();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteColumn(column: KanbanColumn) {
    const confirmationPhrase = askDestructiveConfirmation(`Excluir coluna "${column.title}"`);
    if (!confirmationPhrase) return;

    setError('');
    setMessage('');
    try {
      await api.deleteImplementationKanbanColumn(column.id, confirmationPhrase);
      setMessage('Coluna excluída.');
      await loadBoard();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function createCardInColumn(columnId: string, openDetailsAfterCreate = true) {
    const draft = getDraft(columnId);
    if (!draft.title.trim()) {
      setError('Informe o título do cartão.');
      return;
    }

    setError('');
    setMessage('');
    try {
      const created = await api.createImplementationKanbanCard({
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        column_id: columnId,
        subcategory: boardMode === 'support' ? 'Suporte' : null
      }) as { id: string };
      setDraft(columnId, {
        isOpen: false,
        title: '',
        description: ''
      });
      const nextColumns = await loadBoard();
      const createdCard = nextColumns.flatMap((column) => column.cards).find((card) => card.id === created.id);
      if (createdCard && openDetailsAfterCreate) {
        const nextDetail = cardDetailFromCard(createdCard);
        if (boardMode === 'support') {
          nextDetail.subcategory = 'Suporte';
        }
        setCardDetail(nextDetail);
        setMessage('Cartão criado. Complete os detalhes no painel lateral.');
      } else {
        setMessage('Cartão criado.');
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function editCard(card: KanbanCard) {
    const nextDetail = cardDetailFromCard(card);
    if (boardMode === 'support') {
      nextDetail.subcategory = 'Suporte';
    }
    setCardDetail(nextDetail);
  }

  async function deleteCard(card: KanbanCard) {
    const confirmationPhrase = askDestructiveConfirmation(`Excluir card "${card.title}"`);
    if (!confirmationPhrase) return;

    setError('');
    setMessage('');
    try {
      await api.deleteImplementationKanbanCard(card.id, confirmationPhrase);
      setMessage('Card excluído.');
      await loadBoard();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveCardDetail() {
    if (!cardDetail) return;
    if (!cardDetail.title.trim()) {
      setError('Título da nota é obrigatório.');
      return;
    }

    setIsSavingCardDetail(true);
    setError('');
    setMessage('');
    try {
      const nextSubcategory: KanbanSubcategory | null = boardMode === 'support'
        ? 'Suporte'
        : (cardDetail.subcategory || null);
      const isSupport = nextSubcategory === 'Suporte';
      const supportHandoffTarget = isSupport
        ? (cardDetail.support_handoff_target || null)
        : null;
      const supportHandoffDate = supportHandoffTarget === 'Sao_Paulo'
        ? (cardDetail.support_handoff_date || todayIsoLocal())
        : null;
      await api.updateImplementationKanbanCard(cardDetail.cardId, {
        title: cardDetail.title.trim(),
        description: cardDetail.description.trim() || null,
        client_name: cardDetail.client_name.trim() || null,
        license_name: cardDetail.license_name.trim() || null,
        technician_id: cardDetail.technician_id || null,
        subcategory: nextSubcategory,
        support_resolution: isSupport ? (cardDetail.support_resolution.trim() || null) : null,
        support_third_party_notes: null,
        support_handoff_target: supportHandoffTarget,
        support_handoff_date: supportHandoffDate,
        priority: cardDetail.priority,
        due_date: cardDetail.due_date || null,
        attachment_image_data_url: cardDetail.attachment_image_data_url ?? null,
        attachment_file_name: cardDetail.attachment_file_data_base64
          ? (cardDetail.attachment_file_name.trim() || 'anexo')
          : null,
        attachment_file_data_base64: cardDetail.attachment_file_data_base64 ?? null
      });
      setMessage('Cartão atualizado.');
      setCardDetail(null);
      await loadBoard();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSavingCardDetail(false);
    }
  }

  async function onPickDetailImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !cardDetail) return;

    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem válido.');
      return;
    }

    if (file.size > KANBAN_IMAGE_MAX_BYTES) {
      setError('A imagem é grande demais. Use até 750 KB.');
      return;
    }

    try {
      const dataUrl = await toDataUrl(file);
      setCardDetail((prev) => (prev ? { ...prev, attachment_image_data_url: dataUrl } : prev));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onPickDetailFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !cardDetail) return;

    if (file.size > KANBAN_FILE_MAX_BYTES) {
      setError('O arquivo é grande demais. Use até 8 MB.');
      return;
    }

    try {
      const dataUrl = await toDataUrl(file);
      setCardDetail((prev) => (
        prev
          ? {
            ...prev,
            attachment_file_name: file.name,
            attachment_file_data_base64: dataUrl
          }
          : prev
      ));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const boardScopedColumns = useMemo(
    () => columns.map((column) => ({
      ...column,
      cards: column.cards.filter((card) => cardMatchesBoardMode(card, boardMode))
    })),
    [columns, boardMode]
  );
  const totalCards = useMemo(
    () => boardScopedColumns.reduce((acc, column) => acc + column.cards.length, 0),
    [boardScopedColumns]
  );
  const technicianNameById = useMemo(
    () => new Map(technicianOptions.map((technician) => [technician.id, technician.name])),
    [technicianOptions]
  );
  const hasActiveFilters = Boolean(
    filterClientName || filterTechnicianId || filterPriority !== 'ALL' || filterDueFrom || filterDueTo
  );

  function cardMatchesFilters(card: KanbanCard): boolean {
    if (filterClientName && (card.client_name ?? '') !== filterClientName) {
      return false;
    }
    if (filterTechnicianId === '__none__') {
      if (card.technician_id) return false;
    } else if (filterTechnicianId && (card.technician_id ?? '') !== filterTechnicianId) {
      return false;
    }
    if (filterPriority !== 'ALL' && card.priority !== filterPriority) {
      return false;
    }
    if (filterDueFrom) {
      if (!card.due_date || card.due_date < filterDueFrom) {
        return false;
      }
    }
    if (filterDueTo) {
      if (!card.due_date || card.due_date > filterDueTo) {
        return false;
      }
    }
    return true;
  }

  const visibleColumns = useMemo(
    () => boardScopedColumns.map((column) => ({
      ...column,
      cards: column.cards.filter(cardMatchesFilters)
    })),
    [boardScopedColumns, filterClientName, filterTechnicianId, filterPriority, filterDueFrom, filterDueTo]
  );

  const visibleCardsCount = useMemo(
    () => visibleColumns.reduce((acc, column) => acc + column.cards.length, 0),
    [visibleColumns]
  );
  const supportAlerts = useMemo(() => (
    boardScopedColumns
      .flatMap((column) => column.cards.map((card) => ({
        ...card,
        columnTitle: column.title
      })))
      .filter((card) => card.subcategory === 'Suporte' && card.support_alert_level !== 'none')
  ), [boardScopedColumns]);

  function clearFilters() {
    setFilterClientName('');
    setFilterTechnicianId('');
    setFilterPriority('ALL');
    setFilterDueFrom('');
    setFilterDueTo('');
  }

  function applyQuickView(view: 'all' | 'high' | 'no_technician' | 'due_7_days') {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekIso = nextWeek.toISOString().slice(0, 10);

    if (view === 'all') {
      clearFilters();
      return;
    }
    if (view === 'high') {
      setFilterPriority('Alta');
      setFilterClientName('');
      setFilterTechnicianId('');
      setFilterDueFrom('');
      setFilterDueTo('');
      return;
    }
    if (view === 'no_technician') {
      setFilterTechnicianId('__none__');
      setFilterClientName('');
      setFilterPriority('ALL');
      setFilterDueFrom('');
      setFilterDueTo('');
      return;
    }
    setFilterDueFrom(todayIso);
    setFilterDueTo(nextWeekIso);
    setFilterClientName('');
    setFilterTechnicianId('');
    setFilterPriority('ALL');
  }

  const counterpartPresence = conversationRealtime.presence.client_online;
  const isClientTyping = Boolean(
    conversationRealtime.typing.is_typing
    && conversationRealtime.typing.side === 'cliente'
  );

  return (
    <div className="page implementation-page">
      <header className="page-header">
        <h1>{boardMode === 'support' ? 'Suporte' : 'Implementação'}</h1>
        <p>
          {boardMode === 'support'
            ? 'Kanban de suporte com acompanhamento de resolução e alertas operacionais.'
            : 'Kanban customizável para organizar melhorias, bugs e entregas.'}
        </p>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}
      {boardMode === 'support' && supportAlerts.length > 0 ? (
        <Section title="Alertas de suporte" className="kanban-config-panel">
          <div className="stack">
            {supportAlerts.map((alert) => (
              <div key={`support-alert-${alert.id}`} className="kanban-support-alert-row">
                <strong>{alert.title}</strong>
                <span>{alert.support_alert_message}</span>
                <small>Coluna: {alert.columnTitle}</small>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        title="Adicionar coluna"
        className="kanban-config-panel"
        action={(
          <div className="kanban-section-actions">
            <button
              type="button"
              className="kanban-collapse-config-btn"
              onClick={() => setIsConfigCollapsed((prev) => !prev)}
            >
              {isConfigCollapsed ? 'Expandir coluna' : 'Minimizar coluna'}
            </button>
            <button
              type="button"
              className="kanban-collapse-config-btn"
              onClick={() => setIsFiltersCollapsed((prev) => !prev)}
            >
              {isFiltersCollapsed ? `Abrir filtros${hasActiveFilters ? ' • ativos' : ''}` : 'Minimizar filtros'}
            </button>
          </div>
        )}
      >
        <div className="form kanban-config-form">
          <p className="form-hint">Board: {columns.length} coluna(s) • {totalCards} nota(s)</p>
          {isConfigCollapsed ? null : (
            <>
              <div className="kanban-config-grid">
                <label>
                  Nome da coluna
                  <input
                    value={newColumnTitle}
                    onChange={(event) => setNewColumnTitle(event.target.value)}
                    placeholder="Ex.: Bloqueios"
                  />
                </label>
                <label>
                  Cor
                  <input
                    type="color"
                    value={newColumnColor}
                    onChange={(event) => setNewColumnColor(event.target.value)}
                  />
                </label>
              </div>
              <div className="actions actions-compact">
                <button type="button" onClick={createColumn}>Adicionar coluna</button>
              </div>
            </>
          )}
        </div>
      </Section>

      {!isFiltersCollapsed ? (
        <Section title="Views e filtros" className="kanban-config-panel">
          <div className="form kanban-config-form">
            <div className="kanban-filters-grid">
              <label>
                Cliente
                <select value={filterClientName} onChange={(event) => setFilterClientName(event.target.value)}>
                  <option value="">Todos os clientes</option>
                  {clientOptions.map((company) => (
                    <option key={company.id} value={company.name}>{company.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Técnico
                <select value={filterTechnicianId} onChange={(event) => setFilterTechnicianId(event.target.value)}>
                  <option value="">Todos os técnicos</option>
                  <option value="__none__">Sem técnico</option>
                  {technicianOptions.map((technician) => (
                    <option key={technician.id} value={technician.id}>{technician.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Prioridade
                <select
                  value={filterPriority}
                  onChange={(event) => setFilterPriority(event.target.value as 'ALL' | KanbanPriority)}
                >
                  <option value="ALL">Todas</option>
                  {KANBAN_PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </label>
              <label>
                Entrega de
                <input type="date" value={filterDueFrom} onChange={(event) => setFilterDueFrom(event.target.value)} />
              </label>
              <label>
                Entrega até
                <input type="date" value={filterDueTo} onChange={(event) => setFilterDueTo(event.target.value)} />
              </label>
            </div>
            <div className="actions actions-compact">
              <button type="button" onClick={() => applyQuickView('all')}>View: Tudo</button>
              <button type="button" onClick={() => applyQuickView('high')}>View: Prioridade alta</button>
              <button type="button" onClick={() => applyQuickView('no_technician')}>View: Sem técnico</button>
              <button type="button" onClick={() => applyQuickView('due_7_days')}>View: Entrega 7 dias</button>
              <button type="button" onClick={clearFilters}>Limpar filtros</button>
            </div>
            <p className="form-hint">
              Exibindo {visibleCardsCount} de {totalCards} cartão(ões).
              {hasActiveFilters ? ' Filtro ativo: arrastar cartões fica desativado para evitar reordenação parcial.' : ''}
            </p>
          </div>
        </Section>
      ) : null}

      <datalist id="kanban-client-options">
        {clientOptions.map((company) => (
          <option key={company.id} value={company.name} />
        ))}
      </datalist>
      <section className="kanban-workspace-shell">
        <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="kanban-columns" direction="horizontal" type="COLUMN">
          {(boardProvided) => (
            <div ref={boardProvided.innerRef} {...boardProvided.droppableProps} className="kanban-board">
              {visibleColumns.map((column, columnIndex) => {
                const draft = getDraft(column.id);
                return (
                  <Draggable
                    key={column.id}
                    draggableId={`column-${column.id}`}
                    index={columnIndex}
                    isDragDisabled={hasActiveFilters}
                  >
                    {(columnProvided, columnSnapshot) => (
                      <section
                        ref={columnProvided.innerRef}
                        {...columnProvided.draggableProps}
                        className={`kanban-column ${columnSnapshot.isDragging ? 'is-column-dragging' : ''}`}
                      >
                        <header className="kanban-column-header" {...columnProvided.dragHandleProps}>
                          <h2>
                            <span className="kanban-column-dot" style={{ backgroundColor: column.color ?? '#7b8ea8' }} />
                            {column.title}
                          </h2>
                          <div className="kanban-column-header-right">
                            <span className="chip">{column.cards.length}</span>
                            <div className="kanban-icon-actions">
                              <button type="button" className="kanban-icon-btn" onClick={() => editColumn(column)} title="Editar coluna">✎</button>
                            </div>
                          </div>
                        </header>

                        {draft.isOpen ? (
                          <div className="kanban-inline-form">
                            <div className="kanban-inline-form-header">
                              <strong>Novo cartão</strong>
                              <span>Criação rápida. Os detalhes completos são no painel lateral.</span>
                            </div>
                            <label>
                              Título
                              <input
                                value={draft.title}
                                onChange={(event) => setDraft(column.id, { title: event.target.value })}
                                placeholder="Título do cartão"
                              />
                            </label>
                            <label>
                              Descrição
                              <textarea
                                rows={2}
                                value={draft.description}
                                onChange={(event) => setDraft(column.id, { description: event.target.value })}
                                placeholder="Resumo do que precisa ser feito"
                              />
                            </label>
                            <div className="actions actions-compact">
                              <button type="button" onClick={() => createCardInColumn(column.id, false)}>Criar rápido</button>
                              <button type="button" onClick={() => createCardInColumn(column.id, true)}>Criar e abrir detalhes</button>
                              <button type="button" onClick={() => setDraft(column.id, { isOpen: false })}>Cancelar</button>
                            </div>
                          </div>
                        ) : null}

                        <Droppable droppableId={column.id} type="CARD" isDropDisabled={hasActiveFilters}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className={`kanban-card-list ${snapshot.isDraggingOver ? 'is-drag-over' : ''}`}
                            >
                              {column.cards.length === 0 ? (
                                <div className="kanban-empty-state">
                                  Arraste cartões para cá ou crie um novo.
                                </div>
                              ) : null}
                              {column.cards.map((card, index) => (
                                <Draggable key={card.id} draggableId={card.id} index={index} isDragDisabled={hasActiveFilters}>
                                  {(dragProvided, dragSnapshot) => (
                                    <article
                                      ref={dragProvided.innerRef}
                                      {...dragProvided.draggableProps}
                                      {...dragProvided.dragHandleProps}
                                      className={`kanban-card ${dragSnapshot.isDragging ? 'is-dragging' : ''}`}
                                    >
                                      <strong>{card.title}</strong>
                                      {card.description ? <p>{card.description}</p> : null}
                                      <div className="kanban-card-meta">
                                        {card.client_name ? <span className="kanban-meta-pill">Cliente: {card.client_name}</span> : null}
                                        {card.license_name ? <span className="kanban-meta-pill">Licença/App: {card.license_name}</span> : null}
                                        {card.subcategory ? <span className="kanban-meta-pill">Subcategoria: {subcategoryLabel(card.subcategory)}</span> : null}
                                        {card.support_handoff_target ? (
                                          <span className="kanban-meta-pill">
                                            Suporte: {card.support_handoff_target === 'Sao_Paulo' ? 'São Paulo' : 'Conosco'}
                                            {card.support_handoff_target === 'Sao_Paulo' && card.support_handoff_date
                                              ? ` · ${formatDateBr(card.support_handoff_date)}`
                                              : ''}
                                          </span>
                                        ) : null}
                                        {card.technician_id ? (
                                          <span className="kanban-meta-pill">
                                            Técnico: {technicianNameById.get(card.technician_id) ?? card.technician_id}
                                          </span>
                                        ) : null}
                                        {card.support_alert_level !== 'none' ? (
                                          <span className="kanban-support-alert-pill">{card.support_alert_message}</span>
                                        ) : null}
                                        <span className={`chip chip-${(card.priority ?? 'Normal').toLowerCase()}`}>{card.priority ?? 'Normal'}</span>
                                        {card.due_date ? <span className="kanban-meta-pill">Entrega: {formatDateBr(card.due_date)}</span> : null}
                                        {card.attachment_file_data_base64 ? (
                                          <span className="kanban-meta-pill">Documento: {card.attachment_file_name || 'Anexo'}</span>
                                        ) : null}
                                      </div>
                                      {card.attachment_image_data_url ? (
                                        <img className="kanban-card-thumb" src={card.attachment_image_data_url} alt={`Anexo do card ${card.title}`} />
                                      ) : null}
                                      {card.attachment_file_data_base64 ? (
                                        <a
                                          className="kanban-card-file-link"
                                          href={card.attachment_file_data_base64}
                                          download={card.attachment_file_name || `anexo-${card.id}`}
                                        >
                                          Baixar documento
                                        </a>
                                      ) : null}
                                      <div className="actions actions-compact">
                                        <button type="button" className="kanban-card-secondary-btn" onClick={() => editCard(card)}>Abrir</button>
                                        {boardMode === 'support' ? (
                                          <button
                                            type="button"
                                            className={`kanban-card-conversation-btn ${card.support_unread_count > 0 ? 'has-unread' : ''}`}
                                            onClick={() => void openConversation(card)}
                                          >
                                            Conversa
                                            {card.support_unread_count > 0 ? (
                                              <span className="kanban-card-conversation-badge" aria-label={`${card.support_unread_count} mensagem(ns) não lida(s)`}>
                                                {card.support_unread_count > 99 ? '99+' : card.support_unread_count}
                                              </span>
                                            ) : null}
                                            {card.support_unread_count > 0 ? <small className="kanban-card-conversation-pending">pendente</small> : null}
                                          </button>
                                        ) : null}
                                        <button type="button" className="kanban-card-danger-btn" onClick={() => deleteCard(card)}>Excluir</button>
                                      </div>
                                    </article>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>

                        <footer className="kanban-column-footer">
                          <button type="button" className="kanban-create-note-btn" onClick={() => setDraft(column.id, { isOpen: !draft.isOpen })}>
                            {draft.isOpen ? 'Fechar criação' : '+ Adicionar cartão'}
                          </button>
                          <button type="button" className="kanban-delete-column-btn" onClick={() => deleteColumn(column)}>Excluir coluna</button>
                        </footer>
                      </section>
                    )}
                  </Draggable>
                );
              })}
              {boardProvided.placeholder}
            </div>
          )}
        </Droppable>
        </DragDropContext>
      </section>

      {conversationCard ? (
        <div className="portal-ticket-overlay" role="dialog" aria-modal="true">
          <button
            type="button"
            className="portal-ticket-overlay-backdrop"
            onClick={closeConversation}
            aria-label="Fechar conversa"
          />
          <section className="portal-ticket-overlay-panel">
            <header className="portal-ticket-overlay-header">
              <div className="portal-ticket-overlay-heading">
                <span className="portal-support-kicker">Conversa do suporte</span>
                <h2>{conversationCard.title}</h2>
                <p className="portal-ticket-overlay-subtitle">{conversationTicketId ?? conversationCard.id}</p>
              </div>
              <button type="button" className="portal-secondary-btn" onClick={closeConversation}>Fechar</button>
            </header>

            <div className="portal-ticket-overlay-meta">
              <div className="portal-ticket-badges portal-ticket-badges-premium">
                <span className="portal-status-chip is-muted">Card: {conversationCard.id}</span>
                <span className="portal-status-chip is-muted">Ticket: {conversationTicketId ?? 'Aguardando vínculo'}</span>
                <span className={`portal-status-chip ${conversationUnreadCount > 0 ? 'is-analysis' : 'is-muted'}`}>
                  {conversationUnreadCount > 0
                    ? `${conversationUnreadCount} não lida${conversationUnreadCount > 1 ? 's' : ''}`
                    : 'Sem pendências'}
                </span>
              </div>
              <div className="portal-ticket-overlay-realtime-row">
                <span className={`portal-support-presence-pill ${presenceTone(counterpartPresence)}`}>
                  {counterpartPresence === true
                    ? 'Cliente online'
                    : 'Cliente offline'}
                </span>
                {isClientTyping ? (
                  <span className="portal-support-typing-indicator is-active">Cliente digitando...</span>
                ) : (
                  <span className="portal-support-typing-indicator">Sem digitação no momento</span>
                )}
              </div>
            </div>

            {conversationError ? <p className="error">{conversationError}</p> : null}
            {conversationNote ? <p className="form-hint">{conversationNote}</p> : null}

            <div className="portal-ticket-overlay-body">
              <div className="portal-ticket-conversation-column">
                <div
                  ref={conversationMessagesContainerRef}
                  onScroll={onConversationMessagesScroll}
                  className="portal-ticket-thread-messages portal-ticket-thread-messages-premium"
                >
                  {conversationLoading ? <p>Carregando conversa...</p> : null}
                  {!conversationLoading && conversationMessages.length === 0 ? (
                    <div className="portal-empty-state portal-support-empty-state">
                      <strong>Nenhuma mensagem ainda.</strong>
                      <p>Assim que o cliente enviar algo, a thread aparece aqui.</p>
                    </div>
                  ) : null}
                  {conversationMessages.map((messageItem) => {
                    const authorSide: PortalRealtimeSide = messageItem.author_type === 'Holand' ? 'holand' : 'cliente';
                    const isOwnMessage = authorSide === 'holand';
                    return (
                      <article
                        key={messageItem.id}
                        className={`portal-ticket-message portal-ticket-message-premium ${isOwnMessage ? 'is-client' : 'is-holand'}`}
                      >
                        <div
                          className={`portal-ticket-message-avatar ${authorSide === 'holand' ? 'has-logo' : ''}`}
                          aria-hidden="true"
                        >
                          {authorSide === 'holand' ? (
                            <img src={holandSeloIcon} alt="" className="portal-ticket-message-avatar-logo" />
                          ) : 'C'}
                        </div>
                        <div className="portal-ticket-message-bubble">
                          <div className="portal-ticket-message-head">
                            <strong>{messageItem.author_label || messageItem.author_type}</strong>
                            <span>{formatDateTimeBr(messageItem.created_at)}</span>
                          </div>
                          <p>{messageItem.body || 'Mensagem sem texto.'}</p>
                          {messageItem.attachments.length > 0 ? (
                            <div className="portal-ticket-message-attachments">
                              {messageItem.attachments.map((attachment) => (
                                <a
                                  key={attachment.id}
                                  href={api.implementationKanbanConversationAttachmentUrl(conversationCard.id, attachment.id)}
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
                    );
                  })}
                </div>
                {showConversationJumpToLatest ? (
                  <button
                    type="button"
                    className="portal-thread-jump-latest-btn"
                    onClick={() => {
                      shouldAutoScrollConversationRef.current = true;
                      scrollConversationToBottom('smooth');
                    }}
                  >
                    Nova mensagem
                  </button>
                ) : null}
              </div>
            </div>

            <form
              className="portal-ticket-form portal-ticket-form-reply"
              onSubmit={(event) => {
                event.preventDefault();
                void sendConversationReply();
              }}
            >
              <div className="portal-chat-composer-row">
                <label className="portal-chat-input-wrap">
                  <span className="portal-chat-input-label">Nova mensagem</span>
                  <textarea
                    rows={2}
                    value={conversationReply}
                    onChange={(event) => handleConversationReplyChange(event.target.value)}
                    placeholder="Escreva a atualização para o cliente."
                    disabled={!conversationTicketId}
                  />
                </label>
                <label className="portal-secondary-btn portal-chat-attach-btn">
                  + Arquivo
                  <input type="file" multiple onChange={onPickConversationFiles} disabled={!conversationTicketId} />
                </label>
                <button type="submit" className="portal-primary-btn" disabled={!conversationTicketId || conversationSubmitting}>
                  {conversationSubmitting ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
              {conversationAttachments.length > 0 ? (
                <div className="portal-ticket-attachments portal-ticket-attachments-premium">
                  {conversationAttachments.map((attachment, index) => (
                    <span key={`${attachment.file_name}-${index}`} className="portal-status-chip is-muted">
                      {attachment.file_name}
                      <small>{formatFileSize(attachment.size_bytes)}</small>
                      <button
                        type="button"
                        className="portal-attachment-remove"
                        onClick={() => setConversationAttachments((prev) => prev.filter((_, current) => current !== index))}
                      >
                        remover
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </form>
          </section>
        </div>
      ) : null}

      {cardDetail ? (
        <div className="kanban-detail-overlay" role="dialog" aria-modal="true">
          <button type="button" className="kanban-detail-backdrop" onClick={() => setCardDetail(null)} aria-label="Fechar detalhe do cartão" />
          <aside className="kanban-detail-panel">
            <header className="kanban-detail-header">
              <h2>Detalhe do cartão</h2>
              <button type="button" className="kanban-icon-btn" onClick={() => setCardDetail(null)} aria-label="Fechar">✕</button>
            </header>
            <div className="form form-spacious">
              <label>
                Título
                <input
                  value={cardDetail.title}
                  onChange={(event) => setCardDetail((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                />
              </label>
              <label>
                Descrição
                <textarea
                  rows={6}
                  value={cardDetail.description}
                  onChange={(event) => setCardDetail((prev) => (prev ? { ...prev, description: event.target.value } : prev))}
                />
              </label>

              <div className="kanban-detail-grid">
                <label>
                  Cliente
                  <input
                    value={cardDetail.client_name}
                    onChange={(event) => setCardDetail((prev) => (prev ? { ...prev, client_name: event.target.value } : prev))}
                    list="kanban-client-options"
                  />
                </label>
                <label>
                  Licença/App
                  <select
                    value={cardDetail.license_name}
                    onChange={(event) => setCardDetail((prev) => (prev ? { ...prev, license_name: event.target.value } : prev))}
                  >
                    <option value="">Sem licença vinculada</option>
                    {licenseProgramOptions.map((program) => (
                      <option key={program.id} value={program.name}>{program.name}</option>
                    ))}
                  </select>
                </label>
                {boardMode === 'support' ? (
                  <label>
                    Subcategoria
                    <input value="Suporte" disabled />
                  </label>
                ) : (
                  <label>
                    Subcategoria
                    <select
                      value={cardDetail.subcategory}
                      onChange={(event) => {
                        const nextSubcategory = event.target.value as KanbanSubcategory | '';
                        setCardDetail((prev) => {
                          if (!prev) return prev;
                          return {
                            ...prev,
                            subcategory: nextSubcategory,
                            support_resolution: '',
                            support_handoff_target: '',
                            support_handoff_date: ''
                          };
                        });
                      }}
                    >
                      <option value="">Sem subcategoria</option>
                      {KANBAN_SUBCATEGORY_OPTIONS_IMPLEMENTATION.map((option) => (
                        <option key={option} value={option}>{subcategoryLabel(option)}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Técnico responsável (opcional)
                  <select
                    value={cardDetail.technician_id}
                    onChange={(event) => setCardDetail((prev) => (prev ? { ...prev, technician_id: event.target.value } : prev))}
                  >
                    <option value="">Sem técnico responsável</option>
                    {technicianOptions.map((technician) => (
                      <option key={technician.id} value={technician.id}>{technician.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Prioridade
                  <select
                    value={cardDetail.priority}
                    onChange={(event) => setCardDetail((prev) => (prev ? { ...prev, priority: event.target.value as KanbanPriority } : prev))}
                  >
                    {KANBAN_PRIORITY_OPTIONS.map((priority) => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Data de entrega
                  <input
                    type="date"
                    value={cardDetail.due_date}
                    onChange={(event) => setCardDetail((prev) => (prev ? { ...prev, due_date: event.target.value } : prev))}
                  />
                </label>
              </div>

              {(boardMode === 'support' || cardDetail.subcategory === 'Suporte') ? (
                <div className="kanban-support-fields">
                  <label>
                    Resolução do suporte
                    <textarea
                      rows={3}
                      value={cardDetail.support_resolution}
                      onChange={(event) => setCardDetail((prev) => (prev ? { ...prev, support_resolution: event.target.value } : prev))}
                      placeholder="Descreva como o suporte foi resolvido."
                    />
                  </label>
                  <p className="form-hint">Ao salvar, novas respostas e anexos deste card são espelhados na conversa do cliente.</p>
                  <label>
                    Encaminhamento do suporte
                    <select
                      value={cardDetail.support_handoff_target}
                      onChange={(event) => {
                        const nextTarget = event.target.value as KanbanSupportHandoffTarget | '';
                        setCardDetail((prev) => {
                          if (!prev) return prev;
                          if (nextTarget === 'Sao_Paulo') {
                            return {
                              ...prev,
                              support_handoff_target: 'Sao_Paulo',
                              support_handoff_date: prev.support_handoff_date || todayIsoLocal()
                            };
                          }
                          if (nextTarget === 'Conosco') {
                            return {
                              ...prev,
                              support_handoff_target: 'Conosco',
                              support_handoff_date: ''
                            };
                          }
                          return {
                            ...prev,
                            support_handoff_target: '',
                            support_handoff_date: ''
                          };
                        });
                      }}
                    >
                      <option value="">Não definido</option>
                      <option value="Conosco">Conosco</option>
                      <option value="Sao_Paulo">São Paulo</option>
                    </select>
                  </label>
                  {cardDetail.support_handoff_target === 'Sao_Paulo' ? (
                    <p className="form-hint">Repasse para São Paulo em: <strong>{formatDateBr(cardDetail.support_handoff_date || todayIsoLocal())}</strong></p>
                  ) : null}
                </div>
              ) : null}

              <div className="kanban-detail-attachment">
                <label className="kanban-inline-attachment-label">
                  <span>Anexo de imagem</span>
                  <input type="file" accept="image/*" onChange={onPickDetailImage} />
                </label>
                {cardDetail.attachment_image_data_url ? (
                  <div className="kanban-attachment-preview">
                    <img src={cardDetail.attachment_image_data_url} alt="Anexo atual" />
                    <button
                      type="button"
                      onClick={() => setCardDetail((prev) => (prev ? { ...prev, attachment_image_data_url: null } : prev))}
                    >
                      Remover imagem
                    </button>
                  </div>
                ) : null}

                <label className="kanban-inline-attachment-label">
                  <span>Anexo de documento</span>
                  <input type="file" onChange={onPickDetailFile} />
                </label>
                {cardDetail.attachment_file_data_base64 ? (
                  <div className="kanban-file-preview">
                    <div className="kanban-file-preview-head">
                      <strong>{cardDetail.attachment_file_name || 'Documento anexado'}</strong>
                      <span>{formatFileSize(dataUrlSizeBytes(cardDetail.attachment_file_data_base64))}</span>
                    </div>
                    <div className="actions actions-compact">
                      <a
                        className="kanban-card-file-link"
                        href={cardDetail.attachment_file_data_base64}
                        download={cardDetail.attachment_file_name || `anexo-${cardDetail.cardId}`}
                      >
                        Baixar
                      </a>
                      <button
                        type="button"
                        onClick={() => setCardDetail((prev) => (
                          prev
                            ? {
                              ...prev,
                              attachment_file_name: '',
                              attachment_file_data_base64: null
                            }
                            : prev
                        ))}
                      >
                        Remover documento
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="actions actions-compact">
                <button type="button" onClick={saveCardDetail} disabled={isSavingCardDetail}>
                  {isSavingCardDetail ? 'Salvando...' : 'Salvar alterações'}
                </button>
                <button type="button" onClick={() => setCardDetail(null)}>Fechar</button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
