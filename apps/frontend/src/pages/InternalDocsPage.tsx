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
  notes?: string | null;
  status: string;
  respondent_name: string | null;
  rating: number | null;
  answers?: {
    what_worked?: string | null;
    what_to_improve?: string | null;
    next_priority?: string | null;
  } | null;
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

type CertificateSurveyPreview = {
  row: InternalDocumentRow;
  data: CertificateSurveyData;
} | null;

type CertificateSurveyData = {
  document_key?: string;
  company_name?: string;
  cohort?: string | null;
  module_name?: string;
  respondent_name?: string;
  submitted_at?: string;
  answers?: Record<string, string | number | boolean | null>;
};

type FolderNode = {
  path: string;
  name: string;
  parentPath: string | null;
  system: boolean;
  manualId?: string;
  children: FolderNode[];
};

type SearchScope = 'current' | 'all';
type DocsPanelMode = 'details' | 'new-folder' | 'upload';
type DocsItemKind = 'folder' | 'document' | 'certificate' | 'survey' | 'followup';

type DocsItem = {
  id: string;
  kind: DocsItemKind;
  title: string;
  subtitle: string;
  path: string;
  pathLabel: string;
  updatedAt?: string | null;
  folder?: FolderNode;
  document?: InternalDocumentRow;
  followup?: FollowupEvaluationRow;
  companyId?: string | null;
  moduleId?: string | null;
};

type GroupedDocsResults = {
  folders: DocsItem[];
  surveys: DocsItem[];
  certificates: DocsItem[];
  files: DocsItem[];
};

const MAX_DOC_UPLOAD_BYTES = 6_000_000;
const ROOT_PATH = '/';
const CLIENTS_PATH = '/Clientes';
const INTERNAL_PATH = '/Interna';
const SATISFACTION_SEGMENT = 'Pesquisa%20de%20satisfacao';
const certificateSurveyQuestionLabels: Record<string, string> = {
  q1: 'O instrutor demonstrou domínio técnico do conteúdo do curso?',
  q2: 'O instrutor explicou os conceitos de forma clara e objetiva?',
  q3: 'O instrutor foi paciente e disponível para tirar dúvidas?',
  q4: 'O ritmo das aulas foi adequado?',
  q5: 'O instrutor estimulou a participação e a prática dos alunos?',
  q6: 'Qual foi o principal ponto forte do instrutor?',
  q7: 'O que o instrutor poderia melhorar?',
  q8: 'O conteúdo do curso atendeu às suas expectativas?',
  q9: 'Os temas abordados foram relevantes para sua realidade profissional?',
  q10: 'O nível de dificuldade do curso foi adequado?',
  q11: 'As aulas práticas foram suficientes?',
  q12: 'A sequência dos tópicos foi lógica e bem organizada?',
  q13: 'Você se sente mais confiante para aplicar o conteúdo após o curso?',
  q14: 'O material didático foi de boa qualidade?',
  q15: 'Os exercícios práticos foram úteis e bem elaborados?',
  q16: 'O ambiente, laboratório ou licenças do software funcionaram bem?',
  q17: 'No geral, como você avalia o curso?',
  q18: 'Recomendaria este curso para outros colegas?',
  q19: 'Qual foi o tópico mais útil do curso?',
  q20: 'Qual tópico você achou menos útil ou precisa de mais aprofundamento?',
  q21: 'O que mais você gostou no curso?',
  q22: 'O que podemos melhorar para as próximas turmas?',
  q23: 'Sugestões de novos temas ou módulos que gostaria de ver?'
};

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
  const surveyKey = notes.match(/Chave:\s*PESQUISA_CERTIFICADO:([^:\n]+):([^:\n]+):([^:\n]+)/)?.[1]?.trim();
  if (surveyKey) {
    return `${CLIENTS_PATH}/${surveyKey}/${SATISFACTION_SEGMENT}`;
  }

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
  return row.mime_type === 'application/pdf'
    || row.mime_type === 'text/html'
    || row.mime_type.startsWith('image/')
    || isCertificateSurveyDocument(row);
}

