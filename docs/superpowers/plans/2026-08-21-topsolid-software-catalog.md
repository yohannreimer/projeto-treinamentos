# TopSolid Software Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat proposal software list with a searchable 450-item TopSolid catalog while preserving services, manual saves, saved-proposal reopening, and the live proposal preview.

**Architecture:** Generate a typed, versioned frontend catalog from the supplied XLSX using the backend workspace's existing `xlsx` dependency. Keep proposal draft state and persistence in `ProposalsPage`, but move catalog indexing, filtering, presentation, and selected-item summary into focused proposal components. The catalog replaces only the editor column while open; the existing preview column remains mounted and reacts to the same `selectedProductIds` state.

**Tech Stack:** React 18, TypeScript 5.7, Vite, Vitest, Testing Library, Node/tsx, SheetJS `xlsx`, existing Express/SQLite proposal API.

---

## File map

### Create

- `apps/frontend/src/proposals/softwareCatalog.ts` — catalog types, source merging, text normalization, hierarchy, filtering, and pagination.
- `apps/frontend/src/proposals/softwareCatalog.test.ts` — deterministic unit tests for catalog behavior.
- `apps/frontend/src/proposals/topsolidCatalog.generated.ts` — generated 450-product official catalog committed to the repository.
- `apps/frontend/src/proposals/topsolidCatalog.generated.test.ts` — count, quality, hierarchy, review-state, and legacy-ID assertions against the generated data.
- `apps/backend/src/proposals/topsolidCatalogGenerator.ts` — pure spreadsheet-row transformation and TypeScript serialization.
- `apps/backend/src/proposals/topsolidCatalogGenerator.test.ts` — generator validation and stable-ID tests.
- `apps/backend/src/proposals/generateTopsolidCatalog.ts` — CLI that reads `Catalogo_App` and writes the generated frontend module.
- `apps/frontend/src/proposals/SoftwareCatalogExplorer.tsx` — catalog search, family/subfamily navigation, progressive results, selection, focus, and Escape behavior.
- `apps/frontend/src/proposals/SoftwareCatalogExplorer.test.tsx` — interaction and accessibility tests.
- `apps/frontend/src/proposals/SoftwareSelectionSummary.tsx` — compact selected-software block shown in the proposal editor.
- `apps/frontend/src/proposals/SoftwareSelectionSummary.test.tsx` — selected-item rendering and actions.

### Modify

- `apps/backend/package.json` — add the reproducible catalog-generation command.
- `apps/frontend/src/proposals/proposalData.ts` — extend the product type with optional catalog metadata and replace the 11-item constant with the generated catalog export.
- `apps/frontend/src/pages/ProposalsPage.tsx` — mount the explorer in the editor column, keep services outside it, and retain draft/persistence ownership.
- `apps/frontend/src/pages/ProposalsPage.test.tsx` — cover integration with preview, services, manual save, custom products, and focus restoration.
- `apps/frontend/src/proposals/proposalDocument.test.ts` — prove legacy products absent from the XLSX still restore from snapshots.
- `apps/frontend/src/styles.css` — catalog, selected summary, expanded editor, responsive, focus, and print isolation styles.

## Task 1: Define the catalog model and query behavior

**Files:**
- Create: `apps/frontend/src/proposals/softwareCatalog.ts`
- Create: `apps/frontend/src/proposals/softwareCatalog.test.ts`
- Modify: `apps/frontend/src/proposals/proposalData.ts:1-18`

- [ ] **Step 1: Write the failing model tests**

Create fixtures for official, browser-custom, and proposal-only products. Assert accent-insensitive global search, family/subfamily filtering, the approved family order and labels, hierarchy counts, the `Personalizados` family, and 50-item pagination.

