import { useEffect, useState } from 'react';
import type { PortalAuthedApi, PortalCertificateItem } from '../types';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const API_BASE_URL = env?.VITE_API_BASE_URL ?? `http://${window.location.hostname}:4000`;

type PortalCertificatesPageProps = {
  api: Pick<PortalAuthedApi, 'certificates'>;
  sessionToken: string;
};

function formatDateBr(dateIso: string | null) {
  if (!dateIso) return 'Data não informada';
  const [year, month, day] = dateIso.split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function certificateTypeLabel(type: PortalCertificateItem['certificate_type']) {
  return type === 'deliverable' ? 'Entregável' : 'Treinamento ministrado';
}

function statusTone(item: PortalCertificateItem) {
  if (item.download_available) return 'is-success';
  return 'is-warning';
}

export function PortalCertificatesPage({ api, sessionToken }: PortalCertificatesPageProps) {
  const [items, setItems] = useState<PortalCertificateItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function loadCertificates() {
    setLoading(true);
    try {
      const response = await api.certificates();
      setItems(response.items ?? []);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar certificados.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCertificates();
  }, [api]);

  async function downloadCertificate(item: PortalCertificateItem) {
    setDownloadingId(item.certificate_id);
    try {
      const response = await fetch(`${API_BASE_URL}${item.download_url}`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`
        }
      });
      if (!response.ok) {
        const body = await response.text();
        let message = body || 'Falha ao baixar certificado.';
        try {
          const parsed = JSON.parse(body) as { message?: string };
          message = parsed.message || message;
        } catch {
          message = body || message;
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
      const fileName = encodedName
        ? decodeURIComponent(encodedName)
        : `Certificado - ${item.module_name}.pdf`;
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
      setError('');
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Falha ao baixar certificado.');
    } finally {
      setDownloadingId(null);
    }
  }

  function openEvaluation(item: PortalCertificateItem) {
    const currentPath = window.location.pathname.replace(/\/$/, '');
    const url = `${window.location.origin}${currentPath}/${encodeURIComponent(item.certificate_id)}/avaliacao`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  if (loading) return <p>Carregando certificados...</p>;

  return (
    <section className="portal-panel">
      <header className="portal-panel-header portal-panel-header-row">
        <div>
          <h2>Certificados</h2>
          <p>Baixe certificados de treinamentos e entregáveis concluídos pela sua empresa.</p>
        </div>
        <span className="portal-status-chip is-muted">{items.length} disponível(is)</span>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {items.length === 0 ? (
        <div className="portal-empty-state">
          <strong>Nenhum certificado disponível.</strong>
          <p>Certificados aparecem aqui quando treinamentos ou entregáveis forem concluídos pela equipe Holand.</p>
        </div>
      ) : null}

      <div className="portal-certificate-list">
        {items.map((item) => (
          <article key={item.certificate_id} className="portal-certificate-card">
            <div className="portal-certificate-main">
              <span className={`portal-table-mode-chip ${item.certificate_type === 'deliverable' ? 'is-deliverable' : 'is-training'}`}>
                {certificateTypeLabel(item.certificate_type)}
              </span>
              <h3>{item.module_name}</h3>
              <p>
                {item.certificate_type === 'training'
                  ? [
                      item.cohort_code ? `Turma ${item.cohort_code}` : item.cohort_name,
                      item.technician_name ? `Instrutor ${item.technician_name}` : null,
                      `Concluído em ${formatDateBr(item.completed_at)}`
                    ].filter(Boolean).join(' · ')
                  : `Concluído e aprovado · ${formatDateBr(item.completed_at)}`}
              </p>
              <div className="portal-ticket-badges">
                <span className={`portal-status-chip ${statusTone(item)}`}>{item.status_label}</span>
                {item.requires_evaluation && !item.evaluation_submitted ? (
                  <span className="portal-status-chip is-warning">Avaliação antes do primeiro download</span>
                ) : null}
              </div>
            </div>
            <div className="portal-certificate-actions">
              {item.download_available ? (
                <button
                  type="button"
                  className="portal-primary-btn"
                  onClick={() => void downloadCertificate(item)}
                  disabled={downloadingId === item.certificate_id}
                >
                  {downloadingId === item.certificate_id ? 'Baixando...' : 'Baixar PDF'}
                </button>
              ) : (
                <button
                  type="button"
                  className="portal-primary-btn"
                  onClick={() => openEvaluation(item)}
                >
                  Responder avaliação
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
