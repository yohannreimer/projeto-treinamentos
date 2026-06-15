// Utilitários de árvore de pastas — extraídos de InternalDocsPage
// Não têm dependências de React; podem ser usados em qualquer contexto.

export type FolderNode = {
  path: string;
  name: string;
  parentPath: string | null;
  system: boolean;
  manualId?: string;
  children: FolderNode[];
};

export type InternalDocumentRow = {
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

export type InternalDocumentFolderRow = {
  id: string;
  parent_path: string;
  path: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type CompanyRow = {
  id: string;
  name: string;
  status?: string;
};

export type ModuleRow = {
  id: string;
  code?: string;
  name: string;
  delivery_mode?: string;
};

export type CompanyModuleLinkRow = {
  company_id: string;
  module_id: string;
};

export const ROOT_PATH = '/';
export const CLIENTS_PATH = '/Clientes';
export const INTERNAL_PATH = '/Interna';
export const SATISFACTION_SEGMENT = 'Pesquisa%20de%20satisfacao';

export function normalizeFolderPath(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw === ROOT_PATH) return raw === ROOT_PATH ? ROOT_PATH : INTERNAL_PATH;
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.replace(/\/{2,}/g, '/').replace(/\/$/, '') || INTERNAL_PATH;
}

export function pathSegment(label: string): string {
  return encodeURIComponent(label.trim().replace(/\s+/g, ' '));
}

export function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parentPath(path: string): string | null {
  const normalized = normalizeFolderPath(path);
  if (normalized === ROOT_PATH) return null;
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? ROOT_PATH : normalized.slice(0, index);
}

export function folderDisplayName(path: string): string {
  const segment = path.split('/').filter(Boolean).pop();
  return segment ? decodePathSegment(segment) : 'Documentação';
}

export function fileFolderPath(row: InternalDocumentRow): string {
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

function moduleDisplayName(module: ModuleRow | undefined, moduleId: string): string {
  if (!module) return folderDisplayName(moduleId);
  return module.code ? `${module.code} · ${module.name}` : module.name;
}

function addModuleReference(
  map: Map<string, Set<string>>,
  companyId: string | undefined,
  moduleId: string | undefined
) {
  if (!companyId || !moduleId) return;
  const modules = map.get(companyId) ?? new Set<string>();
  modules.add(moduleId);
  map.set(companyId, modules);
}

function addModuleReferenceFromPath(map: Map<string, Set<string>>, path?: string | null) {
  const normalized = normalizeFolderPath(path);
  const match = normalized.match(/^\/Clientes\/([^/]+)\/modulos\/([^/]+)/);
  addModuleReference(map, match?.[1], match?.[2]);
}

export function ensureNode(
  map: Map<string, FolderNode>,
  path: string,
  name: string,
  system = true,
  manualId?: string
): FolderNode {
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

export function findNode(root: FolderNode, path: string): FolderNode | null {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node) continue;
    if (node.path === path) return node;
    stack.push(...node.children);
  }
  return null;
}

/** Reconstrói a árvore completa a partir dos dados carregados. */
export function buildTree(
  companies: CompanyRow[],
  modules: ModuleRow[],
  folders: InternalDocumentFolderRow[],
  rows: InternalDocumentRow[],
  companyModuleLinks: CompanyModuleLinkRow[] = []
): FolderNode {
  const map = new Map<string, FolderNode>();
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const moduleIdsByCompany = new Map<string, Set<string>>();

  ensureNode(map, ROOT_PATH, 'Documentação');
  ensureNode(map, CLIENTS_PATH, 'Clientes');
  ensureNode(map, INTERNAL_PATH, 'Interna');
  ensureNode(map, `${INTERNAL_PATH}/Certificados`, 'Certificados');

  // Seções fixas do hub — sempre visíveis na sidebar mesmo antes de ter conteúdo
  ensureNode(map, '/Processos', 'Processos Internos');
  ensureNode(map, '/Templates', 'Templates');
  ensureNode(map, '/Base', 'Base de Conhecimento');

  companyModuleLinks.forEach((link) => {
    addModuleReference(moduleIdsByCompany, link.company_id, link.module_id);
  });
  folders.forEach((folder) => {
    addModuleReferenceFromPath(moduleIdsByCompany, folder.path);
    addModuleReferenceFromPath(moduleIdsByCompany, folder.parent_path);
  });
  rows.forEach((row) => {
    addModuleReferenceFromPath(moduleIdsByCompany, fileFolderPath(row));
  });

  companies.forEach((company) => {
    const companyPath = `${CLIENTS_PATH}/${company.id}`;
    ensureNode(map, companyPath, company.name);
    ensureNode(map, `${companyPath}/Documentos`, 'Documentos do cliente');
    ensureNode(map, `${companyPath}/modulos`, 'Módulos');
    ensureNode(map, `${companyPath}/${SATISFACTION_SEGMENT}`, 'Pesquisa de satisfação');
    Array.from(moduleIdsByCompany.get(company.id) ?? [])
      .sort((a, b) => (
        moduleDisplayName(moduleById.get(a), a).localeCompare(moduleDisplayName(moduleById.get(b), b))
      ))
      .forEach((moduleId) => {
        const modulePath = `${companyPath}/modulos/${moduleId}`;
        ensureNode(map, modulePath, moduleDisplayName(moduleById.get(moduleId), moduleId));
        ensureNode(map, `${modulePath}/Certificados`, 'Certificados');
      });
  });

  folders.forEach((folder) => {
    ensureNode(map, folder.path, folder.name, false, folder.id);
    const pp = normalizeFolderPath(folder.parent_path);
    if (!map.has(pp)) ensureNode(map, pp, folderDisplayName(pp));
  });

  rows.forEach((row) => {
    const fp = fileFolderPath(row);
    if (!map.has(fp)) ensureNode(map, fp, folderDisplayName(fp));
    const cp = parentPath(fp);
    if (cp && !map.has(cp)) ensureNode(map, cp, folderDisplayName(cp));
  });

  // Reconstrói children
  map.forEach((node) => { node.children = []; });
  map.forEach((node) => {
    if (!node.parentPath) return;
    const parent = map.get(node.parentPath);
    parent?.children.push(node);
  });
  map.forEach((node) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
  });

  return map.get(ROOT_PATH) ?? ensureNode(map, ROOT_PATH, 'Documentação');
}

