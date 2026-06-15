import { useEffect, useRef, useState } from 'react';
import { DocsIcon } from './DocsIcon';
import { FolderCard, type DocsSectionKey } from './FolderCard';
import { WikiPageCard } from './WikiPageCard';
import { FileCard } from './FileCard';
import {
  CLIENTS_PATH,
  breadcrumbNodes,
  fileFolderPath,
  sectionOfPath,
  type FolderNode,
  type InternalDocumentRow
} from './treeUtils';

// ────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ────────────────────────────────────────────────────────────────────────────

export type DocPage = {
  id: string;
  folder_path: string;
  title: string;
  content: string;
  tags: string[];
  is_draft: boolean;
  created_at: string;
  updated_at: string;
};

type ViewMode = 'grid' | 'list';

const SECTION_LABELS: Record<string, string> = {
  clients: 'Cliente',
  processes: 'Processo',
  templates: 'Template',
  knowledge: 'Conhecimento',
  root: 'Documentação'
};

function mapSectionKey(key: ReturnType<typeof sectionOfPath>): DocsSectionKey {
  switch (key) {
    case 'clients': return 'clients';
    case 'processes': return 'processes';
    case 'templates': return 'templates';
    case 'knowledge': return 'knowledge';
    default: return 'processes';
  }
}

function isCertDoc(row: InternalDocumentRow): boolean {
  return String(row.category ?? '').toLowerCase() === 'certificados'
    || row.title.toLowerCase().includes('certificado')
    || row.file_name.toLowerCase().includes('certificado');
}

// ────────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────────

type DocsMainAreaProps = {
  tree: FolderNode;
  selectedPath: string;
  selectedNode: FolderNode;
  rows: InternalDocumentRow[];
  pages: DocPage[];
  downloadingId: string | null;
  previewingId: string | null;
  onSelectPath: (path: string) => void;
  onNewFolder: () => void;
  onNewPage: () => void;
  onUploadFile: () => void;
  onDownload: (row: InternalDocumentRow) => void;
  onPreview: (row: InternalDocumentRow) => void;
  onShare: (row: InternalDocumentRow) => void;
  onEditPage: (page: DocPage) => void;
  onSharePage: (page: DocPage) => void;
  onSelectFile?: (row: InternalDocumentRow) => void;
  onSelectPage?: (page: DocPage) => void;
};

// ────────────────────────────────────────────────────────────────────────────
// Componente
// ────────────────────────────────────────────────────────────────────────────

