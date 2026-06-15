import { useEffect, useRef, useState } from 'react';
import { DocsIcon } from './DocsIcon';
import type { DocPage } from './DocsMainArea';

// ────────────────────────────────────────────────────────────────────────────
// Markdown render simples (sem deps externas)
// Usamos dangerouslySetInnerHTML apenas para o modo leitura — o conteúdo
// vem do próprio usuário logado, não de terceiros.
// ────────────────────────────────────────────────────────────────────────────

function renderMarkdown(md: string): string {
  return md
    // Cabeçalhos
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold e itálico
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Código inline
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Listas não-ordenadas
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // Quebras de linha
    .replace(/\n{2,}/g, '</p><p>')
    // Wrap em parágrafo
    .replace(/^(?!<[hlpcou])/gm, '')
    // Limpa p vazios
    .replace(/<p><\/p>/g, '')
    .replace(/^(.+)$/gm, (line) => {
      if (/^<[hlu1-9li]/.test(line)) return line;
      return `<p>${line}</p>`;
    })
    .replace(/<li>(.+?)<\/li>/g, '<li>$1</li>')
    .replace(/(<li>.+<\/li>)+/g, (match) => `<ul>${match}</ul>`);
}

// ────────────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────────────

type PageEditorMode = 'edit' | 'read';

export type PageEditorSavePayload = {
  title: string;
  content: string;
  tags: string[];
  is_draft: boolean;
};

type PageEditorModalProps = {
  /** Página a editar. Se null, modo criação. */
  page: DocPage | null;
  folderPath: string;
  isSaving: boolean;
  onSave: (payload: PageEditorSavePayload) => Promise<void>;
  onClose: () => void;
};

// ────────────────────────────────────────────────────────────────────────────
// Componente
// ────────────────────────────────────────────────────────────────────────────

export function PageEditorModal({ page, folderPath, isSaving, onSave, onClose }: PageEditorModalProps) {
  const [mode, setMode] = useState<PageEditorMode>(page ? 'read' : 'edit');
  const [title, setTitle] = useState(page?.title ?? '');
  const [content, setContent] = useState(page?.content ?? '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(page?.tags ?? []);
  const [error, setError] = useState('');

  const titleRef = useRef<HTMLInputElement>(null);
  const hasFocusedEditor = useRef(false);

  useEffect(() => {
    if (mode !== 'edit') {
      hasFocusedEditor.current = false;
      return;
    }
    if (hasFocusedEditor.current) return;
    hasFocusedEditor.current = true;
    if (mode === 'edit') {
      titleRef.current?.focus();
    }
  }, [mode]);

  // Fecha com Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleSave(isDraft: boolean) {
    if (!title.trim()) { setError('Informe o título da página.'); return; }
    setError('');
    await onSave({ title: title.trim(), content, tags, is_draft: isDraft });
    onClose();
  }

  const isDraft = page?.is_draft ?? true;

  return (
    <div
      className="internal-doc-preview-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="dv2-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Nova página'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Cabeçalho ── */}
        <header className="dv2-editor-modal__header">
          <div className="dv2-editor-modal__header-left">
            <span className="dv2-editor-modal__kicker">
              <DocsIcon name="wiki" size={13} />
              {folderPath}
            </span>
            {page && (
              <span className={`dv2-badge dv2-badge--${isDraft ? 'amber' : 'green'}`}>
                {isDraft ? 'Rascunho' : 'Publicado'}
              </span>
            )}
          </div>
          <div className="dv2-editor-modal__header-right">
            {page && (
              <button
                type="button"
                className={`dv2-icon-btn${mode === 'read' ? ' is-active' : ''}`}
                title="Modo leitura"
                onClick={() => setMode('read')}
              >
                <DocsIcon name="eye" size={14} />
              </button>
            )}
            <button
              type="button"
              className={`dv2-icon-btn${mode === 'edit' ? ' is-active' : ''}`}
              title="Modo edição"
              onClick={() => setMode('edit')}
            >
              <DocsIcon name="edit" size={14} />
            </button>
            <button type="button" className="dv2-icon-btn" title="Fechar (Esc)" onClick={onClose}>
              ✕
            </button>
          </div>
        </header>

        {/* ── Corpo ── */}
        <div className="dv2-editor-modal__body">
          {mode === 'edit' ? (
            <>
              {/* Título */}
              <input
                ref={titleRef}
                className="dv2-editor-modal__title-input"
                placeholder="Título da página"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              {/* Tags */}
              <div className="dv2-editor-modal__tags">
                {tags.map((tag) => (
                  <span key={tag} className="dv2-pill dv2-pill--removable">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      aria-label={`Remover tag ${tag}`}
                    >✕</button>
                  </span>
                ))}
                <input
                  className="dv2-editor-modal__tag-input"
                  placeholder="Adicionar tag…"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addTag(tagInput);
                    }
                  }}
                  onBlur={() => tagInput.trim() && addTag(tagInput)}
                />
              </div>

              {/* Área de conteúdo Markdown */}
              <textarea
                className="dv2-editor-modal__textarea"
                placeholder="Escreva em Markdown…&#10;&#10;# Título&#10;## Seção&#10;**negrito**, *itálico*, `código`"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck
              />

              {error && <p className="dv2-editor-modal__error">{error}</p>}
            </>
          ) : (
            /* Modo leitura */
            <div className="dv2-editor-modal__read-view">
              <h1 className="dv2-editor-modal__read-title">{title || 'Sem título'}</h1>
              {tags.length > 0 && (
                <div className="dv2-editor-modal__read-tags">
                  {tags.map((tag) => <span key={tag} className="dv2-pill">{tag}</span>)}
                </div>
              )}
              {content ? (
                <div
                  className="dv2-editor-modal__markdown"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                />
              ) : (
                <p className="dv2-editor-modal__read-empty">Ainda sem conteúdo. Clique em editar para começar.</p>
              )}
            </div>
          )}
        </div>

        {/* ── Rodapé ── */}
        {mode === 'edit' && (
          <footer className="dv2-editor-modal__footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isSaving}
              onClick={() => void handleSave(true)}
            >
              {isSaving ? 'Salvando…' : 'Salvar rascunho'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isSaving}
              onClick={() => void handleSave(false)}
            >
              {isSaving ? 'Publicando…' : 'Publicar'}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}