```ts
import { describe, expect, test } from 'vitest';
import {
  buildCatalogTree,
  mergeSoftwareCatalog,
  querySoftwareCatalog,
  SOFTWARE_CATALOG_PAGE_SIZE,
  type SoftwareCatalogProduct,
} from './softwareCatalog';

const official: SoftwareCatalogProduct[] = [
  {
    id: 'p4', code: '0500', name: 'Ext/Cam M2 Milling 7', unitValueUsd: 5500,
    defaultQuantity: 1, description: 'Fresamento de 2 ½ eixos',
    catalog: { family: 'CAM', subfamily: 'Milling', folder: 'Extensões Milling', reviewStatus: '' },
  },
  {
    id: 'official-ifc', code: '5072', name: 'IFC Exportador 7', unitValueUsd: 1000,
    defaultQuantity: 1, description: 'Exportador de interface IFC',
    catalog: { family: 'Interfaces', subfamily: 'BIM / Estruturas', folder: 'IFC / Revit / DSTV', reviewStatus: '' },
  },
];

describe('softwareCatalog', () => {
  test('searches the whole catalog without accents and reports paths', () => {
    const entries = mergeSoftwareCatalog(official, [], []);
    expect(querySoftwareCatalog(entries, { query: 'fresamento', family: 'Interfaces', subfamily: 'BIM / Estruturas', limit: 50 }).items)
      .toEqual([expect.objectContaining({ id: 'p4', path: ['CAM', 'Milling', 'Extensões Milling'] })]);
  });

  test('groups custom products under Personalizados', () => {
    const entries = mergeSoftwareCatalog(official, [{ id: 'custom-1', code: 'X', name: 'Produto local', unitValueUsd: 10, defaultQuantity: 1, description: '', custom: true }], []);
    expect(buildCatalogTree(entries).find((family) => family.name === 'Personalizados')?.count).toBe(1);
  });

  test('returns at most fifty items before show more', () => {
    const many = Array.from({ length: 51 }, (_, index) => ({ ...official[0], id: `cam-${index}`, name: `Milling ${index}` }));
    const result = querySoftwareCatalog(mergeSoftwareCatalog(many, [], []), { query: '', family: 'CAM', subfamily: 'Milling', limit: SOFTWARE_CATALOG_PAGE_SIZE });
    expect(result.items).toHaveLength(50);
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(51);
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm --workspace apps/frontend test -- softwareCatalog.test.ts`

Expected: FAIL because `softwareCatalog.ts` does not exist.

- [ ] **Step 3: Add optional catalog metadata to `ProposalProduct`**

```ts
export type ProposalProductCatalogMetadata = {
  family: string;
  subfamily: string;
  folder: string;
  reviewStatus: '' | 'REVISAR';
};

export type ProposalProduct = {
  id: string;
  code: string;
  name: string;
  unitValueUsd: number;
  defaultQuantity: number;
  description: string;
  custom?: boolean;
  catalog?: ProposalProductCatalogMetadata;
};
```

Catalog metadata stays optional so existing saved documents and backend Zod schemas remain compatible and snapshots do not need a version bump.

- [ ] **Step 4: Implement the pure catalog model**

Implement these exact public contracts in `softwareCatalog.ts`:

```ts
import type { ProposalProduct, ProposalProductCatalogMetadata } from './proposalData';

export const SOFTWARE_CATALOG_PAGE_SIZE = 50;
export const SOFTWARE_CATALOG_FAMILY_ORDER = ['Design', 'Mold', 'Progress', 'Electrode', 'CAM', 'Wire / EDM', 'Inspection', 'PartCosting', 'Interfaces', 'Pós-processadores', 'Personalizados'] as const;
export type SoftwareCatalogSource = 'official' | 'browser-custom' | 'proposal-only';
export type SoftwareCatalogProduct = ProposalProduct & { catalog: ProposalProductCatalogMetadata };
export type SoftwareCatalogEntry = ProposalProduct & {
  source: SoftwareCatalogSource;
  path: [string, string, string];
  searchText: string;
};
export type SoftwareCatalogFamily = {
  name: string;
  count: number;
  subfamilies: Array<{ name: string; count: number; folders: Array<{ name: string; count: number }> }>;
};
export type SoftwareCatalogQuery = { query: string; family: string; subfamily: string; folder?: string; limit: number };

export function normalizeCatalogText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
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
  const metadata = product.catalog ?? { family: 'Personalizados', subfamily: 'Produtos personalizados', folder: 'Personalizados', reviewStatus: '' };
  const path: [string, string, string] = [metadata.family, metadata.subfamily, metadata.folder];
  return { ...product, source, path, searchText: normalizeCatalogText([product.code, product.name, product.description, ...path].join(' ')) };
}

export function mergeSoftwareCatalog(official: SoftwareCatalogProduct[], browserCustom: ProposalProduct[], proposalOnly: ProposalProduct[]): SoftwareCatalogEntry[] {
  return [...new Map([
    ...official.map((item) => toEntry(item, 'official')),
    ...browserCustom.map((item) => toEntry(item, 'browser-custom')),
    ...proposalOnly.map((item) => toEntry(item, 'proposal-only')),
  ].map((item) => [item.id, item])).values()];
}
```

