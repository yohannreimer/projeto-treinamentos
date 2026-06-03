import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

// ────────────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────────────

type PublicPagePayload = {
  type: 'page';
  allow_download: boolean;
  title: string;
  content: string;
  tags: string[];
  updated_at: string;
};

type PublicDocumentPayload = {
  type: 'document';
  allow_download: boolean;
  title: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  download_url: string | null;
};

type Payload = PublicPagePayload | PublicDocumentPayload;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; code: 404 | 410 | 403 | 500; message: string }
  | { status: 'ok'; data: Payload };

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const BASE_URL = env?.VITE_API_BASE_URL ?? `http://${window.location.hostname}:4000`;

function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.+<\/li>)+/g, (match) => `<ul>${match}</ul>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[hlpuo])/gm, '')
    .replace(/<p><\/p>/g, '')
    .replace(/^(.+)$/gm, (line) => {
      if (/^<[hluo1-9li]/.test(line)) return line;
      return `<p>${line}</p>`;
    });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateBr(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
}

// ────────────────────────────────────────────────────────────────────────────
// Componente
// ────────────────────────────────────────────────────────────────────────────

export function PublicDocPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!token) { setState({ status: 'error', code: 404, message: 'Token não informado.' }); return; }

    fetch(`${BASE_URL}/p/${token}`)
      .then(async (res) => {
        const body = await res.json() as { message?: string } & Partial<Payload>;
        if (!res.ok) {
          setState({ status: 'error', code: res.status as 404 | 410 | 403 | 500, message: body.message ?? 'Erro desconhecido.' });
          return;
        }
        setState({ status: 'ok', data: body as Payload });
      })
      .catch(() => setState({ status: 'error', code: 500, message: 'Não foi possível conectar ao servidor.' }));
  }, [token]);

  return (
    <div className="public-doc-shell">
      {/* Marca Holand */}
      <header className="public-doc-header">
        <span className="public-doc-header__brand">Holand</span>
        <span className="public-doc-header__tag">Documento compartilhado</span>
      </header>

      <main className="public-doc-main">
        {state.status === 'loading' && (
          <div className="public-doc-loading">
            <span>Carregando…</span>
          </div>
        )}

        {state.status === 'error' && (
          <div className="public-doc-error">
            <span className="public-doc-error__code">{state.code}</span>
            <h1>{state.code === 410 ? 'Link expirado' : state.code === 403 ? 'Conteúdo indisponível' : 'Não encontrado'}</h1>
            <p>{state.message}</p>
          </div>
        )}

        {state.status === 'ok' && state.data.type === 'page' && (
          <article className="public-doc-page">
            <h1 className="public-doc-page__title">{state.data.title}</h1>
            {state.data.tags.length > 0 && (
              <div className="public-doc-page__tags">
                {state.data.tags.map((t) => (
                  <span key={t} className="dv2-pill">{t}</span>
                ))}
              </div>
            )}
            <p className="public-doc-page__meta">
              Atualizado em {formatDateBr(state.data.updated_at)}
            </p>
            <div
              className="dv2-editor-modal__markdown public-doc-page__content"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: renderMarkdown(state.data.content) }}
            />
          </article>
        )}

        {state.status === 'ok' && state.data.type === 'document' && (
          <article className="public-doc-file">
            <h1 className="public-doc-file__title">{state.data.title}</h1>
            <p className="public-doc-file__name">{state.data.file_name}</p>
            <p className="public-doc-file__meta">{formatBytes(state.data.file_size_bytes)}</p>
            {state.data.allow_download && state.data.download_url ? (
              <a
                href={`${BASE_URL}${state.data.download_url}`}
                className="btn btn-primary public-doc-file__download"
                download
              >
                Baixar arquivo
              </a>
            ) : (
              <p className="public-doc-file__no-download">Download não disponível para este link.</p>
            )}
          </article>
        )}
      </main>
    </div>
  );
}