function isCertificateDocument(row: InternalDocumentRow): boolean {
  return String(row.category ?? '').toLowerCase() === 'certificados'
    || row.title.toLowerCase().includes('certificado')
    || row.file_name.toLowerCase().includes('certificado');
}

function isCertificateSurveyDocument(row: InternalDocumentRow): boolean {
  const haystack = `${row.category ?? ''}\n${row.title}\n${row.file_name}\n${row.notes ?? ''}`.toLowerCase();
  return haystack.includes('pesquisa_certificado')
    || haystack.includes('pesquisa_satisfacao_certificado')
    || haystack.includes('pesquisas de satisfação');
}

function parseCertificateSurveyNotes(row: InternalDocumentRow): CertificateSurveyData {
  const notes = row.notes ?? '';
  const lineValue = (label: string) => notes.match(new RegExp(`^${label}:\\s*(.+)$`, 'im'))?.[1]?.trim();
  const answers: Record<string, string> = {};
  notes.split('\n').forEach((line) => {
    const match = line.match(/^(q\d+):\s*(.*)$/i);
    if (!match) return;
    answers[match[1].toLowerCase()] = match[2].trim();
  });

  return {
    document_key: lineValue('Chave'),
    company_name: lineValue('Empresa'),
    cohort: lineValue('Turma'),
    module_name: lineValue('Módulo'),
    respondent_name: lineValue('Respondido por'),
    submitted_at: lineValue('Enviado em'),
    answers
  };
}

function parseCertificateSurveyJson(raw: string, fallback: InternalDocumentRow): CertificateSurveyData {
  const parsed = JSON.parse(raw) as CertificateSurveyData;
  return {
    ...parseCertificateSurveyNotes(fallback),
    ...parsed,
    answers: parsed.answers ?? parseCertificateSurveyNotes(fallback).answers
  };
}