Complete `buildCatalogTree` by counting entries and sorting families by `SOFTWARE_CATALOG_FAMILY_ORDER`. Sort normal subfamilies with `localeCompare('pt-BR')`, but use this order within CAM: Milling, Turning, Mill-Turn, Extensões, Integrações CAM, Ferramentas / bibliotecas, SheetMetal Cut. Sort folders with `localeCompare('pt-BR')`. Complete `querySoftwareCatalog` so a non-empty normalized query ignores current family/subfamily/folder, while an empty query applies all three filters. Return `{ items: matches.slice(0, limit), total: matches.length, hasMore: matches.length > limit }`.

- [ ] **Step 5: Run the focused tests**

Run: `npm --workspace apps/frontend test -- softwareCatalog.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 6: Commit the model**

```bash
git add apps/frontend/src/proposals/proposalData.ts apps/frontend/src/proposals/softwareCatalog.ts apps/frontend/src/proposals/softwareCatalog.test.ts
git commit -m "feat: add proposal software catalog model"
```

## Task 2: Build the reproducible XLSX generator

**Files:**
- Create: `apps/backend/src/proposals/topsolidCatalogGenerator.ts`
- Create: `apps/backend/src/proposals/topsolidCatalogGenerator.test.ts`
- Create: `apps/backend/src/proposals/generateTopsolidCatalog.ts`
- Modify: `apps/backend/package.json:6-12`

- [ ] **Step 1: Write the failing generator tests**

Use representative `Catalogo_App` rows and assert field mapping, stable hash IDs, the eight exact legacy mappings, validation failures, and TypeScript serialization.

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeCatalogModule, transformTopsolidRows } from './topsolidCatalogGenerator.js';

test('maps catalog rows and preserves an exact legacy product id', () => {
  const products = transformTopsolidRows([{
    CATEGORIA_APP: 'CAM', SUBCATEGORIA_APP: 'Milling', PASTA_APP: 'Extensões Milling',
    REFERENCIA: 'Ext/Cam M2 Milling 7 - Módulo - 0500', DESCRICAO: 'Fresamento',
    MOEDA: 'US$ - Padrão', VALOR: 5500, STATUS_REVISAO: '',
  }]);
  assert.deepEqual(products[0], {
    id: 'p4', code: '0500', name: 'Ext/Cam M2 Milling 7 - Módulo - 0500',
    unitValueUsd: 5500, defaultQuantity: 1, description: 'Fresamento',
    catalog: { family: 'CAM', subfamily: 'Milling', folder: 'Extensões Milling', reviewStatus: '' },
  });
});

test('rejects rows without saleable fields', () => {
  assert.throws(() => transformTopsolidRows([{ REFERENCIA: '', DESCRICAO: '', VALOR: '' }]), /Linha 2/);
});

test('serializes a typed generated module', () => {
  const output = serializeCatalogModule(transformTopsolidRows([{
    CATEGORIA_APP: 'Design', SUBCATEGORIA_APP: 'PDM', PASTA_APP: 'PDM',
    REFERENCIA: "TopSolid’Pdm Server 7 - Módulo - 1120", DESCRICAO: 'Servidor', VALOR: 1000,
  }]));
  assert.match(output, /satisfies SoftwareCatalogProduct\[\]/);
  assert.match(output, /id: "p1"/);
});
```

- [ ] **Step 2: Run the backend test and verify failure**

Run: `npm --workspace apps/backend exec -- tsx --test src/proposals/topsolidCatalogGenerator.test.ts`

Expected: FAIL because the generator module does not exist.

- [ ] **Step 3: Implement row transformation and serialization**

In `topsolidCatalogGenerator.ts`, export `transformTopsolidRows(rows)` and `serializeCatalogModule(products)`. Use `node:crypto` SHA-1 truncated to 12 characters for non-legacy IDs and this exact compatibility table:

```ts
const LEGACY_ID_BY_REFERENCE = new Map([
  ["TopSolid’Pdm Server 7 - Módulo - 1120", 'p1'],
  ["TopSolid’Pdm Explorer - Módulo - 1130", 'p2'],
  ["TopSolid’Design Pro 7 - Módulo - 0030", 'p3'],
  ["Ext/Cam M2 Milling 7 - Módulo - 0500", 'p4'],
  ["Ext/Cam M3 Milling 7 - Módulo - 0510", 'p5'],
  ["PP/Fanuc Milling 2D/3D Módulo (3511)", 'p6'],
  ["Ext/Split 7 - Módulo - 1300", 'p7'],
  ["Ext/Mold 7 - Módulo - 1310", 'p8'],
]);
```

Extract `code` from the first 4–10 digit sequence following `Módulo`, falling back to the first parenthesized 4–10 digit sequence, then to an empty string. Validate every row has category, subcategory, folder, reference, description, and a finite non-negative numeric value. Normalize `STATUS_REVISAO` to `REVISAR` or an empty string.

`serializeCatalogModule` must emit this module shape before serializing the product array with `JSON.stringify(products, null, 2)`:

```ts
export function serializeCatalogModule(products: GeneratedCatalogProduct[]): string {
  return `import type { SoftwareCatalogProduct } from './softwareCatalog';\n\nexport const TOPSOLID_CATALOG_PRODUCTS = ${JSON.stringify(products, null, 2)} satisfies SoftwareCatalogProduct[];\n`;
}
```

Throw if generated IDs are duplicated.

- [ ] **Step 4: Implement the CLI and package script**

`generateTopsolidCatalog.ts` must use `import XLSX from 'xlsx'`, parse `--input <absolute-xlsx-path>` and optional `--output <path>`, read only `Catalogo_App`, transform its rows, require exactly 450 results, and write the serialized module. Default output:

```ts
const defaultOutput = fileURLToPath(new URL('../../../frontend/src/proposals/topsolidCatalog.generated.ts', import.meta.url));
```

Add to `apps/backend/package.json`:

```json
"generate:topsolid-catalog": "tsx src/proposals/generateTopsolidCatalog.ts"
```

- [ ] **Step 5: Run generator tests**

Run: `npm --workspace apps/backend exec -- tsx --test src/proposals/topsolidCatalogGenerator.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 6: Commit the generator**

```bash
git add apps/backend/package.json apps/backend/src/proposals/topsolidCatalogGenerator.ts apps/backend/src/proposals/topsolidCatalogGenerator.test.ts apps/backend/src/proposals/generateTopsolidCatalog.ts
git commit -m "feat: add TopSolid catalog generator"
```

## Task 3: Generate and validate all 450 official products

**Files:**
- Create: `apps/frontend/src/proposals/topsolidCatalog.generated.ts`
- Create: `apps/frontend/src/proposals/topsolidCatalog.generated.test.ts`
- Modify: `apps/frontend/src/proposals/proposalData.ts:136-239`

- [ ] **Step 1: Generate the committed catalog**

Run:

```bash
npm --workspace apps/backend run generate:topsolid-catalog -- --input "/Users/yohannreimer/Downloads/TopSolid7_Estruturado_App.xlsx"
```

Expected: `Generated 450 products at .../apps/frontend/src/proposals/topsolidCatalog.generated.ts`.

- [ ] **Step 2: Write generated-data validation tests**

```ts
import { describe, expect, test } from 'vitest';
import { TOPSOLID_CATALOG_PRODUCTS } from './topsolidCatalog.generated';

