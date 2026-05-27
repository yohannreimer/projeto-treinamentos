import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Section } from '../components/Section';
import { api, createInternalAuthHeaders } from '../services/api';
import { askDestructiveConfirmation } from '../utils/destructive';

type InternalDocumentRow = {
  id: string;
  title: string;
  category: string | null;
  notes: string | null;
  folder_path?: string | null;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
  updated_at: string;
};

type InternalDocumentFolderRow = {
  id: string;
  parent_path: string;
  path: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type CompanyRow = {
  id: string;
  name: string;
  status?: string;
};

type ModuleRow = {
  id: string;
  code?: string;
  name: string;
  delivery_mode?: string;
};

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

type FolderNode = {
  path: string;
  name: string;
  parentPath: string | null;
  system: boolean;
  manualId?: string;
  children: FolderNode[];
};

const MAX_DOC_UPLOAD_BYTES = 6_000_000;
const ROOT_PATH = '/';
const CLIENTS_PATH = '/Clientes';
const INTERNAL_PATH = '/Interna';
const SATISFACTION_SEGMENT = 'Pesquisa%20de%20satisfacao';

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function normalizeFolderPath(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw === ROOT_PATH) return raw === ROOT_PATH ? ROOT_PATH : INTERNAL_PATH;
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.replace(/\/{2,}/g, '/').replace(/\/$/, '') || INTERNAL_PATH;
}

