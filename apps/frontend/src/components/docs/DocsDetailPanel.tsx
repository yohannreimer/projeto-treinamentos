import { useRef, useState } from 'react';
import { DocsIcon } from './DocsIcon';
import type { DocPage } from './DocsMainArea';
import type { FolderNode, InternalDocumentRow } from './treeUtils';

type SelectedItem =
  | { type: 'folder'; node: FolderNode }
  | { type: 'file'; row: InternalDocumentRow }
  | { type: 'page'; page: DocPage }
  | null;

type DocsDetailPanelProps = {
  selectedItem: SelectedItem;
  docCount: number;
  pageCount: number;
  subfolderCount: number;
  certCount: number;
  lastUpdated?: string;
  onNewPage: () => void;
  onNewFolder: () => void;
  onGenerateLink: () => void;
  onEditPage?: (page: DocPage) => void;
  onShareFile?: (row: InternalDocumentRow) => void;
  onDeleteFile?: (row: InternalDocumentRow) => void;
  onDeletePage?: (page: DocPage) => void;
  onDownloadFile?: (row: InternalDocumentRow) => void;
  onPreviewFile?: (row: InternalDocumentRow) => void;
  onFileDrop?: (files: FileList) => void;
};

function formatDateBr(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
}

export function DocsDetailPanel({
  selectedItem,
  docCount,
  pageCount,
  subfolderCount,
  certCount,
  lastUpdated,
  onNewPage,
  onNewFolder,
  onGenerateLink,
  onEditPage,
  onShareFile,
  onDeleteFile,
  onDeletePage,
  onDownloadFile,
  onPreviewFile,
  onFileDrop
}: DocsDetailPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      onFileDrop?.(e.dataTransfer.files);
    }
  }

  // ── Pasta selecionada ────────────────────────────────────────────────────
  if (!selectedItem || selectedItem.type === 'folder') {
    const folderName = selectedItem?.node.name ?? 'Documentação';
    return (
      <aside className="dv2-panel dv2-detail">
        <div className="dv2-detail__header">
          <div className="dv2-detail__header-icon">
            <DocsIcon name="folder" size={18} />
          </div>
          <div className="dv2-detail__header-copy">
            <strong>{folderName}</strong>
            {lastUpdated && <small>Atualizado {formatDateBr(lastUpdated)}</small>}
          </div>
        </div>

        <div className="dv2-detail__body">
          {/* Stats */}
          <div className="dv2-detail__stats">
            <div className="dv2-stat-cell">
              <small>Subpastas</small>
              <strong>{subfolderCount}</strong>
            </div>
            <div className="dv2-stat-cell">
              <small>Páginas</small>
              <strong>{pageCount}</strong>
            </div>
            <div className="dv2-stat-cell">
              <small>Documentos</small>
              <strong>{docCount}</strong>
            </div>
            <div className="dv2-stat-cell">
              <small>Certificados</small>
              <strong>{certCount}</strong>
            </div>
          </div>

          {/* Ações */}
          <div className="dv2-detail__actions">
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={onNewPage}
            >
              <DocsIcon name="wiki" size={14} />
              Nova página
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={onNewFolder}
            >
              <DocsIcon name="folder" size={14} />
              Nova subpasta
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', color: '#1f6b48', borderColor: '#b8dfc8' }}
              onClick={onGenerateLink}
            >
              <DocsIcon name="share" size={14} />
              Gerar link público
            </button>
          </div>

          {/* Upload zone */}
          <div
            ref={dropRef}
            className={`dv2-detail__upload-zone${isDragging ? ' is-dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <DocsIcon name="upload" size={22} />
            <span>Arraste arquivos aqui para enviar</span>
          </div>
        </div>
      </aside>
    );
  }

  // ── Arquivo selecionado ──────────────────────────────────────────────────
  if (selectedItem.type === 'file') {
    const { row } = selectedItem;
    const canPreview = row.mime_type === 'application/pdf' || row.mime_type.startsWith('image/');
    return (
      <aside className="dv2-panel dv2-detail">
        <div className="dv2-detail__header">
          <div className="dv2-detail__header-icon">
            <DocsIcon name="file-generic" size={18} />
          </div>
          <div className="dv2-detail__header-copy">
            <strong>{row.file_name}</strong>
            <small>{formatDateBr(row.created_at)}</small>
          </div>
        </div>
        <div className="dv2-detail__body">
          <div className="dv2-detail__actions">
            {canPreview && onPreviewFile && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => onPreviewFile(row)}
              >
                <DocsIcon name="eye" size={14} />
                Visualizar
              </button>
            )}
            {onDownloadFile && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => onDownloadFile(row)}
              >
                <DocsIcon name="download" size={14} />
                Baixar
              </button>
            )}
            {onShareFile && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => onShareFile(row)}
              >
                <DocsIcon name="share" size={14} />
                Compartilhar
              </button>
            )}
            {onDeleteFile && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center', color: '#b91c1c', borderColor: '#f2c7bf' }}
                onClick={() => onDeleteFile(row)}
              >
                <DocsIcon name="trash" size={14} />
                Excluir
              </button>
            )}
          </div>
        </div>
      </aside>
    );
  }

  // ── Página wiki selecionada ──────────────────────────────────────────────
  const { page } = selectedItem;
  return (
    <aside className="dv2-panel dv2-detail">
      <div className="dv2-detail__header">
        <div className="dv2-detail__header-icon" style={{ background: '#fef3cd', color: '#9a5f0a' }}>
          <DocsIcon name="wiki" size={18} />
        </div>
        <div className="dv2-detail__header-copy">
          <strong>{page.title}</strong>
          <small>Atualizado {formatDateBr(page.updated_at)}</small>
        </div>
      </div>
      <div className="dv2-detail__body">
        <div className="dv2-detail__actions">
          {onEditPage && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => onEditPage(page)}
            >
              <DocsIcon name="edit" size={14} />
              Editar página
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={onGenerateLink}
          >
            <DocsIcon name="share" size={14} />
            Compartilhar página
          </button>
          {onDeletePage && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', color: '#b91c1c', borderColor: '#f2c7bf' }}
              onClick={() => onDeletePage(page)}
            >
              <DocsIcon name="trash" size={14} />
              Excluir página
            </button>
          )}
        </div>
        {page.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {page.tags.map((tag) => (
              <span key={tag} className="dv2-pill">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