describe('generated TopSolid catalog', () => {
  test('contains the complete validated price list', () => {
    expect(TOPSOLID_CATALOG_PRODUCTS).toHaveLength(450);
    expect(new Set(TOPSOLID_CATALOG_PRODUCTS.map((item) => item.id)).size).toBe(450);
    expect(TOPSOLID_CATALOG_PRODUCTS.every((item) => item.name && item.description && Number.isFinite(item.unitValueUsd))).toBe(true);
    expect(TOPSOLID_CATALOG_PRODUCTS.filter((item) => item.catalog.reviewStatus === 'REVISAR')).toHaveLength(2);
  });

  test('matches the spreadsheet family counts', () => {
    const counts = TOPSOLID_CATALOG_PRODUCTS.reduce<Record<string, number>>((result, item) => {
      result[item.catalog.family] = (result[item.catalog.family] ?? 0) + 1;
      return result;
    }, {});
    expect(counts).toEqual({ Design: 34, Mold: 13, Progress: 5, Electrode: 1, CAM: 66, 'Wire / EDM': 4, Inspection: 2, PartCosting: 3, Interfaces: 84, 'Pós-processadores': 238 });
  });

  test('preserves the eight matching legacy ids', () => {
    expect(TOPSOLID_CATALOG_PRODUCTS.filter((item) => /^p[1-8]$/.test(item.id)).map((item) => item.id).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
  });
});
```

- [ ] **Step 3: Replace the hard-coded product array**

Delete the 11-object `PROPOSAL_PRODUCTS` literal from `proposalData.ts` and add:

```ts
export { TOPSOLID_CATALOG_PRODUCTS as PROPOSAL_PRODUCTS } from './topsolidCatalog.generated';
```

Keep `ProposalProduct`, constants, and service data in `proposalData.ts`.

- [ ] **Step 4: Run data, document, and build verification**

Run:

```bash
npm --workspace apps/frontend test -- topsolidCatalog.generated.test.ts proposalDocument.test.ts
npm --workspace apps/frontend run build
```

Expected: all tests PASS and Vite build exits 0.

- [ ] **Step 5: Commit the official catalog**

```bash
git add apps/frontend/src/proposals/proposalData.ts apps/frontend/src/proposals/topsolidCatalog.generated.ts apps/frontend/src/proposals/topsolidCatalog.generated.test.ts
git commit -m "feat: import TopSolid price list catalog"
```

## Task 4: Build the accessible catalog explorer

**Files:**
- Create: `apps/frontend/src/proposals/SoftwareCatalogExplorer.tsx`
- Create: `apps/frontend/src/proposals/SoftwareCatalogExplorer.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

Render the component with the committed generated catalog so the interaction tests exercise the real family counts and hierarchy. Cover these behaviors with Testing Library:

```ts
import { TOPSOLID_CATALOG_PRODUCTS } from './topsolidCatalog.generated';

const defaultProps = {
  products: mergeSoftwareCatalog(TOPSOLID_CATALOG_PRODUCTS, [], []),
  selectedIds: new Set<string>(),
  softwareSubtotalUsd: 0,
  onToggle: vi.fn(),
  onDone: vi.fn(),
};

test('navigates CAM to Milling and toggles a product', async () => {
  const user = userEvent.setup();
  render(<SoftwareCatalogExplorer {...defaultProps} />);
  await user.click(screen.getByRole('button', { name: /CAM.*66/ }));
  await user.click(screen.getByRole('button', { name: /Milling.*34/ }));
  await user.click(screen.getByRole('button', { name: /Adicionar Ext\/Cam M2 Milling 7/ }));
  expect(defaultProps.onToggle).toHaveBeenCalledWith('p4');
});

test('searches globally and exposes the result path', async () => {
  const user = userEvent.setup();
  render(<SoftwareCatalogExplorer {...defaultProps} />);
  await user.type(screen.getByRole('searchbox', { name: 'Buscar software' }), 'Fanuc');
  expect(screen.getByText('Pós-processadores / CAM / Bases de Pós-processadores CAM')).toBeInTheDocument();
});

test('shows fifty results before loading more', async () => {
  const user = userEvent.setup();
  render(<SoftwareCatalogExplorer {...defaultProps} />);
  await user.click(screen.getByRole('button', { name: /Pós-processadores.*238/ }));
  expect(screen.getAllByRole('article')).toHaveLength(50);
  await user.click(screen.getByRole('button', { name: /Mostrar mais/ }));
  expect(screen.getAllByRole('article')).toHaveLength(100);
});
```

Also test the `REVISAR` text, selected state with `aria-pressed`, **Concluir seleção**, empty results, initial search focus, and `Escape` calling `onDone`.

- [ ] **Step 2: Run the component test and verify failure**

Run: `npm --workspace apps/frontend test -- SoftwareCatalogExplorer.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the component with controlled selection**

Use this public interface:

```ts
type SoftwareCatalogExplorerProps = {
  products: SoftwareCatalogEntry[];
  selectedIds: ReadonlySet<string>;
  softwareSubtotalUsd: number;
  onToggle: (id: string) => void;
  onDone: () => void;
};
```

The component owns only `query`, `family`, `subfamily`, `folder`, and `limit`. It derives the tree and visible results from `softwareCatalog.ts`, resets `limit` to 50 whenever navigation/search changes, focuses the search input on mount, listens for `Escape`, and returns focus responsibility to the page through `onDone`. Product selection must remain controlled by `selectedIds`; no duplicate cart state is allowed.

Use buttons with count-inclusive accessible names, `aria-pressed` for families/subfamilies/product actions, a `role="status"` result count, and an `aria-label="Catálogo de software"` root section.

- [ ] **Step 4: Run the explorer tests**

Run: `npm --workspace apps/frontend test -- SoftwareCatalogExplorer.test.tsx`

Expected: all explorer tests PASS.

- [ ] **Step 5: Commit the explorer**

```bash
git add apps/frontend/src/proposals/SoftwareCatalogExplorer.tsx apps/frontend/src/proposals/SoftwareCatalogExplorer.test.tsx
git commit -m "feat: add TopSolid catalog explorer"
```

## Task 5: Build the compact selected-software summary

**Files:**
- Create: `apps/frontend/src/proposals/SoftwareSelectionSummary.tsx`
- Create: `apps/frontend/src/proposals/SoftwareSelectionSummary.test.tsx`

- [ ] **Step 1: Write failing summary tests**

Assert the empty state, selected names/prices, edit/remove/open actions, and that custom products receive a `CUSTOM` marker.

```ts
test('renders selected products and forwards actions', async () => {
  const user = userEvent.setup();
  const onOpenCatalog = vi.fn();
  const onEdit = vi.fn();
  const onRemove = vi.fn();
  render(<SoftwareSelectionSummary products={[editableProduct]} onOpenCatalog={onOpenCatalog} onEdit={onEdit} onRemove={onRemove} />);
  expect(screen.getByText("TopSolid'Design Pro 7")).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: "Editar TopSolid'Design Pro 7" }));
  await user.click(screen.getByRole('button', { name: "Remover TopSolid'Design Pro 7" }));
  await user.click(screen.getByRole('button', { name: 'Adicionar software do catálogo' }));
  expect(onEdit).toHaveBeenCalledWith('p3');
  expect(onRemove).toHaveBeenCalledWith('p3');
  expect(onOpenCatalog).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm --workspace apps/frontend test -- SoftwareSelectionSummary.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the controlled summary**

