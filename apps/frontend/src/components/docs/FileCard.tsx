import { DocsIcon } from './DocsIcon';

type FileType = 'pdf' | 'img' | 'cert' | 'generic';

function detectFileType(mimeType: string, isCert: boolean): FileType {
  if (isCert) return 'cert';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'img';
  return 'generic';
}

function formatBytes(bytes?: number): string {
  const v = Number(bytes ?? 0);
  if (v <= 0) return '';
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateBr(iso?: string): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

const FILE_TYPE_STYLES: Record<FileType, { label: string; mod: string }> = {
  pdf: { label: 'PDF', mod: 'pdf' },
  img: { label: 'IMG', mod: 'img' },
  cert: { label: 'CERT', mod: 'cert' },
  generic: { label: 'ARQ', mod: 'generic' }
};

type FileCardProps = {
  fileName: string;
  mimeType: string;
  fileSizeBytes?: number;
  createdAt?: string;
  isCert?: boolean;
  canPreview?: boolean;
  isDownloading?: boolean;
  isPreviewing?: boolean;
  onView?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
};

export function FileCard({
  fileName,
  mimeType,
  fileSizeBytes,
  createdAt,
  isCert = false,
  canPreview = false,
  isDownloading = false,
  isPreviewing = false,
  onView,
  onDownload,
  onShare
}: FileCardProps) {
  const fileType = detectFileType(mimeType, isCert);
  const { label, mod } = FILE_TYPE_STYLES[fileType];

  return (
    <div className={`dv2-file-card dv2-file-card--${mod}`}>
      <div className="dv2-file-card__head">
        <span className={`dv2-file-badge dv2-file-badge--${mod}`}>{label}</span>
      </div>
      <strong className="dv2-file-card__name">{fileName}</strong>
      <div className="dv2-file-card__meta">
        {fileSizeBytes ? <small>{formatBytes(fileSizeBytes)}</small> : null}
        {createdAt ? <small>{formatDateBr(createdAt)}</small> : null}
      </div>
      <div className="dv2-file-card__actions">
        {canPreview && onView && (
          <button
            type="button"
            className="dv2-file-action"
            onClick={onView}
            disabled={isPreviewing}
            title="Visualizar"
          >
            <DocsIcon name="eye" size={14} />
            <span>{isPreviewing ? 'Abrindo…' : 'Visualizar'}</span>
          </button>
        )}
        {onDownload && (
          <button
            type="button"
            className="dv2-file-action"
            onClick={onDownload}
            disabled={isDownloading}
            title="Baixar"
          >
            <DocsIcon name="download" size={14} />
            <span>{isDownloading ? 'Baixando…' : 'Download'}</span>
          </button>
        )}
        {onShare && (
          <button
            type="button"
            className="dv2-file-action"
            onClick={onShare}
            title="Compartilhar"
          >
            <DocsIcon name="share" size={14} />
            <span>Compartilhar</span>
          </button>
        )}
      </div>
    </div>
  );
}
