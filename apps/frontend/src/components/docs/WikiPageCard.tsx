import { DocsIcon } from './DocsIcon';

type WikiPageCardProps = {
  title: string;
  excerpt?: string;
  updatedAt?: string;
  isDraft?: boolean;
  hasPublicLink?: boolean;
  onClick: () => void;
};

function formatDateBr(iso?: string): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

export function WikiPageCard({ title, excerpt, updatedAt, isDraft = true, hasPublicLink = false, onClick }: WikiPageCardProps) {
  return (
    <button type="button" className="dv2-wiki-card" onClick={onClick}>
      <span className="dv2-wiki-card__bar" />
      <div className="dv2-wiki-card__head">
        <span className="dv2-wiki-card__icon">
          <DocsIcon name="wiki" size={16} />
        </span>
        <span className={`dv2-badge dv2-badge--${isDraft ? 'amber' : 'green'}`}>
          {isDraft ? 'Rascunho' : 'Publicado'}
        </span>
      </div>
      <strong className="dv2-wiki-card__title">{title}</strong>
      {excerpt && <p className="dv2-wiki-card__excerpt">{excerpt}</p>}
      <div className="dv2-wiki-card__foot">
        {updatedAt && (
          <small className="dv2-wiki-card__date">
            Atualizado {formatDateBr(updatedAt)}
          </small>
        )}
        {hasPublicLink && (
          <span className="dv2-badge dv2-badge--shared">
            <DocsIcon name="link" size={11} />
            Compartilhado
          </span>
        )}
      </div>
    </button>
  );
}