export function DocsMainArea({
  tree,
  selectedPath,
  selectedNode,
  rows,
  pages,
  downloadingId,
  previewingId,
  onSelectPath,
  onNewFolder,
  onNewPage,
  onUploadFile,
  onDownload,
  onPreview,
  onShare,
  onEditPage,
  onSharePage,
  onSelectFile,
  onSelectPage
}: DocsMainAreaProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem('dv2-view-mode') as ViewMode) ?? 'grid'; } catch { return 'grid'; }
  });
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!newMenuOpen) return;
    function onDoc(e: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [newMenuOpen]);

  function setView(mode: ViewMode) {
    setViewMode(mode);
    try { localStorage.setItem('dv2-view-mode', mode); } catch { /* noop */ }
  }

  // Dados filtrados para o path selecionado
  const childFolders = selectedNode.children;

  const currentPageItems = pages.filter(
    (p) => p.folder_path === selectedPath || p.folder_path === selectedPath + '/'
  );

  const currentFileItems = rows.filter((r) => fileFolderPath(r) === selectedPath);

  const crumbs = breadcrumbNodes(tree, selectedPath);
  const section = sectionOfPath(selectedPath);
  const sectionLabel = SECTION_LABELS[section];

  const totalCount = `${childFolders.length > 0 ? `${childFolders.length} pasta${childFolders.length > 1 ? 's' : ''}` : ''}${currentPageItems.length > 0 ? ` · ${currentPageItems.length} pág${currentPageItems.length > 1 ? 's' : ''}` : ''}${currentFileItems.length > 0 ? ` · ${currentFileItems.length} doc${currentFileItems.length > 1 ? 's' : ''}` : ''}`.replace(/^·\s/, '').trim();

  const isEmpty = childFolders.length === 0 && currentPageItems.length === 0 && currentFileItems.length === 0;

  // Detecta se está dentro de /Clientes para rótulo de seção
  const isClientSection = selectedPath.startsWith(CLIENTS_PATH);

  return (
    <div className="dv2-panel dv2-main">
      {/* Breadcrumb */}
      <nav className="dv2-breadcrumb" aria-label="Localização atual">
        {crumbs.map((crumb, i) => {
          const isCurrent = i === crumbs.length - 1;
          return (
            <span key={crumb.path} style={{ display: 'contents' }}>
              {i > 0 && <span className="dv2-breadcrumb__sep" aria-hidden="true">›</span>}
              <button
                type="button"
                className={`dv2-breadcrumb__item${isCurrent ? ' is-current' : ''}`}
                onClick={() => !isCurrent && onSelectPath(crumb.path)}
              >
                {crumb.name}
              </button>
            </span>
          );
        })}
      </nav>

      {/* Toolbar */}
      <div className="dv2-toolbar">
        <div className="dv2-toolbar__title">
          <h2>{selectedNode.name}</h2>
          {totalCount && <span className="dv2-toolbar__counter">{totalCount}</span>}
        </div>

        {sectionLabel && section !== 'root' && (
          <span className="dv2-section-badge">{isClientSection ? 'Cliente' : sectionLabel}</span>
        )}

        <div className="dv2-toolbar__actions">
          <button
            type="button"
            className={`dv2-icon-btn${viewMode === 'grid' ? ' is-active' : ''}`}
            title="Visualização em grade"
            aria-pressed={viewMode === 'grid'}
            onClick={() => setView('grid')}
          >
            <DocsIcon name="grid" size={14} />
          </button>
          <button
            type="button"
            className={`dv2-icon-btn${viewMode === 'list' ? ' is-active' : ''}`}
            title="Visualização em lista"
            aria-pressed={viewMode === 'list'}
            onClick={() => setView('list')}
          >
            <DocsIcon name="list" size={14} />
          </button>

          {/* Dropdown + Novo */}
          <div className="dv2-new-btn" ref={newMenuRef}>
            <button
              type="button"
              className="dv2-new-btn__trigger"
              onClick={() => setNewMenuOpen((prev) => !prev)}
            >
              <DocsIcon name="plus" size={14} />
              Novo
            </button>
            {newMenuOpen && (
              <div className="dv2-dropdown">
                <button
                  type="button"
                  className="dv2-dropdown__item"
                  onClick={() => { setNewMenuOpen(false); onNewFolder(); }}
                >
                  <DocsIcon name="folder" size={14} />
                  Nova subpasta
                </button>
                <button
                  type="button"
                  className="dv2-dropdown__item"
                  onClick={() => { setNewMenuOpen(false); onNewPage(); }}
                >
                  <DocsIcon name="wiki" size={14} />
                  Nova página
                </button>
                <button
                  type="button"
                  className="dv2-dropdown__item"
                  onClick={() => { setNewMenuOpen(false); onUploadFile(); }}
                >
                  <DocsIcon name="upload" size={14} />
                  Enviar arquivo
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grade de itens */}
      {isEmpty ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: '#a0b0be', fontSize: '0.85rem' }}>
          <DocsIcon name="folder-open" size={32} />
          <p style={{ margin: '12px 0 0' }}>Pasta vazia. Crie uma subpasta, página ou envie um arquivo.</p>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'dv2-grid' : 'dv2-grid dv2-grid--list'} data-view-mode={viewMode}>
          {/* Subpastas */}
          {childFolders.map((folder) => (
            <FolderCard
              key={folder.path}
              name={folder.name}
              section={mapSectionKey(sectionOfPath(folder.path))}
              subfolderCount={folder.children.filter((c) => c.children.length > 0 || true).length}
              onClick={() => onSelectPath(folder.path)}
            />
          ))}

          {/* Páginas wiki */}
          {currentPageItems.map((page) => (
            <WikiPageCard
              key={page.id}
              title={page.title}
              excerpt={page.content.slice(0, 120)}
              updatedAt={page.updated_at}
              isDraft={page.is_draft}
              onClick={() => {
                onSelectPage?.(page);
                onEditPage(page);
              }}
            />
          ))}

          {/* Arquivos */}
          {currentFileItems.map((row) => (
            <FileCard
              key={row.id}
              fileName={row.file_name}
              mimeType={row.mime_type}
              fileSizeBytes={row.file_size_bytes}
              createdAt={row.created_at}
              isCert={isCertDoc(row)}
              canPreview={row.mime_type === 'application/pdf' || row.mime_type.startsWith('image/')}
              isDownloading={downloadingId === row.id}
              isPreviewing={previewingId === row.id}
              onView={() => { onSelectFile?.(row); onPreview(row); }}
              onDownload={() => { onSelectFile?.(row); onDownload(row); }}
              onShare={() => { onSelectFile?.(row); onShare(row); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
