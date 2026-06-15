import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { api, createInternalAuthHeaders } from '../services/api';
import { askDestructiveConfirmation } from '../utils/destructive';
import { DocsSidebar } from '../components/docs/DocsSidebar';
import { DocsMainArea, type DocPage } from '../components/docs/DocsMainArea';
import { DocsDetailPanel } from '../components/docs/DocsDetailPanel';
import { PageEditorModal, type PageEditorSavePayload } from '../components/docs/PageEditorModal';
import { ShareLinkModal, type ShareLink } from '../components/docs/ShareLinkModal';
import {
  buildTree,
  fileFolderPath,
  findNode,
  CLIENTS_PATH,
  INTERNAL_PATH,
  ROOT_PATH,
  isSatisfactionPath,
  selectedCompanyIdFromPath,
  type FolderNode,
  type InternalDocumentRow,
  type InternalDocumentFolderRow,
  type CompanyRow,
  type ModuleRow
} from '../components/docs/treeUtils';

// ────────────────────────────────────────────────────────────────────────────
// Tipos locais
// ────────────────────────────────────────────────────────────────────────────

type FollowupEvaluationRow = {
  id: string;
  title: string;
  status: string;
  respondent_name: string | null;
  rating: number | null;
  submitted_at: string | null;
  created_at: string;
  public_path?: string;
};

type FileDraft = {
  file_name: string;
  mime_type: string;
  file_data_base64: string;
  file_size_bytes: number;
} | null;

type PreviewDocument = {
  row: InternalDocumentRow;
  objectUrl: string;
  fileName: string;
  mimeType: string;
} | null;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const MAX_DOC_UPLOAD_BYTES = 6_000_000;

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function fileNameFromContentDisposition(contentDisposition: string, fallback: string): string {
  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  const simpleMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  const encoded = utfMatch?.[1] ?? simpleMatch?.[1] ?? '';
  return encoded ? decodeURIComponent(encoded) : fallback;
}

async function errorMessageFromResponse(response: Response, fallback: string): Promise<string> {
  const body = await response.text();
  if (!body) return fallback;
  try {
    return (JSON.parse(body) as { message?: string }).message || fallback;
  } catch {
    return body;
  }
}