Use the existing `EditableProposalProduct` shape by exporting that type from `ProposalsPage.tsx` into `proposalData.ts` or, preferably, moving it to `proposalData.ts` without changing its fields. The component interface is:

```ts
type SoftwareSelectionSummaryProps = {
  products: EditableProposalProduct[];
  onOpenCatalog: () => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
};
```

Render only selected products. Reuse `formatUsdCurrency`; do not recalculate proposal totals in this component. Keep custom-product creation in the Software panel beneath the summary so its existing local behavior remains unchanged.

- [ ] **Step 4: Run summary and proposal math tests**

Run: `npm --workspace apps/frontend test -- SoftwareSelectionSummary.test.tsx proposalMath.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit the summary**

```bash
git add apps/frontend/src/proposals/proposalData.ts apps/frontend/src/proposals/SoftwareSelectionSummary.tsx apps/frontend/src/proposals/SoftwareSelectionSummary.test.tsx
git commit -m "feat: add selected software summary"
```

## Task 6: Integrate the explorer without displacing services or preview

**Files:**
- Modify: `apps/frontend/src/pages/ProposalsPage.tsx:1118-1345,1865-2325`
- Modify: `apps/frontend/src/pages/ProposalsPage.test.tsx`

- [ ] **Step 1: Add failing page-level tests**

Add API mocks only if the existing mock object requires them; the official catalog itself must not call an API. Test:

```ts
test('opens software catalog while keeping proposal preview mounted', async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<ProposalsPage />);
  await user.click(screen.getByRole('button', { name: 'Adicionar software do catálogo' }));
  expect(screen.getByRole('region', { name: 'Catálogo de software' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Prévia da proposta' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Serviços' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Adicionar Ext\/Cam M2 Milling 7/ }));
  expect(within(screen.getByRole('region', { name: 'Prévia da proposta' })).getByText(/Ext\/Cam M2 Milling 7/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Concluir seleção' }));
  expect(screen.getByRole('heading', { name: 'Serviços' })).toBeInTheDocument();
});

