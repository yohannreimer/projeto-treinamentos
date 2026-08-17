import type { ProposalSummary } from '../services/api';

type SavedProposalsPanelProps = {
  items: ProposalSummary[];
  query: string;
  activeId: string | null;
  loading: boolean;
  saving: boolean;
  error: string;
  status: string;
  onQueryChange(value: string): void;
  onNew(): void;
  onSave(): void;
  onOpen(id: string): void;
  onDelete(id: string): void;
};

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function SavedProposalsPanel(props: SavedProposalsPanelProps) {
  const normalizedQuery = props.query.trim().toLocaleLowerCase('pt-BR');
  const filteredItems = props.items.filter((item) =>
    `${item.number} ${item.client_company_name}`.toLocaleLowerCase('pt-BR').includes(normalizedQuery)
  );

  return (
    <section className="proposal-panel proposal-saved-panel" aria-label="Propostas salvas">
      <div className="proposal-saved-heading">
        <div>
          <span className="proposal-saved-eyebrow">Arquivo comercial</span>
          <h2>Propostas salvas</h2>
        </div>
        <span className="proposal-saved-count" aria-label={`${props.items.length} propostas`}>
          {String(props.items.length).padStart(2, '0')}
        </span>
      </div>

      <div className="proposal-primary-actions">
        <button type="button" className="proposal-new" onClick={props.onNew}>Nova proposta</button>
        <button type="button" className="proposal-save" onClick={props.onSave} disabled={props.saving}>
          {props.saving ? 'Salvando…' : 'Salvar proposta'}
        </button>
      </div>

      <label className="proposal-saved-search">
        Buscar
        <input
          aria-label="Buscar propostas salvas"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder="Número ou cliente"
        />
      </label>

      {props.error ? <p className="proposal-operation-message is-error" role="alert">{props.error}</p> : null}
      {props.status ? <p className="proposal-operation-message" role="status">{props.status}</p> : null}
      {props.loading ? <p className="proposal-saved-empty">Carregando propostas…</p> : null}
      {!props.loading && filteredItems.length === 0 ? (
        <p className="proposal-saved-empty">Nenhuma proposta encontrada.</p>
      ) : null}

      <div className="proposal-saved-list">
        {filteredItems.map((item) => {
          const label = item.number || 'proposta sem número';
          return (
            <article key={item.id} className={item.id === props.activeId ? 'is-active' : ''}>
              <button
                type="button"
                className="proposal-saved-open"
                onClick={() => props.onOpen(item.id)}
                aria-label={`Abrir ${label}`}
              >
                <span className="proposal-saved-code">{item.number || 'Sem número'}</span>
                <strong>{item.client_company_name || 'Cliente não informado'}</strong>
                <small>Atualizada {formatUpdatedAt(item.updated_at)}</small>
              </button>
              <button
                type="button"
                className="proposal-saved-delete"
                onClick={() => props.onDelete(item.id)}
                aria-label={`Excluir ${label}`}
              >
                ×
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