function formatBytes(bytes?: number): string {
  const v = Number(bytes ?? 0);
  if (v <= 0) return '-';
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateBr(dateIso?: string | null): string {
  if (!dateIso) return '-';
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? dateIso : d.toLocaleDateString('pt-BR');
}

function isCertificateDocument(row: InternalDocumentRow): boolean {
  return String(row.category ?? '').toLowerCase() === 'certificados'
    || row.title.toLowerCase().includes('certificado')
    || row.file_name.toLowerCase().includes('certificado');
}

// ────────────────────────────────────────────────────────────────────────────
// Componente principal
// ────────────────────────────────────────────────────────────────────────────

export function InternalDocsPage() {
  // ── Dados ────────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<InternalDocumentRow[]>([]);
  const [folders, setFolders] = useState<InternalDocumentFolderRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [pages, setPages] = useState<DocPage[]>([]);
  const [followupsByCompany, setFollowupsByCompany] = useState<Record<string, FollowupEvaluationRow[]>>({});

  // ── Navegação ────────────────────────────────────────────────────────────
  const [selectedPath, setSelectedPath] = useState(INTERNAL_PATH);

  // ── Upload / criação ─────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [fileDraft, setFileDraft] = useState<FileDraft>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [newFolderPanelOpen, setNewFolderPanelOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<PreviewDocument>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // ── PageEditorModal ───────────────────────────────────────────────────────
  const [pageEditorOpen, setPageEditorOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<DocPage | null>(null);
  const [savingPage, setSavingPage] = useState(false);

  // ── Detail panel — item selecionado ──────────────────────────────────────
  type DetailItem =
    | { type: 'folder'; node: FolderNode }
    | { type: 'file'; row: InternalDocumentRow }
    | { type: 'page'; page: DocPage };

  const [detailItem, setDetailItem] = useState<DetailItem | null>(null);

  // Reset ao mudar de pasta
  const prevSelectedPath = useRef(selectedPath);
  useEffect(() => {
    if (prevSelectedPath.current !== selectedPath) {
      prevSelectedPath.current = selectedPath;
      setDetailItem(null);
    }
  }, [selectedPath]);

  // ── ShareLinkModal ────────────────────────────────────────────────────────
  const [shareLinkOpen, setShareLinkOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ type: 'document' | 'page'; id: string; name: string } | null>(null);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [creatingShareLink, setCreatingShareLink] = useState(false);
  const [revokingShareLink, setRevokingShareLink] = useState(false);

  // ────────────────────────────────────────────────────────────────────────
  // Carregamento de dados
  // ────────────────────────────────────────────────────────────────────────

  async function loadAll() {
    const [docRows, folderRows, companyRows, moduleRows] = await Promise.all([
      api.internalDocuments() as Promise<InternalDocumentRow[]>,
      api.internalDocumentFolders() as Promise<InternalDocumentFolderRow[]>,
      api.companies() as Promise<CompanyRow[]>,
      api.modules() as Promise<ModuleRow[]>
    ]);
    setRows(docRows ?? []);
    setFolders(folderRows ?? []);
    setCompanies(companyRows ?? []);
    setModules(moduleRows ?? []);

    // Carrega páginas wiki (endpoint já disponível)
    try {
      const pageRows = await api.docPages() as DocPage[];
      setPages(pageRows ?? []);
    } catch {
      // Silencioso: endpoint pode não existir em dev mais antigo
    }
  }

  useEffect(() => {
    loadAll().catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => () => {
    if (previewDocument?.objectUrl) window.URL.revokeObjectURL(previewDocument.objectUrl);
  }, [previewDocument]);

  useEffect(() => {
    const companyId = selectedCompanyIdFromPath(selectedPath);
    if (!companyId || !isSatisfactionPath(selectedPath) || followupsByCompany[companyId]) return;
    api.companyFollowupEvaluations(companyId)
      .then((items) => setFollowupsByCompany((cur) => ({ ...cur, [companyId]: (items as FollowupEvaluationRow[]) ?? [] })))
      .catch((err: Error) => setError(err.message));
  }, [followupsByCompany, selectedPath]);

  // ────────────────────────────────────────────────────────────────────────
  // Árvore e derivados
  // ────────────────────────────────────────────────────────────────────────

  const tree = useMemo(
    () => buildTree(companies, modules, folders, rows),
    [companies, modules, folders, rows]
  );

  const selectedNode = useMemo(() => {
    const found = findNode(tree, selectedPath);
    return found ?? findNode(tree, INTERNAL_PATH) ?? tree;
  }, [selectedPath, tree]);

  const selectedCompanyId = selectedCompanyIdFromPath(selectedNode.path);

  // resolvedDetailItem fica aqui — depois de selectedNode
  const resolvedDetailItem: DetailItem = detailItem ?? { type: 'folder', node: selectedNode };

  // ────────────────────────────────────────────────────────────────────────
  // Operações
  // ────────────────────────────────────────────────────────────────────────

  async function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    if (!isPdf && !isImage) { setError('Envie apenas PDF ou imagem.'); return; }
    if (file.size > MAX_DOC_UPLOAD_BYTES) { setError('Arquivo muito grande. Limite de 6 MB.'); return; }
    try {
      const dataUrl = await toDataUrl(file);
      setFileDraft({ file_name: file.name, mime_type: file.type, file_data_base64: dataUrl, file_size_bytes: file.size });
      setError('');
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ''));
    } catch (err) { setError((err as Error).message); }
  }

  async function handleFileDrop(fileList: FileList) {
    const file = fileList[0];
    if (!file) return;
    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    if (!isPdf && !isImage) { setError('Envie apenas PDF ou imagem.'); return; }
    if (file.size > MAX_DOC_UPLOAD_BYTES) { setError('Arquivo muito grande. Limite de 6 MB.'); return; }
    try {
      const dataUrl = await toDataUrl(file);
      setFileDraft({ file_name: file.name, mime_type: file.type, file_data_base64: dataUrl, file_size_bytes: file.size });
      setTitle(file.name.replace(/\.[^.]+$/, ''));
      setError('');
      setUploadPanelOpen(true);
    } catch (err) { setError((err as Error).message); }
  }

  async function createFolder() {
    if (selectedNode.path === ROOT_PATH) { setError('Escolha uma seção antes de criar uma pasta.'); return; }
    if (!newFolderName.trim()) { setError('Informe o nome da pasta.'); return; }
    setCreatingFolder(true); setError(''); setMessage('');
    try {
      const folder = await api.createInternalDocumentFolder({
        parent_path: selectedNode.path,
        name: newFolderName.trim()
      }) as InternalDocumentFolderRow;
      setFolders((cur) => [...cur, folder]);
      setSelectedPath(folder.path);
      setNewFolderName('');
      setNewFolderPanelOpen(false);
      setMessage('Pasta criada.');
    } catch (err) { setError((err as Error).message); }
    finally { setCreatingFolder(false); }
  }

  async function createDocument() {
    if (selectedNode.path === ROOT_PATH) { setError('Escolha uma pasta antes de salvar.'); return; }
    if (!title.trim()) { setError('Informe o título.'); return; }
    if (!fileDraft) { setError('Selecione um arquivo PDF ou imagem.'); return; }
    setError(''); setMessage('');
    try {
      await api.createInternalDocument({
        title: title.trim(),
        category: category.trim() || null,
        notes: notes.trim() || null,
        folder_path: selectedNode.path,
        file_name: fileDraft.file_name,
        mime_type: fileDraft.mime_type,
        file_data_base64: fileDraft.file_data_base64
      });
      setTitle(''); setCategory(''); setNotes(''); setFileDraft(null);
      setUploadPanelOpen(false);
      setMessage('Documento salvo.');
      await loadAll();
    } catch (err) { setError((err as Error).message); }
  }

  async function deleteDocument(row: InternalDocumentRow) {
    const phrase = askDestructiveConfirmation(`Excluir documento "${row.title}"`);
    if (!phrase) return;
    setError(''); setMessage('');
    try {
      await api.deleteInternalDocument(row.id, phrase);
      setMessage('Documento removido.');
      await loadAll();
    } catch (err) { setError((err as Error).message); }
  }

  // ── Page handlers ────────────────────────────────────────────────────────

  async function savePage(payload: PageEditorSavePayload) {
    setSavingPage(true);
    try {
      if (editingPage) {
        const updated = await api.updateDocPage(editingPage.id, payload) as DocPage;
        setPages((cur) => cur.map((p) => p.id === updated.id ? updated : p));
      } else {
        const created = await api.createDocPage({ ...payload, folder_path: selectedPath }) as DocPage;
        setPages((cur) => [...cur, created]);
      }
      setMessage(editingPage ? 'Página atualizada.' : 'Página criada.');
    } finally {
      setSavingPage(false);
      setPageEditorOpen(false);
      setEditingPage(null);
    }
  }

  function openNewPage() {
    setEditingPage(null);
    setPageEditorOpen(true);
  }

  function openEditPage(page: DocPage) {
    setEditingPage(page);
    setPageEditorOpen(true);
  }

  // ── Share link handlers ───────────────────────────────────────────────────

  function openShareForFile(row: InternalDocumentRow) {
    setShareTarget({ type: 'document', id: row.id, name: row.file_name });
    setShareLinkOpen(true);
  }

  function openShareForPage(page: DocPage) {
    setShareTarget({ type: 'page', id: page.id, name: page.title });
    setShareLinkOpen(true);
  }

  async function createShareLink(payload: Parameters<typeof api.createShareLink>[0]) {
    setCreatingShareLink(true);
    try {
      const link = await api.createShareLink(payload) as ShareLink;
      setShareLinks((cur) => {
        const filtered = cur.filter((l) => !(l.resource_type === link.resource_type && l.resource_id === link.resource_id));
        return [...filtered, link];
      });
    } finally {
      setCreatingShareLink(false);
    }
  }

  async function revokeShareLink(id: string) {
    setRevokingShareLink(true);
    try {
      await api.revokeShareLink(id);
      setShareLinks((cur) => cur.filter((l) => l.id !== id));
      setShareLinkOpen(false);
    } finally {
      setRevokingShareLink(false);
    }
  }

  const activeShareLink = shareTarget
    ? shareLinks.find((l) => l.resource_type === shareTarget.type && l.resource_id === shareTarget.id) ?? null
    : null;

  // ── File download/preview ─────────────────────────────────────────────────

  async function downloadDocument(row: InternalDocumentRow) {
    setDownloadingId(row.id); setError(''); setMessage('');
    try {
      const response = await fetch(api.internalDocumentDownloadUrl(row.id), { headers: createInternalAuthHeaders() });
      if (!response.ok) throw new Error(await errorMessageFromResponse(response, 'Falha ao baixar.'));
      const blob = await response.blob();
      const fileName = fileNameFromContentDisposition(response.headers.get('Content-Disposition') ?? '', row.file_name || 'documento');
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl; anchor.download = fileName;
      document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) { setError((err as Error).message); }
    finally { setDownloadingId(null); }
  }

  async function previewDocument_(row: InternalDocumentRow) {
    if (row.mime_type !== 'application/pdf' && !row.mime_type.startsWith('image/')) {
      setError('Este tipo de arquivo não tem pré-visualização.'); return;
    }
    setPreviewingId(row.id); setError(''); setMessage('');
    try {
      const response = await fetch(api.internalDocumentDownloadUrl(row.id), { headers: createInternalAuthHeaders() });
      if (!response.ok) throw new Error(await errorMessageFromResponse(response, 'Falha ao abrir prévia.'));
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const fileName = fileNameFromContentDisposition(response.headers.get('Content-Disposition') ?? '', row.file_name || 'documento');
      if (previewDocument?.objectUrl) window.URL.revokeObjectURL(previewDocument.objectUrl);
      setPreviewDocument({ row, objectUrl, fileName, mimeType: row.mime_type || blob.type || 'application/octet-stream' });
    } catch (err) { setError((err as Error).message); }
    finally { setPreviewingId(null); }
  }

  function closePreview() {
    if (previewDocument?.objectUrl) window.URL.revokeObjectURL(previewDocument.objectUrl);
    setPreviewDocument(null);
  }

  // Detail panel: stats do selectedNode
  const docsInFolder = useMemo(
    () => rows.filter((r) => fileFolderPath(r) === selectedNode.path),
    [rows, selectedNode.path]
  );
  const certCount = docsInFolder.filter(isCertificateDocument).length;

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div className="page internal-docs-page">
      <header className="page-header">
        <h1>Documentação</h1>
        <p>Hub de conhecimento: clientes, processos, templates e base de conhecimento.</p>
      </header>

      {error && <p className="error">{error}</p>}
      {message && <p className="info">{message}</p>}

      {/* ── Upload modal / drawer ── */}
      {uploadPanelOpen && (
        <div className="internal-doc-preview-backdrop" role="presentation" onClick={() => setUploadPanelOpen(false)}>
          <section
            className="internal-doc-preview-modal"
            style={{ maxWidth: 520, height: 'auto', maxHeight: 'calc(100vh - 80px)' }}
            role="dialog"
            aria-modal="true"
            aria-label="Enviar arquivo"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="internal-doc-preview-header">
              <div><h2>Enviar arquivo</h2><p>Pasta: {selectedNode.name}</p></div>
              <button type="button" onClick={() => setUploadPanelOpen(false)}>Fechar</button>
            </header>
            <div style={{ padding: 20, overflow: 'auto', display: 'grid', gap: 12 }}>
              <label className="form-label">Título
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Checklist de implantação" />
              </label>
              <label className="form-label">Categoria
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex.: Suporte, Certificados" />
              </label>
              <label className="form-label">Descrição
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contexto rápido do arquivo." />
              </label>
              <label className="form-label">Arquivo (PDF ou imagem, máx. 6 MB)
                <input ref={fileInputRef} type="file" accept="application/pdf,image/*" onChange={onPickFile} />
              </label>
              {fileDraft && (
                <p className="form-hint">Selecionado: <strong>{fileDraft.file_name}</strong> ({formatBytes(fileDraft.file_size_bytes)})</p>
              )}
              <button type="button" className="btn btn-primary" onClick={() => void createDocument()}>
                Salvar na pasta
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ── Nova pasta modal ── */}
      {newFolderPanelOpen && (
        <div className="internal-doc-preview-backdrop" role="presentation" onClick={() => setNewFolderPanelOpen(false)}>
          <section
            className="internal-doc-preview-modal"
            style={{ maxWidth: 420, height: 'auto' }}
            role="dialog"
            aria-modal="true"
            aria-label="Nova pasta"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="internal-doc-preview-header">
              <div><h2>Nova pasta</h2><p>Em: {selectedNode.name}</p></div>
              <button type="button" onClick={() => setNewFolderPanelOpen(false)}>Fechar</button>
            </header>
            <div style={{ padding: 20, display: 'grid', gap: 12 }}>
              <label className="form-label">Nome
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Ex.: Contratos"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') void createFolder(); }}
                />
              </label>
              <button type="button" className="btn btn-primary" disabled={creatingFolder} onClick={() => void createFolder()}>
                {creatingFolder ? 'Criando…' : 'Criar pasta'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ── Layout principal ── */}
      <div className="dv2-explorer">
        <DocsSidebar
          tree={tree}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
          onCreateFolder={(parentPath) => {
            setSelectedPath(parentPath);
            setNewFolderPanelOpen(true);
          }}
        />

        <DocsMainArea
          tree={tree}
          selectedPath={selectedPath}
          selectedNode={selectedNode}
          rows={rows}
          pages={pages}
          downloadingId={downloadingId}
          previewingId={previewingId}
          onSelectPath={setSelectedPath}
          onNewFolder={() => setNewFolderPanelOpen(true)}
          onNewPage={openNewPage}
          onUploadFile={() => setUploadPanelOpen(true)}
          onDownload={(row) => void downloadDocument(row)}
          onPreview={(row) => void previewDocument_(row)}
          onShare={openShareForFile}
          onEditPage={openEditPage}
          onSharePage={openShareForPage}
          onSelectFile={(row) => setDetailItem({ type: 'file', row })}
          onSelectPage={(page) => setDetailItem({ type: 'page', page })}
        />

        <DocsDetailPanel
          selectedItem={resolvedDetailItem}
          docCount={docsInFolder.length}
          pageCount={pages.filter((p) => p.folder_path === selectedPath).length}
          subfolderCount={selectedNode.children.length}
          certCount={certCount}
          onNewPage={openNewPage}
          onNewFolder={() => setNewFolderPanelOpen(true)}
          onGenerateLink={() => setShareLinkOpen(true)}
          onPreviewFile={(row) => void previewDocument_(row)}
          onDownloadFile={(row) => void downloadDocument(row)}
          onDeleteFile={(row) => void deleteDocument(row)}
          onFileDrop={(files) => void handleFileDrop(files)}
        />
      </div>

      {/* ── PageEditorModal ── */}
      {pageEditorOpen && (
        <PageEditorModal
          page={editingPage}
          folderPath={selectedNode.name}
          isSaving={savingPage}
          onSave={savePage}
          onClose={() => { setPageEditorOpen(false); setEditingPage(null); }}
        />
      )}

      {/* ── ShareLinkModal ── */}
      {shareLinkOpen && shareTarget && (
        <ShareLinkModal
          resourceType={shareTarget.type}
          resourceId={shareTarget.id}
          resourceName={shareTarget.name}
          existingLink={activeShareLink}
          isCreating={creatingShareLink}
          isRevoking={revokingShareLink}
          onCreate={(payload) => createShareLink(payload)}
          onRevoke={revokeShareLink}
          onClose={() => setShareLinkOpen(false)}
        />
      )}

      {/* ── Preview modal ── */}
      {previewDocument && (
        <div className="internal-doc-preview-backdrop" role="presentation" onClick={closePreview}>
          <section
            className="internal-doc-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label={previewDocument.row.title}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="internal-doc-preview-header">
              <div>
                <span className="internal-doc-preview-kicker">
                  {isCertificateDocument(previewDocument.row) ? 'Certificado Holand' : 'Documento'}
                </span>
                <h2>{previewDocument.row.title}</h2>
                <p>{previewDocument.fileName} · {formatBytes(previewDocument.row.file_size_bytes)}</p>
              </div>
              <div className="actions actions-compact">
                <button type="button" onClick={() => void downloadDocument(previewDocument.row)}>Download</button>
                <button type="button" onClick={closePreview}>Fechar</button>
              </div>
            </header>
            <div className="internal-doc-preview-frame">
              {previewDocument.mimeType.startsWith('image/') ? (
                <img src={previewDocument.objectUrl} alt={previewDocument.row.title} />
              ) : (
                <iframe title="Prévia do documento" src={previewDocument.objectUrl} />
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