test('returns focus to the catalog trigger after Escape', async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<ProposalsPage />);
  const trigger = screen.getByRole('button', { name: 'Adicionar software do catálogo' });
  await user.click(trigger);
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
});
```

Add a test proving a browser-local custom product appears under `Personalizados`, while a custom service still renders under **Serviços** and remains backed by the existing shared-service API.

- [ ] **Step 2: Run integration tests and verify failure**

Run: `npm --workspace apps/frontend test -- ProposalsPage.test.tsx`

Expected: new catalog tests FAIL; existing tests remain useful regression coverage.

- [ ] **Step 3: Wire catalog state and derived entries**

Add:

```ts
const [isSoftwareCatalogOpen, setIsSoftwareCatalogOpen] = useState(false);
const catalogTriggerRef = useRef<HTMLButtonElement>(null);
const catalogEntries = useMemo(
  () => mergeSoftwareCatalog(PROPOSAL_PRODUCTS, customProducts, proposalCustomProducts),
  [customProducts, proposalCustomProducts],
);
```

Use one `closeSoftwareCatalog` callback that sets the flag to false and schedules `catalogTriggerRef.current?.focus()` with `requestAnimationFrame`. Close the catalog when applying a saved document or starting a new proposal.

- [ ] **Step 4: Replace the flat software list with the approved flow**

When `isSoftwareCatalogOpen` is true, render `SoftwareCatalogExplorer` after the persistent sidebar header and saved-proposal panel, and hide the remaining editor sections. Keep `<main className="proposals-preview-wrap">` mounted outside the conditional.

When closed, the Software panel contains, in order:

1. current USD/BRL exchange controls;
2. `SoftwareSelectionSummary` for `selectedProducts`;
3. the existing custom-product form and active product editor.

Remove the `products.map(ProductCard)` flat render and the dangerous **Todos** action for all 450 products. `onToggle` must call the existing `toggleProductSelected`, preserving target-discount reset behavior. `onRemove` must also use that same function.

- [ ] **Step 5: Run all proposal tests**

Run:

```bash
npm --workspace apps/frontend test -- ProposalsPage.test.tsx SoftwareCatalogExplorer.test.tsx SoftwareSelectionSummary.test.tsx proposalDocument.test.ts proposalMath.test.ts
```

Expected: all selected suites PASS.

- [ ] **Step 6: Commit the integration**

```bash
git add apps/frontend/src/pages/ProposalsPage.tsx apps/frontend/src/pages/ProposalsPage.test.tsx
git commit -m "feat: integrate catalog into proposal editor"
```

## Task 7: Style desktop, tablet, mobile, and print behavior

**Files:**
- Modify: `apps/frontend/src/styles.css:11908-13140`

- [ ] **Step 1: Add layout state classes in the page**

Set the root class to `proposals-page is-software-catalog-open` while the explorer is open. Add component-specific classes prefixed `proposal-catalog-` and `proposal-software-summary-`; do not introduce global utility classes.

- [ ] **Step 2: Add desktop catalog layout**

Use these structural rules as the baseline:

```css
.proposals-page.is-software-catalog-open {
  grid-template-columns: minmax(620px, 0.95fr) minmax(460px, 1.05fr);
}

.proposals-page .proposal-catalog {
  background: var(--proposal-dark);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  min-height: calc(100vh - 190px);
  overflow: hidden;
}

