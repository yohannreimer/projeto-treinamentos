import { createHash } from 'node:crypto';

type CatalogRow = Record<string, unknown>;

export type GeneratedCatalogProduct = {
  id: string;
  code: string;
  name: string;
  unitValueUsd: number;
  defaultQuantity: number;
  description: string;
  catalog: {
    family: string;
    subfamily: string;
    folder: string;
    reviewStatus: '' | 'REVISAR';
  };
};

const LEGACY_ID_BY_REFERENCE = new Map<string, string>([
  ['TopSolid’Pdm Server 7 - Módulo - 1120', 'p1'],
  ['TopSolid’Pdm Explorer - Módulo - 1130', 'p2'],
  ['TopSolid’Design Pro 7 - Módulo - 0030', 'p3'],
  ['Ext/Cam M2 Milling 7 - Módulo - 0500', 'p4'],
  ['Ext/Cam M3 Milling 7 - Módulo - 0510', 'p5'],
  ['PP/Fanuc Milling 2D/3D Módulo (3511)', 'p6'],
  ['Ext/Split 7 - Módulo - 1300', 'p7'],
  ['Ext/Mold 7 - Módulo - 1310', 'p8'],
]);

function text(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function price(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return Number.NaN;
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  return Number(normalized);
}

function extractCode(reference: string): string {
  const moduleMatch = reference.match(/m[oó]dulo(?:s)?\s*(?:-|–|—|:)?\s*\(?\s*(\d{4,10})/iu);
  if (moduleMatch) return moduleMatch[1];
  const parenthesizedMatch = reference.match(/\((\d{4,10})\)/u);
  return parenthesizedMatch?.[1] ?? '';
}

function stableId(reference: string, family: string, subfamily: string, folder: string): string {
  const legacyId = LEGACY_ID_BY_REFERENCE.get(reference);
  if (legacyId) return legacyId;
  const hash = createHash('sha1')
    .update([reference, family, subfamily, folder].join('\u001f'))
    .digest('hex')
    .slice(0, 12);
  return `topsolid-${hash}`;
}

export function transformTopsolidRows(rows: CatalogRow[]): GeneratedCatalogProduct[] {
  const products = rows.map((row, index) => {
    const line = index + 2;
    const family = text(row.CATEGORIA_APP);
    const subfamily = text(row.SUBCATEGORIA_APP);
    const folder = text(row.PASTA_APP);
    const reference = text(row.REFERENCIA);
    const description = text(row.DESCRICAO);
    const unitValueUsd = price(row.VALOR);

    if (!family || !subfamily || !folder || !reference || !description || !Number.isFinite(unitValueUsd) || unitValueUsd < 0) {
      throw new Error(`Linha ${line} inválida no Catalogo_App.`);
    }

    return {
      id: stableId(reference, family, subfamily, folder),
      code: extractCode(reference),
      name: reference,
      unitValueUsd,
      defaultQuantity: 1,
      description,
      catalog: {
        family,
        subfamily,
        folder,
        reviewStatus: text(row.STATUS_REVISAO).toLocaleUpperCase('pt-BR') === 'REVISAR' ? 'REVISAR' as const : '' as const,
      },
    };
  });

  const ids = new Set<string>();
  for (const product of products) {
    if (ids.has(product.id)) throw new Error(`ID duplicado ${product.id} no Catalogo_App.`);
    ids.add(product.id);
  }

  return products;
}

export function serializeCatalogModule(products: GeneratedCatalogProduct[]): string {
  return `import type { SoftwareCatalogProduct } from './softwareCatalog';\n\nexport const TOPSOLID_CATALOG_PRODUCTS = ${JSON.stringify(products, null, 2)} satisfies SoftwareCatalogProduct[];\n`;
}