function pathSegment(label: string): string {
  return encodeURIComponent(label.trim().replace(/\s+/g, ' '));
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function parentPath(path: string): string | null {
  const normalized = normalizeFolderPath(path);
  if (normalized === ROOT_PATH) return null;
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? ROOT_PATH : normalized.slice(0, index);
}

function fileFolderPath(row: InternalDocumentRow): string {
  if (row.folder_path) return normalizeFolderPath(row.folder_path);

  const notes = row.notes ?? '';
  const certificateKey = notes.match(/Chave:\s*(CERTIFICADO_[^\n]+)/)?.[1]?.trim();
  if (certificateKey) {
    const parts = certificateKey.split(':');
    if (parts[0] === 'CERTIFICADO_TURMA_MODULO' && parts[2] && parts[3]) {
      return `${CLIENTS_PATH}/${parts[2]}/modulos/${parts[3]}/Certificados`;
    }
    if (parts[0] === 'CERTIFICADO_CLIENTE_MODULO' && parts[1] && parts[2]) {
      return `${CLIENTS_PATH}/${parts[1]}/modulos/${parts[2]}/Certificados`;
    }
  }

  const category = row.category?.trim();
  if (!category) return INTERNAL_PATH;
  return `${INTERNAL_PATH}/${pathSegment(category)}`;
}

function formatDateBr(dateIso?: string | null): string {
  if (!dateIso) return '-';
  const date = new Date(`${dateIso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateIso;
  return date.toLocaleDateString('pt-BR');
}

function formatBytes(bytes?: number): string {
  const value = Number(bytes ?? 0);
  if (value <= 0) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function fileNameFromContentDisposition(contentDisposition: string, fallback: string): string {
  const utfFileNameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  const simpleFileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  const encodedFileName = utfFileNameMatch?.[1] ?? simpleFileNameMatch?.[1] ?? '';
  return encodedFileName ? decodeURIComponent(encodedFileName) : fallback;
}

function canPreviewDocument(row: InternalDocumentRow): boolean {
  return row.mime_type === 'application/pdf' || row.mime_type.startsWith('image/');
}

function isCertificateDocument(row: InternalDocumentRow): boolean {
  return String(row.category ?? '').toLowerCase() === 'certificados'
    || row.title.toLowerCase().includes('certificado')
    || row.file_name.toLowerCase().includes('certificado');
}

async function errorMessageFromResponse(response: Response, fallback: string): Promise<string> {
  const body = await response.text();
  if (!body) return fallback;
  try {
    const parsed = JSON.parse(body) as { message?: string };
    return parsed.message || fallback;
  } catch {
    return body;
  }
}

function ensureNode(map: Map<string, FolderNode>, path: string, name: string, system = true, manualId?: string) {
  const normalized = normalizeFolderPath(path);
  const existing = map.get(normalized);
  if (existing) {
    existing.name = existing.name || name;
    existing.system = existing.system && system;
    existing.manualId = existing.manualId ?? manualId;
    return existing;
  }

  const node: FolderNode = {
    path: normalized,
    name,
    parentPath: parentPath(normalized),
    system,
    manualId,
    children: []
  };
  map.set(normalized, node);
  return node;
}

function folderDisplayName(path: string) {
  const segment = path.split('/').filter(Boolean).pop();
  return segment ? decodePathSegment(segment) : 'Documentação';
}

function selectedCompanyIdFromPath(path: string) {
  const match = normalizeFolderPath(path).match(/^\/Clientes\/([^/]+)/);
  return match?.[1] ?? null;
}

function isSatisfactionPath(path: string) {
  return normalizeFolderPath(path).endsWith(`/${SATISFACTION_SEGMENT}`);
}

export function InternalDocsPage() {
  const [rows, setRows] = useState<InternalDocumentRow[]>([]);
  const [folders, setFolders] = useState<InternalDocumentFolderRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [followupsByCompany, setFollowupsByCompany] = useState<Record<string, FollowupEvaluationRow[]>>({});
  const [selectedPath, setSelectedPath] = useState(INTERNAL_PATH);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [fileDraft, setFileDraft] = useState<FileDraft>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<PreviewDocument>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

  async function loadAll() {
    const [documentRows, folderRows, companyRows, moduleRows] = await Promise.all([
      api.internalDocuments() as Promise<InternalDocumentRow[]>,
      api.internalDocumentFolders() as Promise<InternalDocumentFolderRow[]>,
      api.companies() as Promise<CompanyRow[]>,
      api.modules() as Promise<ModuleRow[]>
    ]);
    setRows(documentRows ?? []);
    setFolders(folderRows ?? []);
    setCompanies(companyRows ?? []);
    setModules(moduleRows ?? []);
  }

  useEffect(() => {
    loadAll().catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => () => {
    if (previewDocument?.objectUrl) {
      window.URL.revokeObjectURL(previewDocument.objectUrl);
    }
  }, [previewDocument]);

  useEffect(() => {
    const companyId = selectedCompanyIdFromPath(selectedPath);
    if (!companyId || !isSatisfactionPath(selectedPath) || followupsByCompany[companyId]) return;

    api.companyFollowupEvaluations(companyId)
      .then((items) => setFollowupsByCompany((current) => ({
        ...current,
        [companyId]: (items as FollowupEvaluationRow[]) ?? []
      })))
      .catch((err: Error) => setError(err.message));
  }, [followupsByCompany, selectedPath]);

  const tree = useMemo(() => {
    const map = new Map<string, FolderNode>();
    ensureNode(map, ROOT_PATH, 'Documentação');
    ensureNode(map, CLIENTS_PATH, 'Clientes');
    ensureNode(map, INTERNAL_PATH, 'Interna');
    ensureNode(map, `${INTERNAL_PATH}/Certificados`, 'Certificados');

    companies.forEach((company) => {
      const companyPath = `${CLIENTS_PATH}/${company.id}`;
      ensureNode(map, companyPath, company.name);
      ensureNode(map, `${companyPath}/Documentos`, 'Documentos do cliente');
      ensureNode(map, `${companyPath}/modulos`, 'Módulos');
      ensureNode(map, `${companyPath}/${SATISFACTION_SEGMENT}`, 'Pesquisa de satisfação');
      modules
        .forEach((module) => {
          const modulePath = `${companyPath}/modulos/${module.id}`;
          ensureNode(map, modulePath, module.code ? `${module.code} · ${module.name}` : module.name);
          ensureNode(map, `${modulePath}/Certificados`, 'Certificados');
        });
    });

    folders.forEach((folder) => {
      ensureNode(map, folder.path, folder.name, false, folder.id);
      const parent = normalizeFolderPath(folder.parent_path);
      if (!map.has(parent)) ensureNode(map, parent, folderDisplayName(parent));
    });

    rows.forEach((row) => {
      const folderPath = fileFolderPath(row);
      if (!map.has(folderPath)) ensureNode(map, folderPath, folderDisplayName(folderPath));
      const currentParent = parentPath(folderPath);
      if (currentParent && !map.has(currentParent)) ensureNode(map, currentParent, folderDisplayName(currentParent));
    });

    map.forEach((node) => {
      node.children = [];
    });
    map.forEach((node) => {
      if (!node.parentPath) return;
      const parent = map.get(node.parentPath);
      parent?.children.push(node);
    });
    map.forEach((node) => {
      node.children.sort((left, right) => left.name.localeCompare(right.name));
    });
    return map.get(ROOT_PATH) ?? ensureNode(map, ROOT_PATH, 'Documentação');
  }, [companies, folders, modules, rows]);

  const selectedNode = useMemo(() => {
    const stack = [tree];
    while (stack.length > 0) {
      const node = stack.shift();
      if (!node) continue;
      if (node.path === selectedPath) return node;
      stack.push(...node.children);
    }
    return tree.children.find((node) => node.path === INTERNAL_PATH) ?? tree;
  }, [selectedPath, tree]);

  const selectedCompanyId = selectedCompanyIdFromPath(selectedNode.path);
  const selectedFollowups = selectedCompanyId ? followupsByCompany[selectedCompanyId] ?? [] : [];
  const selectedCompany = selectedCompanyId ? companies.find((company) => company.id === selectedCompanyId) : null;

  const documentsInFolder = useMemo(() => rows.filter((row) => fileFolderPath(row) === selectedNode.path), [rows, selectedNode.path]);
  const filteredDocuments = useMemo(() => {
    const term = query.trim().toLowerCase();
    const source = term ? rows : documentsInFolder;
    if (!term) return source;
    return source.filter((row) => (
      row.title.toLowerCase().includes(term)
      || row.file_name.toLowerCase().includes(term)
      || String(row.category ?? '').toLowerCase().includes(term)
      || fileFolderPath(row).toLowerCase().includes(term)
    ));
  }, [documentsInFolder, query, rows]);

  const visibleFolders = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return selectedNode.children;

    const matches: FolderNode[] = [];
    const stack = [tree];
    while (stack.length > 0) {
      const node = stack.shift();
      if (!node) continue;
      if (node.path !== ROOT_PATH && node.name.toLowerCase().includes(term)) matches.push(node);
      stack.push(...node.children);
    }
    return matches;
  }, [query, selectedNode.children, tree]);

  const breadcrumb = useMemo(() => {
    const parts: FolderNode[] = [];
    let current: FolderNode | null = selectedNode;
    while (current) {
      parts.unshift(current);
      current = current.parentPath ? findNode(tree, current.parentPath) : null;
    }
    return parts;
  }, [selectedNode, tree]);

  async function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    if (!isPdf && !isImage) {
      setError('Envie apenas PDF ou imagem.');
      return;
    }
    if (file.size > MAX_DOC_UPLOAD_BYTES) {
      setError('Arquivo muito grande. Limite de 6 MB por upload.');
      return;
    }

    try {
      const dataUrl = await toDataUrl(file);
      setFileDraft({
        file_name: file.name,
        mime_type: file.type || (isPdf ? 'application/pdf' : 'image/*'),
        file_data_base64: dataUrl,
        file_size_bytes: file.size
      });
      setError('');
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function createFolder() {
    if (selectedNode.path === ROOT_PATH) {
      setError('Escolha Clientes ou Interna antes de criar uma pasta.');
      return;
    }
    if (!newFolderName.trim()) {
      setError('Informe o nome da pasta.');
      return;
    }

    setCreatingFolder(true);
    setError('');
    setMessage('');
    try {
      const folder = await api.createInternalDocumentFolder({
        parent_path: selectedNode.path,
        name: newFolderName.trim()
      }) as InternalDocumentFolderRow;
      setFolders((current) => [...current, folder]);
      setSelectedPath(folder.path);
      setNewFolderName('');
      setMessage('Pasta criada.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreatingFolder(false);
    }
  }

  async function createDocument() {
    if (selectedNode.path === ROOT_PATH) {
      setError('Escolha uma pasta antes de salvar o documento.');
      return;
    }
    if (!title.trim()) {
      setError('Informe o título da documentação.');
      return;
    }
    if (!fileDraft) {
      setError('Selecione um arquivo PDF ou imagem.');
      return;
    }

    setError('');
    setMessage('');
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
      setTitle('');
      setCategory('');
      setNotes('');
      setFileDraft(null);
      setMessage('Documento salvo na pasta.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteDocument(row: InternalDocumentRow) {
    const confirmationPhrase = askDestructiveConfirmation(`Excluir documento "${row.title}"`);
    if (!confirmationPhrase) return;

    setError('');
    setMessage('');
    try {
      await api.deleteInternalDocument(row.id, confirmationPhrase);
      setMessage('Documento removido.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function downloadDocument(row: InternalDocumentRow) {
    setDownloadingId(row.id);
    setError('');
    setMessage('');

    try {
      const response = await fetch(api.internalDocumentDownloadUrl(row.id), {
        headers: createInternalAuthHeaders()
      });
      if (!response.ok) {
        throw new Error(await errorMessageFromResponse(response, 'Falha ao baixar documento.'));
      }

      const blob = await response.blob();
      const fileName = fileNameFromContentDisposition(
        response.headers.get('Content-Disposition') ?? '',
        row.file_name || 'documento'
      );
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function previewInternalDocument(row: InternalDocumentRow) {
    if (!canPreviewDocument(row)) {
      setError('Este tipo de arquivo não tem pré-visualização disponível.');
      return;
    }

    setPreviewingId(row.id);
    setError('');
    setMessage('');

    try {
      const response = await fetch(api.internalDocumentDownloadUrl(row.id), {
        headers: createInternalAuthHeaders()
      });
      if (!response.ok) {
        throw new Error(await errorMessageFromResponse(response, 'Falha ao abrir prévia do documento.'));
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const fileName = fileNameFromContentDisposition(
        response.headers.get('Content-Disposition') ?? '',
        row.file_name || 'documento'
      );

      if (previewDocument?.objectUrl) {
        window.URL.revokeObjectURL(previewDocument.objectUrl);
      }

      setPreviewDocument({
        row,
        objectUrl,
        fileName,
        mimeType: row.mime_type || blob.type || 'application/octet-stream'
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPreviewingId(null);
    }
  }

  function closePreview() {
    if (previewDocument?.objectUrl) {
      window.URL.revokeObjectURL(previewDocument.objectUrl);
    }
    setPreviewDocument(null);
  }

  return (
    <div className="page internal-docs-page">
      <header className="page-header">
        <h1>Documentação</h1>
        <p>Organize arquivos por cliente, módulo, pesquisas e pastas internas.</p>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}

      <div className="docs-explorer">
        <aside className="docs-sidebar" aria-label="Pastas de documentação">
          <div className="docs-sidebar-header">
            <strong>Pastas</strong>
            <input
              aria-label="Buscar documentação"
              placeholder="Buscar"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <FolderTree node={tree} selectedPath={selectedNode.path} onSelect={setSelectedPath} />
        </aside>

        <main className="docs-main">
          <nav className="docs-breadcrumb" aria-label="Caminho da pasta">
            {breadcrumb.map((node, index) => (
              <button key={node.path} type="button" onClick={() => setSelectedPath(node.path)}>
                {index === 0 ? 'Documentação' : node.name}
              </button>
            ))}
          </nav>

          <section className="docs-toolbar">
            <div>
              <h2>{selectedNode.name}</h2>
              <span>
                {query.trim()
                  ? `${visibleFolders.length} pasta(s) e ${filteredDocuments.length} arquivo(s) encontrados`
                  : `${selectedNode.children.length} pasta(s) · ${documentsInFolder.length} arquivo(s)`}
              </span>
            </div>
            {selectedCompany ? <strong className="docs-context-chip">{selectedCompany.name}</strong> : null}
          </section>

          <section className="docs-grid" aria-label="Conteúdo da pasta">
            {visibleFolders.map((folder) => (
              <button className="docs-folder-card" key={folder.path} type="button" onClick={() => setSelectedPath(folder.path)}>
                <span aria-hidden="true">□</span>
                <strong>{folder.name}</strong>
                <small>{folder.system ? 'Pasta automática' : 'Pasta manual'}</small>
              </button>
            ))}

            {isSatisfactionPath(selectedNode.path) ? (
              selectedFollowups.length === 0 ? (
                <p className="docs-empty-card">Nenhuma pesquisa de satisfação respondida ou criada para este cliente.</p>
              ) : selectedFollowups.map((item) => (
                <article className="docs-file-card docs-file-card--evaluation" key={item.id}>
                  <span aria-hidden="true">◇</span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.status} · {item.rating ? `Nota ${item.rating}/5` : 'sem nota'} · {formatDateBr(item.submitted_at ?? item.created_at)}
                  </small>
                  <p>{item.respondent_name ?? 'Respondente não identificado'}</p>
                </article>
              ))
            ) : null}

            {filteredDocuments.map((row) => (
              <article className={`docs-file-card ${isCertificateDocument(row) ? 'is-certificate' : ''}`.trim()} key={row.id}>
                <span aria-hidden="true">{row.mime_type.startsWith('image/') ? '▧' : '▤'}</span>
                <strong title={row.notes ?? undefined}>{row.title}</strong>
                <small>{row.file_name} · {formatBytes(row.file_size_bytes)}</small>
                <p>{query.trim() ? fileFolderPath(row) : row.category ?? 'Sem categoria'}</p>
                <div className="actions actions-compact">
                  {canPreviewDocument(row) ? (
                    <button
                      type="button"
                      onClick={() => void previewInternalDocument(row)}
                      disabled={previewingId === row.id}
                    >
                      {previewingId === row.id ? 'Abrindo...' : 'Visualizar'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void downloadDocument(row)}
                    disabled={downloadingId === row.id}
                  >
                    {downloadingId === row.id ? 'Baixando...' : 'Download'}
                  </button>
                  <button type="button" onClick={() => deleteDocument(row)}>Excluir</button>
                </div>
              </article>
            ))}

            {visibleFolders.length === 0 && filteredDocuments.length === 0 && !isSatisfactionPath(selectedNode.path) ? (
              <p className="docs-empty-card">Esta pasta ainda está vazia.</p>
            ) : null}
          </section>
        </main>

        <aside className="docs-actions-panel" aria-label="Ações da pasta">
          <Section title="Nova pasta">
            <div className="form form-spacious">
              <label>Nome
                <input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="Ex.: Contratos" />
              </label>
              <button type="button" disabled={creatingFolder || selectedNode.path === ROOT_PATH} onClick={() => void createFolder()}>
                {creatingFolder ? 'Criando...' : 'Criar pasta'}
              </button>
            </div>
          </Section>

          <Section title="Enviar arquivo">
            <div className="form form-spacious">
              <label>Título
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Checklist de implantação" />
              </label>
              <label>Categoria
                <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ex.: Suporte, Certificados" />
              </label>
              <label>Descrição
                <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Contexto rápido do arquivo." />
              </label>
              <label>Arquivo
                <input type="file" accept="application/pdf,image/*" onChange={onPickFile} />
              </label>
              {fileDraft ? (
                <p className="form-hint">
                  Selecionado: <strong>{fileDraft.file_name}</strong> ({formatBytes(fileDraft.file_size_bytes)})
                </p>
              ) : null}
              <button type="button" disabled={selectedNode.path === ROOT_PATH} onClick={() => void createDocument()}>
                Salvar na pasta
              </button>
            </div>
          </Section>
        </aside>
      </div>

      {previewDocument ? (
        <div className="internal-doc-preview-backdrop" role="presentation" onClick={closePreview}>
          <section
            className="internal-doc-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label={previewDocument.row.title}
            onClick={(event) => event.stopPropagation()}
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
      ) : null}
    </div>
  );
}

function findNode(root: FolderNode, path: string): FolderNode | null {
  if (root.path === path) return root;
  for (const child of root.children) {
    const found = findNode(child, path);
    if (found) return found;
  }
  return null;
}

function FolderTree({
  node,
  selectedPath,
  onSelect,
  depth = 0
}: {
  node: FolderNode;
  selectedPath: string;
  onSelect: (path: string) => void;
  depth?: number;
}) {
  return (
    <div className="docs-tree-node">
      {node.path !== ROOT_PATH ? (
        <button
          className={node.path === selectedPath ? 'is-selected' : ''}
          style={{ paddingLeft: `${10 + depth * 14}px` }}
          type="button"
          onClick={() => onSelect(node.path)}
        >
          <span aria-hidden="true">□</span>
          <span>{node.name}</span>
        </button>
      ) : null}
      {node.children.map((child) => (
        <FolderTree
          depth={node.path === ROOT_PATH ? 0 : depth + 1}
          key={child.path}
          node={child}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