function certificateSurveyAnswerRows(data: CertificateSurveyData) {
  const answers = data.answers ?? {};
  return Object.entries(answers)
    .filter(([, value]) => String(value ?? '').trim().length > 0)
    .sort(([left], [right]) => left.localeCompare(right, 'pt-BR', { numeric: true }))
    .map(([key, value]) => ({
      key,
      label: certificateSurveyQuestionLabels[key] ?? key.toUpperCase(),
      value: String(value ?? '')
    }));
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

function evaluationStatusLabel(status: string) {
  if (status === 'Respondida') return 'Respondida';
  if (status === 'Aberta') return 'Aguardando resposta';
  return status;
}

function satisfactionAnswerRows(item: FollowupEvaluationRow) {
  return [
    ['Funcionou bem', item.answers?.what_worked],
    ['Melhorar', item.answers?.what_to_improve],
    ['Próxima prioridade', item.answers?.next_priority]
  ].filter(([, value]) => String(value ?? '').trim().length > 0) as Array<[string, string]>;
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
  const [previewSurvey, setPreviewSurvey] = useState<CertificateSurveyPreview>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showActionsPanel, setShowActionsPanel] = useState(false);
  const [searchScope, setSearchScope] = useState<SearchScope>('current');
  const [, setSelectedItem] = useState<DocsItem | null>(null);
  const [, setPanelMode] = useState<DocsPanelMode>('details');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set([CLIENTS_PATH, INTERNAL_PATH]));

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
  const folderItems = useMemo<DocsItem[]>(() => (
    collectFolderNodes(tree).map((folder) => ({
      id: `folder:${folder.path}`,
      kind: 'folder',
      title: folder.name,
      subtitle: folder.system ? 'Pasta automática' : 'Pasta manual',
      path: folder.path,
      pathLabel: nodePathLabel(tree, folder.path),
      folder
    }))
  ), [tree]);

  const documentItems = useMemo<DocsItem[]>(() => rows.map((row) => {
    const path = fileFolderPath(row);
    const isSurvey = isCertificateSurveyDocument(row);
    const isCertificate = isCertificateDocument(row);
    return {
      id: `document:${row.id}`,
      kind: isSurvey ? 'survey' : isCertificate ? 'certificate' : 'document',
      title: isSurvey ? (parseCertificateSurveyNotes(row).module_name ?? row.title) : row.title,
      subtitle: isSurvey
        ? `${parseCertificateSurveyNotes(row).respondent_name ?? 'Respondente não identificado'} · ${formatDateBr(parseCertificateSurveyNotes(row).submitted_at ?? row.updated_at)}`
        : `${row.file_name} · ${formatBytes(row.file_size_bytes)}`,
      path,
      pathLabel: nodePathLabel(tree, path),
      updatedAt: row.updated_at,
      document: row,
      companyId: selectedCompanyIdFromPath(path)
    };
  }), [rows, tree]);

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
  const certificateSurveyDocuments = useMemo(() => (
    isSatisfactionPath(selectedNode.path)
      ? filteredDocuments.filter(isCertificateSurveyDocument)
      : []
  ), [filteredDocuments, selectedNode.path]);
  const regularDocuments = useMemo(() => (
    isSatisfactionPath(selectedNode.path)
      ? filteredDocuments.filter((row) => !isCertificateSurveyDocument(row))
      : filteredDocuments
  ), [filteredDocuments, selectedNode.path]);

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

  const isSearchActive = query.trim().length > 0;
  const searchableItems = useMemo(() => {
    const scopePath = searchScope === 'current' ? selectedNode.path : ROOT_PATH;
    return [...folderItems, ...documentItems].filter((item) => (
      searchScope === 'all' || isDescendantPath(item.path, scopePath)
    ));
  }, [documentItems, folderItems, searchScope, selectedNode.path]);

  const groupedResults = useMemo<GroupedDocsResults>(() => {
    const term = query.trim().toLowerCase();
    const empty: GroupedDocsResults = { folders: [], surveys: [], certificates: [], files: [] };
    if (!term) return empty;

    searchableItems.forEach((item) => {
      const haystack = `${item.title} ${item.subtitle} ${item.pathLabel}`.toLowerCase();
      if (!haystack.includes(term)) return;
      if (item.kind === 'folder') empty.folders.push(item);
      else if (item.kind === 'survey' || item.kind === 'followup') empty.surveys.push(item);
      else if (item.kind === 'certificate') empty.certificates.push(item);
      else empty.files.push(item);
    });

    return empty;
  }, [query, searchableItems]);
  const hasSearchResults = groupedResults.folders.length > 0
    || groupedResults.surveys.length > 0
    || groupedResults.certificates.length > 0
    || groupedResults.files.length > 0;

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
      selectFolderPath(folder.path);
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

      if (isCertificateSurveyDocument(row) && row.mime_type.includes('application/json')) {
        const text = await response.text();
        setPreviewSurvey({
          row,
          data: text.trim()
            ? parseCertificateSurveyJson(text, row)
            : parseCertificateSurveyNotes(row)
        });
        return;
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
    setPreviewSurvey(null);
  }

  function selectDocsItem(item: DocsItem) {
    setSelectedItem(item);
    setPanelMode('details');
  }

  function toggleFolderExpanded(path: string) {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function expandAncestors(path: string) {
    setExpandedPaths((existing) => {
      const next = new Set(existing);
      let current = parentPath(path);
      while (current) {
        next.add(current);
        current = parentPath(current);
      }
      return next;
    });
  }

  function selectFolderPath(path: string) {
    setSelectedPath(path);
    expandAncestors(path);
  }

  function openDocsItem(item: DocsItem) {
    selectDocsItem(item);
    if (item.kind === 'folder') {
      selectFolderPath(item.path);
      return;
    }
    if (item.document && canPreviewDocument(item.document)) {
      void previewInternalDocument(item.document);
    }
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
              type="search"
              role="searchbox"
              aria-label="Buscar documentação"
              placeholder="Buscar"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <FolderTree
            node={tree}
            selectedPath={selectedNode.path}
            expandedPaths={expandedPaths}
            onSelect={selectFolderPath}
            onToggle={toggleFolderExpanded}
          />
        </aside>

        <main className="docs-main">
          <nav className="docs-breadcrumb" aria-label="Caminho da pasta">
            {breadcrumb.map((node, index) => (
              <button key={node.path} type="button" onClick={() => selectFolderPath(node.path)}>
                {index === 0 ? 'Documentação' : node.name}
              </button>
            ))}
          </nav>

          <section className="docs-toolbar">
            <div>
              <h2>{selectedNode.name}</h2>
              <span>
                {isSearchActive
                  ? `${groupedResults.folders.length + groupedResults.surveys.length + groupedResults.certificates.length + groupedResults.files.length} resultado(s) encontrados`
                  : `${selectedNode.children.length} pasta(s) · ${documentsInFolder.length} arquivo(s)`}
              </span>
            </div>
            <div className="docs-search-scope" role="group" aria-label="Escopo da busca">
              <button
                type="button"
                className={searchScope === 'current' ? 'is-selected' : ''}
                onClick={() => setSearchScope('current')}
              >
                Nesta pasta
              </button>
              <button
                type="button"
                className={searchScope === 'all' ? 'is-selected' : ''}
                onClick={() => setSearchScope('all')}
              >
                Tudo
              </button>
            </div>
            {selectedCompany ? <strong className="docs-context-chip">{selectedCompany.name}</strong> : null}
          </section>

          <section className="docs-content-list" aria-label="Conteúdo da pasta">
            {isSearchActive ? (
              <div className="docs-search-results">
                {hasSearchResults ? (
                  <>
                    <ResultGroup title="Pastas" items={groupedResults.folders} onSelect={selectDocsItem} onOpen={openDocsItem} />
                    <ResultGroup title="Pesquisas" items={groupedResults.surveys} onSelect={selectDocsItem} onOpen={openDocsItem} />
                    <ResultGroup title="Certificados" items={groupedResults.certificates} onSelect={selectDocsItem} onOpen={openDocsItem} />
                    <ResultGroup title="Arquivos" items={groupedResults.files} onSelect={selectDocsItem} onOpen={openDocsItem} />
                  </>
                ) : (
                  <p className="docs-empty-card">Nenhum resultado encontrado.</p>
                )}
              </div>
            ) : (
              <>
                {visibleFolders.map((folder) => (
                  <button
                    className="docs-row docs-row--folder"
                    key={folder.path}
                    type="button"
                    onClick={() => openDocsItem({
                      id: `folder:${folder.path}`,
                      kind: 'folder',
                      title: folder.name,
                      subtitle: folder.system ? 'Pasta automática' : 'Pasta manual',
                      path: folder.path,
                      pathLabel: nodePathLabel(tree, folder.path),
                      folder
                    })}
                  >
                    <span className="docs-row-icon" aria-hidden="true">□</span>
                    <span>
                      <strong>{folder.name}</strong>
                      <small>{folder.system ? 'Pasta automática' : 'Pasta manual'}</small>
                    </span>
                    <em>{folder.children.length} pasta(s)</em>
                  </button>
                ))}

                {isSatisfactionPath(selectedNode.path) ? (
                  selectedFollowups.length === 0 && certificateSurveyDocuments.length === 0 ? (
                    <p className="docs-empty-card">Nenhuma pesquisa de satisfação respondida ou criada para este cliente.</p>
                  ) : null
                ) : null}

                {isSatisfactionPath(selectedNode.path) ? certificateSurveyDocuments.map((row) => {
                  const survey = parseCertificateSurveyNotes(row);
                  return (
                    <article className="docs-evaluation-row" key={row.id}>
                      <header>
                        <span className="docs-row-icon" aria-hidden="true">◇</span>
                        <div>
                          <strong>{survey.module_name ?? row.title}</strong>
                          <small>
                            {survey.respondent_name ?? 'Respondente não identificado'} · {formatDateBr(survey.submitted_at ?? row.updated_at)}
                          </small>
                        </div>
                        <div className="docs-evaluation-meta">
                          <span>Pesquisa do certificado</span>
                          <strong>{survey.cohort ?? 'Jornada do cliente'}</strong>
                        </div>
                      </header>
                      <p className="docs-evaluation-note">{survey.company_name ?? selectedCompany?.name ?? 'Cliente'} · {row.file_name}</p>
                      {certificateSurveyAnswerRows(survey).length > 0 ? (
                        <dl className="docs-evaluation-answers docs-evaluation-answers--compact">
                          {certificateSurveyAnswerRows(survey).slice(0, 6).map((answer) => (
                            <div key={answer.key}>
                              <dt>{answer.label}</dt>
                              <dd>{answer.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                      <div className="actions actions-compact">
                        <button
                          type="button"
                          onClick={() => void previewInternalDocument(row)}
                          disabled={previewingId === row.id}
                        >
                          {previewingId === row.id ? 'Abrindo...' : 'Visualizar pesquisa'}
                        </button>
                      </div>
                    </article>
                  );
                }) : null}

                {isSatisfactionPath(selectedNode.path) ? selectedFollowups.map((item) => (
                    <article className="docs-evaluation-row" key={item.id}>
                      <header>
                        <span className="docs-row-icon" aria-hidden="true">◇</span>
                        <div>
                          <strong>{item.title}</strong>
                          <small>{item.respondent_name ?? 'Respondente não identificado'} · {formatDateBr(item.submitted_at ?? item.created_at)}</small>
                        </div>
                        <div className="docs-evaluation-meta">
                          <span>{evaluationStatusLabel(item.status)}</span>
                          <strong>{item.rating ? `${item.rating}/5` : 'Sem nota'}</strong>
                        </div>
                      </header>
                      {item.notes ? <p className="docs-evaluation-note">{item.notes}</p> : null}
                      {satisfactionAnswerRows(item).length > 0 ? (
                        <dl className="docs-evaluation-answers">
                          {satisfactionAnswerRows(item).map(([label, value]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : item.status === 'Aberta' ? (
                        <p className="docs-evaluation-note">Link criado, aguardando o cliente responder.</p>
                      ) : null}
                    </article>
                )) : null}

                {regularDocuments.map((row) => (
                  <article className={`docs-row docs-row--file ${isCertificateDocument(row) ? 'is-certificate' : ''}`.trim()} key={row.id}>
                    <span className="docs-row-icon" aria-hidden="true">{row.mime_type.startsWith('image/') ? '▧' : '▤'}</span>
                    <span>
                      <strong title={row.notes ?? undefined}>{row.title}</strong>
                      <small>{row.file_name} · {formatBytes(row.file_size_bytes)} · {row.category ?? 'Sem categoria'}</small>
                    </span>
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

                {visibleFolders.length === 0 && regularDocuments.length === 0 && !isSatisfactionPath(selectedNode.path) ? (
                  <p className="docs-empty-card">Esta pasta ainda está vazia.</p>
                ) : null}
              </>
            )}
          </section>
        </main>

        <aside className={`docs-actions-panel ${showActionsPanel ? 'is-open' : ''}`} aria-label="Ações da pasta">
          <button
            type="button"
            className="docs-actions-toggle"
            onClick={() => setShowActionsPanel((current) => !current)}
            aria-expanded={showActionsPanel}
          >
            {showActionsPanel ? 'Fechar ações' : 'Nova pasta / enviar arquivo'}
          </button>
          {showActionsPanel ? (
            <>
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
            </>
          ) : null}
        </aside>
      </div>

      {previewSurvey ? (
        <div className="internal-doc-preview-backdrop" role="presentation" onClick={closePreview}>
          <section
            className="internal-doc-preview-modal internal-doc-preview-modal--survey"
            role="dialog"
            aria-modal="true"
            aria-label={previewSurvey.row.title}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="internal-doc-preview-header">
              <div>
                <span className="internal-doc-preview-kicker">Pesquisa de satisfação</span>
                <h2>{previewSurvey.data.module_name ?? previewSurvey.row.title}</h2>
                <p>
                  {previewSurvey.data.company_name ?? selectedCompany?.name ?? 'Cliente'}
                  {' · '}
                  {previewSurvey.data.respondent_name ?? 'Respondente não identificado'}
                  {' · '}
                  {formatDateBr(previewSurvey.data.submitted_at ?? previewSurvey.row.updated_at)}
                </p>
              </div>
              <div className="actions actions-compact">
                <button type="button" onClick={closePreview}>Fechar</button>
              </div>
            </header>

            <div className="docs-survey-report">
              <dl className="docs-survey-summary">
                <div>
                  <dt>Turma</dt>
                  <dd>{previewSurvey.data.cohort ?? 'Jornada do cliente'}</dd>
                </div>
                <div>
                  <dt>Arquivo original</dt>
                  <dd>{previewSurvey.row.file_name}</dd>
                </div>
              </dl>

              <div className="docs-survey-answer-list">
                {certificateSurveyAnswerRows(previewSurvey.data).map((answer) => (
                  <article key={answer.key}>
                    <span>{answer.key.toUpperCase()}</span>
                    <div>
                      <strong>{answer.label}</strong>
                      <p>{answer.value}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}

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

function isDescendantPath(candidate: string, parent: string): boolean {
  const normalizedCandidate = normalizeFolderPath(candidate);
  const normalizedParent = normalizeFolderPath(parent);
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}/`);
}

function nodePathLabel(root: FolderNode, path: string): string {
  const node = findNode(root, path);
  if (!node) return folderDisplayName(path);
  const parts: string[] = [];
  let current: FolderNode | null = node;
  while (current) {
    if (current.path !== ROOT_PATH) parts.unshift(current.name);
    current = current.parentPath ? findNode(root, current.parentPath) : null;
  }
  return parts.join(' > ') || 'Documentação';
}

function collectFolderNodes(root: FolderNode): FolderNode[] {
  const output: FolderNode[] = [];
  const stack = [...root.children];
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node) continue;
    output.push(node);
    stack.push(...node.children);
  }
  return output;
}

function FolderTree({
  node,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggle,
  depth = 0
}: {
  node: FolderNode;
  selectedPath: string;
  expandedPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  depth?: number;
}) {
  const expanded = expandedPaths.has(node.path);
  const hasChildren = node.children.length > 0;
  return (
    <div className="docs-tree-node">
      {node.path !== ROOT_PATH ? (
        <button
          className={node.path === selectedPath ? 'is-selected' : ''}
          style={{ paddingLeft: `${10 + depth * 14}px` }}
          type="button"
          onClick={() => {
            onSelect(node.path);
            if (hasChildren) onToggle(node.path);
          }}
          aria-expanded={hasChildren ? expanded : undefined}
        >
          <span aria-hidden="true">{hasChildren ? (expanded ? '▾' : '▸') : '□'}</span>
          <span>
            {node.name}
            <small>{node.system ? 'Pasta automática' : 'Pasta manual'}</small>
          </span>
        </button>
      ) : null}
      {node.path === ROOT_PATH || expanded ? node.children.map((child) => (
        <FolderTree
          depth={node.path === ROOT_PATH ? 0 : depth + 1}
          key={child.path}
          node={child}
          selectedPath={selectedPath}
          expandedPaths={expandedPaths}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      )) : null}
    </div>
  );
}

function ResultGroup({
  title,
  items,
  onSelect,
  onOpen
}: {
  title: string;
  items: DocsItem[];
  onSelect: (item: DocsItem) => void;
  onOpen: (item: DocsItem) => void;
}) {
  return (
    <section className="docs-result-group" aria-labelledby={`docs-result-group-${title.toLowerCase()}`}>
      <h3 id={`docs-result-group-${title.toLowerCase()}`}>{title}</h3>
      {items.length > 0 ? (
        <div className="docs-result-list">
          {items.map((item) => (
            <article className="docs-row docs-row--result" key={item.id}>
              <button type="button" onClick={() => onSelect(item)}>
                <span className="docs-row-icon" aria-hidden="true">{item.kind === 'folder' ? '□' : '▤'}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.pathLabel}</small>
                  <small>{item.subtitle}</small>
                </span>
              </button>
              <button type="button" onClick={() => onOpen(item)}>
                Abrir
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
