import { DocsIcon } from './DocsIcon';

export type DocsSectionKey = 'clients' | 'processes' | 'templates' | 'knowledge' | 'certs';

const SECTION_COLORS: Record<DocsSectionKey, { bar: string; icon: string; bg: string }> = {
  clients: {
    bar: 'linear-gradient(90deg, #1d2830, #2d4a5e)',
    icon: 'folder-clients',
    bg: '#eef3f7'
  },
  processes: {
    bar: 'linear-gradient(90deg, #5a646e, #8a9aaa)',
    icon: 'folder',
    bg: '#f0f2f4'
  },
  templates: {
    bar: 'linear-gradient(90deg, #21744d, #38b27a)',
    icon: 'layout',
    bg: '#eef7f2'
  },
  knowledge: {
    bar: 'linear-gradient(90deg, #9a5f0a, #f59e0b)',
    icon: 'book',
    bg: '#fef9ee'
  },
  certs: {
    bar: 'linear-gradient(90deg, #ef2f0f, #f59e0b)',
    icon: 'folder-cert',
    bg: '#fff5f2'
  }
};

type FolderCardProps = {
  name: string;
  section: DocsSectionKey;
  subfolderCount?: number;
  docCount?: number;
  pageCount?: number;
  onClick: () => void;
};

export function FolderCard({ name, section, subfolderCount = 0, docCount = 0, pageCount = 0, onClick }: FolderCardProps) {
  const colors = SECTION_COLORS[section];

  const pills: string[] = [];
  if (subfolderCount > 0) pills.push(`${subfolderCount} pasta${subfolderCount > 1 ? 's' : ''}`);
  if (pageCount > 0) pills.push(`${pageCount} pág${pageCount > 1 ? 's' : ''}`);
  if (docCount > 0) pills.push(`${docCount} doc${docCount > 1 ? 's' : ''}`);

  return (
    <button type="button" className="dv2-folder-card" onClick={onClick}>
      <span className="dv2-folder-card__bar" style={{ background: colors.bar }} />
      <span className="dv2-folder-card__icon" style={{ background: colors.bg }}>
        <DocsIcon name={colors.icon as any} size={18} />
      </span>
      <strong className="dv2-folder-card__name">{name}</strong>
      {pills.length > 0 && (
        <div className="dv2-folder-card__pills">
          {pills.map((pill) => (
            <span key={pill} className="dv2-pill">{pill}</span>
          ))}
        </div>
      )}
    </button>
  );
}
