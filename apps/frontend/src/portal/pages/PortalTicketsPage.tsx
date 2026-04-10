import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import type {
  CreatePortalTicketPayload,
  PortalAuthedApi,
  PortalTicket,
  PortalTicketMessage,
  PortalTicketPriority
} from '../types';

type PortalTicketsPageProps = {
  api: Pick<PortalAuthedApi, 'tickets' | 'createTicket' | 'ticketThread' | 'createTicketMessage'>;
};

const priorityOptions: PortalTicketPriority[] = ['Baixa', 'Normal', 'Alta', 'Critica'];
const ATTACHMENT_MAX_BYTES = 8_000_000;
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const API_BASE_URL = env?.VITE_API_BASE_URL ?? `http://${window.location.hostname}:4000`;

type DraftAttachment = {
  file_name: string;
  file_data_base64: string;
  size_bytes: number;
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

export function PortalTicketsPage({ api }: PortalTicketsPageProps) {
  const [items, setItems] = useState<PortalTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [supportIntroText, setSupportIntroText] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<PortalTicketPriority>('Normal');
  const [createAttachments, setCreateAttachments] = useState<DraftAttachment[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<PortalTicketMessage[]>([]);
  const [threadNote, setThreadNote] = useState('');
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadSubmitting, setThreadSubmitting] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<DraftAttachment[]>([]);

  async function load() {
    setLoading(true);
    try {
      const response = await api.tickets();
      setItems(response.items ?? []);
      setSupportIntroText(response.support_intro_text?.trim() ?? '');
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar suporte.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedTicket = useMemo(
    () => items.find((item) => item.id === selectedTicketId) ?? null,
    [items, selectedTicketId]
  );
  const selectedIsReadonlyOperational = Boolean(selectedTicket && selectedTicket.id.startsWith('kcard-'));

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
      setCreateAttachments((prev) => [...prev, ...picked].slice(0, 8));
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
      setReplyAttachments((prev) => [...prev, ...picked].slice(0, 8));
      setError('');
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'Falha ao anexar arquivo.');
    } finally {
      event.target.value = '';
    }
  }

  async function loadThread(ticketId: string) {
    setThreadLoading(true);
    try {
      const response = await api.ticketThread(ticketId);
      setThreadMessages(response.messages ?? []);
      setThreadNote(response.note ?? '');
      setError('');
    } catch (threadError) {
      setError(threadError instanceof Error ? threadError.message : 'Falha ao carregar conversa do suporte.');
    } finally {
      setThreadLoading(false);
    }
  }

  async function openThread(ticketId: string) {
    setSelectedTicketId(ticketId);
    await loadThread(ticketId);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError('Informe o assunto da solicitação.');
      return;
    }

    setSubmitting(true);
    const payload: CreatePortalTicketPayload = {
      title: title.trim(),
      description: description.trim() || null,
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
      setReplyBody('');
      setReplyAttachments([]);
      await loadThread(selectedTicketId);
      await load();
      setError('');
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Falha ao enviar resposta no suporte.');
    } finally {
      setThreadSubmitting(false);
    }
  }

  return (
    <section className="portal-panel">
      <header className="portal-panel-header portal-panel-header-row">
        <div>
          <h2>Suporte</h2>
          <p>
            {supportIntroText || 'Abertura e acompanhamento das solicitações ligadas ao seu contrato, com estágio vindo da operação Holand.'}
          </p>
        </div>
        <button type="button" className="portal-primary-btn" onClick={() => setShowForm((prev) => !prev)}>
          {showForm ? 'Fechar formulário' : 'Nova solicitação'}
        </button>
      </header>

      {showForm ? (
        <form className="portal-ticket-form" onSubmit={submit}>
          <label>
            Assunto
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Resumo do problema"
            />
          </label>
          <label>
            Descrição
            <textarea
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Explique o contexto e o impacto para o time."
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
          <label>
            Anexos (imagem ou documento)
            <input type="file" multiple onChange={onPickCreateAttachments} />
          </label>
          {createAttachments.length > 0 ? (
            <div className="portal-ticket-attachments">
              {createAttachments.map((attachment, index) => (
                <span key={`${attachment.file_name}-${index}`} className="portal-status-chip is-muted">
                  {attachment.file_name}
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
              {submitting ? 'Enviando...' : 'Enviar solicitação'}
            </button>
            <button type="button" className="portal-secondary-btn" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p>Carregando suporte...</p> : null}

      {!loading ? (
        <div className="portal-ticket-list">
          {items.length === 0 ? (
            <div className="portal-empty-state">
              <strong>Nenhuma solicitação de suporte até agora.</strong>
              <p>Use o botão “Nova solicitação” para registrar uma demanda ao time Holand.</p>
            </div>
          ) : null}
          {items.map((item) => (
            <article key={item.id} className="portal-ticket-item">
              <div className="portal-ticket-main">
                <strong>{item.title}</strong>
                <p>{item.description || 'Sem descrição detalhada.'}</p>
              </div>
              <div className="portal-ticket-meta">
                <div className="portal-ticket-badges">
                  <span className={`portal-status-chip ${priorityTone(item.priority)}`}>{item.priority}</span>
                  <span className={`portal-status-chip ${workflowStageTone(item.workflow_stage)}`}>
                    {item.workflow_stage || 'Sem etapa'}
                  </span>
                  <span className={`portal-status-chip ${ticketStatusTone(item.client_status)}`}>{item.client_status}</span>
                </div>
                <span>{item.source === 'Portal' ? 'Origem: Portal' : 'Origem: Operação Holand'}</span>
                <span>{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                <button type="button" className="portal-secondary-btn" onClick={() => void openThread(item.id)}>
                  Conversa
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {selectedTicket ? (
        <section className="portal-ticket-thread">
          <header className="portal-panel-header portal-panel-header-row">
            <div>
              <h3>{selectedTicket.title}</h3>
              <p>Histórico da conversa e anexos desse suporte.</p>
            </div>
            <button type="button" className="portal-secondary-btn" onClick={() => setSelectedTicketId(null)}>
              Fechar conversa
            </button>
          </header>
          {threadLoading ? <p>Carregando conversa...</p> : null}
          {threadNote ? <p className="form-hint">{threadNote}</p> : null}
          <div className="portal-ticket-thread-messages">
            {threadMessages.length === 0 ? (
              <div className="portal-empty-state">
                <strong>Nenhuma mensagem ainda.</strong>
                <p>Use o campo abaixo para iniciar a conversa deste suporte.</p>
              </div>
            ) : null}
            {threadMessages.map((message) => (
              <article key={message.id} className={`portal-ticket-message ${message.author_type === 'Holand' ? 'is-holand' : 'is-client'}`}>
                <div className="portal-ticket-message-head">
                  <strong>{message.author_label || message.author_type}</strong>
                  <span>{new Date(message.created_at).toLocaleString('pt-BR')}</span>
                </div>
                <p>{message.body || 'Sem texto.'}</p>
                {message.attachments.length > 0 ? (
                  <div className="portal-ticket-message-attachments">
                    {message.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={`${API_BASE_URL}${attachment.download_url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="portal-secondary-btn"
                      >
                        Baixar {attachment.file_name}
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          {!selectedIsReadonlyOperational ? (
            <form className="portal-ticket-form" onSubmit={submitReply}>
              <label>
                Nova mensagem
                <textarea
                  rows={3}
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder="Compartilhe atualização, dúvida ou confirmação."
                />
              </label>
              <label>
                Anexos
                <input type="file" multiple onChange={onPickReplyAttachments} />
              </label>
              {replyAttachments.length > 0 ? (
                <div className="portal-ticket-attachments">
                  {replyAttachments.map((attachment, index) => (
                    <span key={`${attachment.file_name}-${index}`} className="portal-status-chip is-muted">
                      {attachment.file_name}
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
            <p className="form-hint">Este item veio da operação interna e está em modo somente leitura no portal.</p>
          )}
        </section>
      ) : null}
    </section>
  );
}
