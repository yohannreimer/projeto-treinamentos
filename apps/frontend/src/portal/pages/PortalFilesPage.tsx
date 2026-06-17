import { useEffect, useState } from 'react';
import type { PortalAuthedApi, PortalFileItem } from '../types';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const API_BASE_URL = env?.VITE_API_BASE_URL ?? `http://${window.location.hostname}:4000`;

type PortalFilesPageProps = {
  api: Pick<PortalAuthedApi, 'files'>;
  sessionToken: string;
};

function formatDateBr(dateIso?: string | null) {
  if (!dateIso) return 'Data não informada';
  const [year, month, day] = dateIso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function formatBytes(bytes?: number) {
  const value = Number(bytes ?? 0);
  if (value <= 0) return 'Tamanho não informado';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(mimeType: string) {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'Imagem';
  const subtype = mimeType.split('/')[1]?.split(/[+.-]/)[0];
  return subtype ? subtype.toUpperCase() : 'Arquivo';
}

function fileNameFromContentDisposition(contentDisposition: string, fallback: string) {
  const encodedName = contentDisposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  return encodedName ? decodeURIComponent(encodedName) : fallback;
}

export function PortalFilesPage({ api, sessionToken }: PortalFilesPageProps) {
  const [items, setItems] = useState<PortalFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function loadFiles() {
    setLoading(true);
    try {
      const response = await api.files();
      setItems(response.items ?? []);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar arquivos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFiles();
  }, [api]);

  async function downloadFile(item: PortalFileItem) {
    setDownloadingId(item.id);
    try {
      const response = await fetch(`${API_BASE_URL}${item.download_url}`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`
        }
      });
      if (!response.ok) {
        const body = await response.text();
        let message = body || 'Falha ao baixar arquivo.';
        try {
          const parsed = JSON.parse(body) as { message?: string };
          message = parsed.message || message;
        } catch {
          message = body || message;
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileNameFromContentDisposition(
        response.headers.get('content-disposition') ?? '',
        item.file_name
      );
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
      setError('');
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Falha ao baixar arquivo.');
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) return <p>Carregando arquivos...</p>;

  return (
    <section className="portal-panel">
      <header className="portal-panel-header portal-panel-header-row">
        <div>
          <h2>Arquivos</h2>
          <p>Materiais liberados pela equipe Holand para este cliente.</p>
        </div>
        <span className="portal-status-chip is-muted">{items.length} disponível(is)</span>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {items.length === 0 ? (
        <div className="portal-empty-state">
          <strong>Nenhum arquivo disponível.</strong>
          <p>Quando a equipe Holand liberar materiais para o portal, eles aparecerão aqui.</p>
        </div>
      ) : null}

      <div className="portal-certificate-list portal-file-list">
        {items.map((item) => (
          <article key={item.id} className="portal-certificate-card portal-file-card">
            <div className="portal-certificate-main">
              <span className="portal-table-mode-chip is-file">{fileTypeLabel(item.mime_type)}</span>
              <h3>{item.title || item.file_name}</h3>
              <p>
                {[item.category, formatBytes(item.file_size_bytes), `Publicado em ${formatDateBr(item.published_at)}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {item.notes ? <p>{item.notes}</p> : null}
            </div>
            <div className="portal-certificate-actions">
              <button
                type="button"
                className="portal-primary-btn"
                onClick={() => void downloadFile(item)}
                disabled={downloadingId === item.id}
              >
                {downloadingId === item.id ? 'Baixando...' : 'Baixar arquivo'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
