import { useEffect, useState, type FormEvent } from 'react';
import type { CreatePortalTicketPayload, PortalAuthedApi, PortalTicket, PortalTicketPriority } from '../types';

type PortalTicketsPageProps = {
  api: Pick<PortalAuthedApi, 'tickets' | 'createTicket'>;
};

const priorityOptions: PortalTicketPriority[] = ['Baixa', 'Normal', 'Alta', 'Critica'];

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
      priority
    };

    try {
      await api.createTicket(payload);
      setShowForm(false);
      setTitle('');
      setDescription('');
      setPriority('Normal');
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha ao criar solicitação de suporte.');
    } finally {
      setSubmitting(false);
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
                  <span className={`portal-status-chip ${ticketStatusTone(item.client_status)}`}>{item.client_status}</span>
                </div>
                <span>{item.source === 'Portal' ? 'Origem: Portal' : 'Origem: Operação Holand'}</span>
                <span>{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
