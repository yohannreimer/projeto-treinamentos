import { useEffect, useState, type FormEvent } from 'react';
import type { CreatePortalTicketPayload, PortalAuthedApi, PortalTicket, PortalTicketPriority } from '../types';

type PortalTicketsPageProps = {
  api: Pick<PortalAuthedApi, 'tickets' | 'createTicket'>;
};

const priorityOptions: PortalTicketPriority[] = ['Baixa', 'Normal', 'Alta', 'Critica'];

export function PortalTicketsPage({ api }: PortalTicketsPageProps) {
  const [items, setItems] = useState<PortalTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar chamados.');
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
      setError('Informe o assunto do chamado.');
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
      setError(submitError instanceof Error ? submitError.message : 'Falha ao criar chamado.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="portal-panel">
      <header className="portal-panel-header portal-panel-header-row">
        <div>
          <h2>Chamados</h2>
          <p>Abertura e acompanhamento de suportes ligados ao seu contrato.</p>
        </div>
        <button type="button" className="portal-primary-btn" onClick={() => setShowForm((prev) => !prev)}>
          Novo chamado
        </button>
      </header>

      {showForm ? (
        <form className="portal-ticket-form" onSubmit={submit}>
          <label>
            Assunto
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Descrição
            <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
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
              {submitting ? 'Enviando...' : 'Enviar chamado'}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p>Carregando chamados...</p> : null}

      {!loading ? (
        <div className="portal-ticket-list">
          {items.length === 0 ? <p>Nenhum chamado aberto até agora.</p> : null}
          {items.map((item) => (
            <article key={item.id} className="portal-ticket-item">
              <div>
                <strong>{item.title}</strong>
                <p>{item.description || 'Sem descrição detalhada.'}</p>
              </div>
              <div className="portal-ticket-meta">
                <span>{item.priority}</span>
                <span>{item.client_status}</span>
                <span>{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
