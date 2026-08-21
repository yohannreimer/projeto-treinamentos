import type { ProposalProduct, ProposalProductCatalogMetadata } from './proposalData';

export const SOFTWARE_CATALOG_PAGE_SIZE = 50;
export const PRIMARY_SUBFAMILY = 'Produtos principais';

export const SOFTWARE_CATALOG_FAMILY_ORDER = [
  'Design',
  'Mold',
  'Progress',
  'Electrode',
  'CAM',
  'Wire / EDM',
  'Inspection',
  'PartCosting',
  'Interfaces',
  'Pós-processadores',
  'Personalizados',
] as const;

const CAM_SUBFAMILY_ORDER = [
  'Milling',
  'Turning',
  'Mill-Turn',
  'Extensões',
  'Integrações CAM',
  'Ferramentas / bibliotecas',
  'SheetMetal Cut',
] as const;

export type SoftwareCatalogSource = 'official' | 'browser-custom' | 'proposal-only';

export type SoftwareCatalogProduct = ProposalProduct & {
  catalog: ProposalProductCatalogMetadata;
};

export type SoftwareCatalogEntry = ProposalProduct & {
  source: SoftwareCatalogSource;
  path: [string, string, string];
  searchText: string;
};

export type SoftwareCatalogFamily = {
  name: string;
  count: number;
  subfamilies: Array<{
    name: string;
    count: number;
    folders: Array<{ name: string; count: number }>;
  }>;
};

export type SoftwareCatalogQuery = {
  query: string;
  family: string;
  subfamily: string;
  folder?: string;
  limit: number;
};

export type SoftwareCatalogQueryResult = {
  items: SoftwareCatalogEntry[];
  total: number;
  hasMore: boolean;
};

export type SoftwareCatalogResultGroup = {
  family: string;
  subfamily: string;
  items: SoftwareCatalogEntry[];
};

export function normalizeCatalogText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function displayCatalogFamily(family: string): string {
  return family === 'Wire / EDM' ? 'Wire' : family;
}

export function displayCatalogSubfamily(family: string, subfamily: string): string {
  if (family !== 'CAM') return subfamily;
  if (subfamily === 'Integrações CAM') return 'Integrações';
  if (subfamily === 'Ferramentas / bibliotecas') return 'Ferramentas';
  return subfamily;
}

function toEntry(product: ProposalProduct, source: SoftwareCatalogSource): SoftwareCatalogEntry {
  const metadata = product.catalog ?? {
    family: 'Personalizados',
    subfamily: 'Produtos personalizados',
    folder: 'Personalizados',
    reviewStatus: '',
    isPrimary: false,
  };
  const shownSubfamily = metadata.isPrimary ? PRIMARY_SUBFAMILY : metadata.subfamily;
  const path: [string, string, string] = [metadata.family, shownSubfamily, metadata.folder];

  return {
    ...product,
    catalog: metadata,
    source,
    path,
    searchText: normalizeCatalogText([
      product.code,
      product.name,
      product.description,
      metadata.family,
      metadata.subfamily,
      metadata.folder,
      shownSubfamily,
    ].join(' ')),
  };
}

export function mergeSoftwareCatalog(
  official: SoftwareCatalogProduct[],
  browserCustom: ProposalProduct[],
  proposalOnly: ProposalProduct[],
): SoftwareCatalogEntry[] {
  return [...new Map([
    ...official.map((item) => toEntry(item, 'official')),
    ...browserCustom.map((item) => toEntry(item, 'browser-custom')),
    ...proposalOnly.map((item) => toEntry(item, 'proposal-only')),
  ].map((item) => [item.id, item])).values()];
}

function orderIndex(order: readonly string[], value: string): number {
  const index = order.indexOf(value);
  return index >= 0 ? index : order.length - 1;
}

function compareFamilies(left: string, right: string): number {
  const orderDifference = orderIndex(SOFTWARE_CATALOG_FAMILY_ORDER, left) - orderIndex(SOFTWARE_CATALOG_FAMILY_ORDER, right);
  return orderDifference || left.localeCompare(right, 'pt-BR');
}