/** Retorna todos os ancestrais de um path, do root até o path (inclusive). */
export function breadcrumbNodes(root: FolderNode, path: string): FolderNode[] {
  const crumbs: FolderNode[] = [];
  const target = findNode(root, path);
  if (!target) return crumbs;

  let current: FolderNode | null = target;
  while (current) {
    crumbs.unshift(current);
    current = current.parentPath ? findNode(root, current.parentPath) : null;
    if (current?.path === ROOT_PATH) { crumbs.unshift(current); break; }
  }
  return crumbs;
}

/** Detecta qual seção principal (para badge e cores) um path pertence. */
export type SectionKey = 'clients' | 'processes' | 'templates' | 'knowledge' | 'root';

export function sectionOfPath(path: string): SectionKey {
  const normalized = normalizeFolderPath(path);
  if (normalized.startsWith(CLIENTS_PATH)) return 'clients';
  if (normalized.startsWith('/Processos')) return 'processes';
  if (normalized.startsWith('/Templates')) return 'templates';
  if (normalized.startsWith('/Base')) return 'knowledge';
  return 'root';
}

export function isSatisfactionPath(path: string): boolean {
  return normalizeFolderPath(path).endsWith(`/${SATISFACTION_SEGMENT}`);
}

export function selectedCompanyIdFromPath(path: string): string | null {
  const match = normalizeFolderPath(path).match(/^\/Clientes\/([^/]+)/);
  return match?.[1] ?? null;
}
