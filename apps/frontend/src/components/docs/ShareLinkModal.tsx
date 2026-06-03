import { useEffect, useState } from 'react';
import { DocsIcon } from './DocsIcon';

// ────────────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────────────

export type ShareLink = {
  id: string;
  resource_type: 'document' | 'page';
  resource_id: string;
  token: string;
  allow_download: boolean;
  expires_at: string | null;
  created_at: string;
};

export type ShareLinkCreatePayload = {
  resource_type: 'document' | 'page';
  resource_id: string;
  allow_download: boolean;
  expires_at: string | null;
};

type ShareLinkModalProps = {
  resourceType: 'document' | 'page';
  resourceId: string;
  resourceName: string;
  existingLink: ShareLink | null;
  isCreating: boolean;
  isRevoking: boolean;
  onCreate: (payload: ShareLinkCreatePayload) => Promise<void>;
  onRevoke: (linkId: string) => Promise<void>;
  onClose: () => void;
};

const BASE_PUBLIC_URL = 'orquestrador.yrdnegocios.com.br/p';

// ────────────────────────────────────────────────────────────────────────────
// Componente
// ────────────────────────────────────────────────────────────────────────────

export function ShareLinkModal({
  resourceType,
  resourceId,
  resourceName,
  existingLink,
  isCreating,
  isRevoking,
  onCreate,
  onRevoke,
  onClose
}: ShareLinkModalProps) {
  const [enabled, setEnabled] = useState(!!existingLink);
  const [allowDownload, setAllowDownload] = useState(existingLink?.allow_download ?? true);
  const [expiry, setExpiry] = useState<'none' | '30d'>(
    existingLink?.expires_at ? '30d' : 'none'
  );
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  // Fecha com Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const publicUrl = existingLink
    ? `https://${BASE_PUBLIC_URL}/${existingLink.token}`
    : null;

  async function handleToggle(next: boolean) {
    setEnabled(next);
    if (next && !existingLink) {
      const expiresAt = expiry === '30d'
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;
      await onCreate({ resource_type: resourceType, resource_id: resourceId, allow_download: allowDownload, expires_at: expiresAt });
    }
  }

  async function handleRevoke() {
    if (!existingLink) return;
    if (!confirmRevoke) { setConfirmRevoke(true); return; }
    await onRevoke(existingLink.id);
    setEnabled(false);
    setConfirmRevoke(false);
  }

  function copyUrl() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* fallback silencioso */ });
  }

  const resourceLabel = resourceType === 'document' ? 'documento' : 'página';

  return (
    <div
      className="internal-doc-preview-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="dv2-share-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Compartilhar ${resourceLabel}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <header className="dv2-share-modal__header">
          <div>
            <DocsIcon name="share" size={16} />
            <div>
              <strong>Compartilhar {resourceLabel}</strong>
              <small>{resourceName}</small>
            </div>
          </div>
          <button type="button" className="dv2-icon-btn" onClick={onClose} title="Fechar">
            ✕
          </button>
        </header>

        {/* Corpo */}
        <div className="dv2-share-modal__body">
          {/* Toggle principal */}
          <div className="dv2-share-modal__row">
            <div className="dv2-share-modal__row-label">
              <span>Compartilhar externamente</span>
              <small>Gera link público sem necessidade de login</small>
            </div>
            <button
              type="button"
              className={`dv2-toggle${enabled ? ' is-on' : ''}`}
              onClick={() => void handleToggle(!enabled)}
              disabled={isCreating}
              role="switch"
              aria-checked={enabled}
            >
              <span className="dv2-toggle__thumb" />
            </button>
          </div>

          {/* Conteúdo quando ativo */}
          {enabled && (
            <>
              {/* URL pública */}
              {publicUrl && (
                <div className="dv2-share-modal__url-box">
                  <code className="dv2-share-modal__url">{publicUrl}</code>
                  <button
                    type="button"
                    className={`dv2-share-modal__copy-btn${copied ? ' is-copied' : ''}`}
                    onClick={copyUrl}
                  >
                    {copied ? (
                      <>
                        <DocsIcon name="check" size={14} />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <DocsIcon name="copy" size={14} />
                        Copiar link
                      </>
                    )}
                  </button>
                </div>
              )}

              {!existingLink && isCreating && (
                <p className="dv2-share-modal__loading">Gerando link…</p>
              )}

              {/* Configurações */}
              <div className="dv2-share-modal__row">
                <div className="dv2-share-modal__row-label">
                  <span>Permitir download</span>
                </div>
                <button
                  type="button"
                  className={`dv2-toggle${allowDownload ? ' is-on' : ''}`}
                  onClick={() => setAllowDownload((prev) => !prev)}
                  role="switch"
                  aria-checked={allowDownload}
                >
                  <span className="dv2-toggle__thumb" />
                </button>
              </div>

              <div className="dv2-share-modal__row">
                <div className="dv2-share-modal__row-label">
                  <span>Validade</span>
                </div>
                <select
                  className="dv2-share-modal__select"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value as 'none' | '30d')}
                >
                  <option value="none">Sem expiração</option>
                  <option value="30d">30 dias</option>
                </select>
              </div>

              {/* Revogar */}
              {existingLink && (
                <div className="dv2-share-modal__revoke">
                  <button
                    type="button"
                    className={`btn${confirmRevoke ? ' btn-danger' : ' btn-secondary'}`}
                    style={{ borderColor: '#f2c7bf', color: '#b91c1c' }}
                    onClick={() => void handleRevoke()}
                    disabled={isRevoking}
                  >
                    <DocsIcon name="lock" size={14} />
                    {isRevoking ? 'Revogando…' : confirmRevoke ? 'Confirmar revogação' : 'Revogar link'}
                  </button>
                  {confirmRevoke && (
                    <small style={{ color: '#b91c1c' }}>
                      O link atual deixará de funcionar imediatamente.
                    </small>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