function compareSubfamilies(family: string, left: string, right: string): number {
  if (left === PRIMARY_SUBFAMILY && right !== PRIMARY_SUBFAMILY) return -1;
  if (right === PRIMARY_SUBFAMILY && left !== PRIMARY_SUBFAMILY) return 1;
  if (family !== 'CAM') return left.localeCompare(right, 'pt-BR');
  const orderDifference = orderIndex(CAM_SUBFAMILY_ORDER, left) - orderIndex(CAM_SUBFAMILY_ORDER, right);
  return orderDifference || left.localeCompare(right, 'pt-BR');
}

export function buildCatalogTree(entries: SoftwareCatalogEntry[]): SoftwareCatalogFamily[] {
  const families = new Map<string, Map<string, Map<string, number>>>();

  for (const entry of entries) {
    const [familyName, subfamilyName, folderName] = entry.path;
    const subfamilies = families.get(familyName) ?? new Map<string, Map<string, number>>();
    if (!subfamilies.has(PRIMARY_SUBFAMILY)) {
      subfamilies.set(PRIMARY_SUBFAMILY, new Map());
    }
    const folders = subfamilies.get(subfamilyName) ?? new Map<string, number>();
    folders.set(folderName, (folders.get(folderName) ?? 0) + 1);
    subfamilies.set(subfamilyName, folders);
    families.set(familyName, subfamilies);
  }

  return [...families.entries()]
    .sort(([left], [right]) => compareFamilies(left, right))
    .map(([familyName, subfamilies]) => {
      const subfamilyItems = [...subfamilies.entries()]
        .sort(([left], [right]) => compareSubfamilies(familyName, left, right))
        .map(([subfamilyName, folders]) => ({
          name: subfamilyName,
          count: [...folders.values()].reduce((sum, count) => sum + count, 0),
          folders: [...folders.entries()]
            .sort(([left], [right]) => left.localeCompare(right, 'pt-BR'))
            .map(([name, count]) => ({ name, count })),
        }));

      return {
        name: familyName,
        count: subfamilyItems.reduce((sum, item) => sum + item.count, 0),
        subfamilies: subfamilyItems,
      };
    });
}

function hasHierarchyFilter(value: string | undefined): value is string {
  return Boolean(value && value !== 'Todos');
}

export function querySoftwareCatalog(
  entries: SoftwareCatalogEntry[],
  options: SoftwareCatalogQuery,
): SoftwareCatalogQueryResult {
  const query = normalizeCatalogText(options.query);
  const tokens = query.split(' ').filter(Boolean);
  const matches = entries.filter((entry) => {
    if (query) return tokens.every((token) => entry.searchText.includes(token));
    const [family, subfamily, folder] = entry.path;
    if (hasHierarchyFilter(options.family) && family !== options.family) return false;
    if (hasHierarchyFilter(options.subfamily) && subfamily !== options.subfamily) return false;
    if (hasHierarchyFilter(options.folder) && folder !== options.folder) return false;
    return true;
  });

  if (query) {
    matches.sort((left, right) => {
      const relevanceDifference = catalogRelevance(right, query, tokens) - catalogRelevance(left, query, tokens);
      if (relevanceDifference) return relevanceDifference;
      const primaryDifference = Number(Boolean(right.catalog?.isPrimary)) - Number(Boolean(left.catalog?.isPrimary));
      if (primaryDifference) return primaryDifference;
      return left.name.localeCompare(right.name, 'pt-BR');
    });
  }

  return {
    items: matches.slice(0, Math.max(0, options.limit)),
    total: matches.length,
    hasMore: matches.length > options.limit,
  };
}

function catalogRelevance(entry: SoftwareCatalogEntry, query: string, tokens: string[]): number {
  const code = normalizeCatalogText(entry.code);
  const name = normalizeCatalogText(entry.name);
  if (code === query) return 500;
  if (name === query) return 400;
  if (name.startsWith(query)) return 300;
  if (tokens.every((token) => name.includes(token))) return 200;
  return 100;
}

export function groupSoftwareCatalogResults(
  items: SoftwareCatalogEntry[],
): SoftwareCatalogResultGroup[] {
  const groups = new Map<string, SoftwareCatalogResultGroup>();
  for (const item of items) {
    const [family, subfamily] = item.path;
    const key = `${family}\u0000${subfamily}`;
    const group = groups.get(key) ?? { family, subfamily, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }

  return [...groups.values()].sort((left, right) => (
    compareFamilies(left.family, right.family)
      || compareSubfamilies(left.family, left.subfamily, right.subfamily)
  ));
}