.proposals-page .proposal-catalog-body {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  min-height: 0;
}
```

Style family buttons as a horizontal scroll strip, subfamilies as a compact rail, products as rows rather than large cards, and the footer as a sticky selection summary. Use existing proposal red, dark, muted, border, focus, and typography tokens.

- [ ] **Step 3: Add responsive rules**

At `max-width: 980px`, keep the existing single-column page: explorer first, preview below. At `max-width: 560px`, make families and subfamilies independent horizontal strips, collapse each product row to price/action beneath the copy, and ensure every interactive target is at least 40px high. The page itself must never gain horizontal overflow.

- [ ] **Step 4: Isolate catalog controls from print**

Inside `@media print`, explicitly hide `.proposal-catalog` and `.proposal-software-summary-actions`. Keep the existing `.proposals-preview-wrap` and `.proposal-document` print rules unchanged.

- [ ] **Step 5: Run build verification**

Run: `npm --workspace apps/frontend run build`

Expected: TypeScript and Vite build exit 0.

- [ ] **Step 6: Commit responsive styling**

```bash
git add apps/frontend/src/pages/ProposalsPage.tsx apps/frontend/src/styles.css
git commit -m "style: add responsive software catalog layout"
```

## Task 8: Verify saved proposals and legacy snapshots

**Files:**
- Modify: `apps/frontend/src/proposals/proposalDocument.test.ts`
- Modify: `apps/frontend/src/pages/ProposalsPage.test.tsx`

- [ ] **Step 1: Add the absent-legacy snapshot test**

Add a saved `ProposalProductSnapshot` for `p9` (`Admin/Float`) to a test document, call `restoreProposalDocument(document, services, TOPSOLID_CATALOG_PRODUCTS)`, and assert:

```ts
expect(restored.proposalCustomProducts).toEqual([expect.objectContaining({ id: 'p9', name: 'Admin/Float' })]);
expect([...restored.selectedProductIds]).toContain('p9');
expect(restored.proposalProductEdits.p9.unitValueUsd).toBe(500);
```

- [ ] **Step 2: Add manual save and reopen coverage for a generated product**

In `ProposalsPage.test.tsx`, select `Ext/Cam M2 Milling 7` through the explorer, manually save, inspect `api.createProposal.mock.calls[0][0].document.productSnapshots`, then reopen the mocked saved proposal and assert the item remains in the selected summary and preview with its saved price.

- [ ] **Step 3: Run persistence regression tests**

Run:

```bash
npm --workspace apps/frontend test -- proposalDocument.test.ts ProposalsPage.test.tsx
npm --workspace apps/backend exec -- tsx --test src/proposals/proposals.test.ts
```

Expected: frontend document/page tests PASS and backend proposal schema tests PASS without a document-version migration.

- [ ] **Step 4: Commit persistence coverage**

```bash
git add apps/frontend/src/proposals/proposalDocument.test.ts apps/frontend/src/pages/ProposalsPage.test.tsx
git commit -m "test: cover catalog proposal persistence"
```

## Task 9: Perform browser QA and full verification

**Files:**
- Modify only files required by defects found during verification.

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
npm --workspace apps/backend test
npm --workspace apps/frontend test
npm run build
```

Expected: every command exits 0 with no failing tests or TypeScript errors.

- [ ] **Step 2: Start the application for browser verification**

Run backend and frontend in separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

Expected: backend starts on its configured local port and Vite starts at `http://localhost:5173`.

- [ ] **Step 3: Verify the approved flow at desktop width**

At 1440×900:

1. Open Propostas and confirm the saved-proposals panel, client fields, Software, Serviços, commercial controls, and proposal preview are present.
2. Open the software catalog and confirm the editor widens while the proposal preview remains visible.
3. Navigate CAM → Milling; add and remove products; confirm subtotal and preview update immediately.
4. Search `Fanuc`, `5072`, and `fresamento`; confirm cross-family results and breadcrumb paths.
5. Open Pós-processadores; confirm only 50 products render before **Mostrar mais**.
6. Press Escape; confirm the catalog closes and focus returns to **Adicionar software do catálogo**.
7. Save manually, reopen the proposal, and confirm software, services, quantities, maintenance, and values are restored.

- [ ] **Step 4: Verify tablet and mobile widths**

At 736×1000 and 360×800, repeat opening, searching, selecting, concluding, and reopening. Confirm family/subfamily strips scroll internally, the page has no horizontal overflow, product actions remain reachable, and the preview appears below the editor.

- [ ] **Step 5: Verify print isolation**

Open print preview with the catalog closed and confirm the commercial document layout is unchanged. Open the catalog, invoke print preview again, and confirm catalog/editor controls are absent while the proposal document remains printable.

- [ ] **Step 6: Review the final diff and commit any QA fixes**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intentional project files are modified. If QA required corrections:

```bash
git add apps/frontend/src apps/backend/src apps/backend/package.json
git commit -m "fix: polish TopSolid catalog flow"
```

- [ ] **Step 7: Push after verification**

Run:

```bash
git push origin main
```

Expected: the verified commits are available on the GitHub `main` branch.
