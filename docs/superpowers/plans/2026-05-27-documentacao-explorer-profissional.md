# Documentação Explorer Profissional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the `Documentação` page into a Finder-style explorer with progressive folders, scoped search, grouped results, and a right-side details/actions panel.

**Architecture:** Keep the existing backend APIs and concentrate the frontend redesign in `InternalDocsPage.tsx`, `InternalDocsPage.test.tsx`, and `styles.css`. Add small local helper types/functions inside `InternalDocsPage.tsx` first, then replace rendering sections incrementally so existing preview/download/upload behavior remains intact.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, existing `api` service helpers, existing CSS variables/design system.

---

## File Structure

- Modify `apps/frontend/src/pages/InternalDocsPage.tsx`
  - Add normalized explorer item types.
  - Add progressive tree expansion state.
  - Add search scope state.
  - Add grouped result generation.
  - Add selected item/right-panel mode state.
  - Replace current action panel with `+ Novo` menu and right-panel forms.
- Modify `apps/frontend/src/pages/InternalDocsPage.test.tsx`
  - Extend fixtures for companies, modules, folders, documents, surveys, and certificates.
  - Add tests for scoped grouped search, progressive tree behavior, right panel details, and `+ Novo` flows.
  - Preserve existing authenticated preview/download tests.
- Modify `apps/frontend/src/styles.css`
  - Replace current documentation explorer rules with desktop three-pane layout.
  - Add grouped search sections, tree disclosure styling, right panel, menu, and responsive drawer behavior.
- Do not modify backend APIs in this plan.
  - Existing endpoints already provide documents, folders, companies, modules, and follow-up evaluations.
  - Existing certificate survey detection and rendering remain in frontend helpers.

## Task 1: Add Explorer Data Model And Search Group Tests

**Files:**
- Modify: `apps/frontend/src/pages/InternalDocsPage.test.tsx`
- Modify: `apps/frontend/src/pages/InternalDocsPage.tsx`

- [ ] **Step 1: Add richer test fixtures**

In `apps/frontend/src/pages/InternalDocsPage.test.tsx`, replace the current single-document fixture with fixtures like this:

```ts
const companies = [
  { id: 'comp-magui', name: 'Magui Dispositivos de Controle Ltda', status: 'Ativo' },
  { id: 'comp-holand', name: 'Holand Automação de Engenharias Ltda', status: 'Ativo' }
];

const modules = [
  { id: 'mod-cam', code: '020102010', name: "Treinamento TopSolid'Cam 7 - Fresamento 2D", delivery_mode: 'Treinamento' },
  { id: 'mod-design', code: '020101020', name: "Treinamento TopSolid'Design 7 - Básico", delivery_mode: 'Treinamento' }
];

const folders = [
  {
    id: 'folder-interna',
    parent_path: '/Interna',
    path: '/Interna/Materiais',
    name: 'Materiais',
    created_at: '2026-05-08',
    updated_at: '2026-05-08'
  }
];

const rows = [
  {
    id: 'doc-cert',
    title: 'Certificado - Holand - Design Básico',
    category: 'Certificados',
    notes: 'Chave: CERTIFICADO_CLIENTE_MODULO:comp-holand:mod-design',
    folder_path: null,
    file_name: 'certificado-holand.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 1234,
    created_at: '2026-05-08',
    updated_at: '2026-05-08'
  },
  {
    id: 'doc-survey',
    title: "Pesquisa - Magui - Treinamento TopSolid'Cam 7 - Fresamento 2D",
    category: 'Pesquisas de Satisfação',
    notes: [
      '[PESQUISA_SATISFACAO_CERTIFICADO]',
      'Chave: PESQUISA_CERTIFICADO:comp-magui:coh-1:mod-cam',
      'Empresa: Magui Dispositivos de Controle Ltda',
      'Turma: TUR-008 · TopSolid CAM 2D',
      "Módulo: Treinamento TopSolid'Cam 7 - Fresamento 2D",
      'Respondido por: Cleberson',
      'Enviado em: 2026-05-08T16:52:51.840Z',
      '',
      'Respostas:',
      'q1: 5'
    ].join('\n'),
    folder_path: null,
    file_name: 'pesquisa-magui.html',
    mime_type: 'text/html',
    file_size_bytes: 3000,
    created_at: '2026-05-08',
    updated_at: '2026-05-08'
  },
  {
    id: 'doc-internal',
    title: 'Material interno de implantação',
    category: 'Materiais',
    notes: 'Guia de uso interno.',
    folder_path: '/Interna/Materiais',
    file_name: 'material.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 2200,
    created_at: '2026-05-08',
    updated_at: '2026-05-08'
  }
];
```

- [ ] **Step 2: Update mocked load order**

Keep the four initial fetch responses in this order:

```ts
vi.stubGlobal('fetch', vi.fn()
  .mockResolvedValueOnce(new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  .mockResolvedValueOnce(new Response(JSON.stringify(folders), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  .mockResolvedValueOnce(new Response(JSON.stringify(companies), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  .mockResolvedValueOnce(new Response(JSON.stringify(modules), { status: 200, headers: { 'Content-Type': 'application/json' } })));
```

- [ ] **Step 3: Write grouped search test**

Add this test:

```ts
test('groups search results with full context in global search', async () => {
  const user = userEvent.setup();
  render(<InternalDocsPage />);

  await screen.findByRole('heading', { name: 'Documentação' });
  await user.type(screen.getByRole('searchbox', { name: 'Buscar documentação' }), 'satis');
  await user.click(screen.getByRole('button', { name: 'Tudo' }));

  expect(await screen.findByRole('heading', { name: 'Pastas' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Pesquisas' })).toBeInTheDocument();
  expect(screen.getByText(/Clientes > Magui Dispositivos de Controle Ltda > Pesquisa de satisfação/i)).toBeInTheDocument();
  expect(screen.getByText(/Treinamento TopSolid'Cam 7 - Fresamento 2D/i)).toBeInTheDocument();
});
```

- [ ] **Step 4: Run test and verify failure**

Run:

```bash
npm --workspace apps/frontend exec vitest run src/pages/InternalDocsPage.test.tsx --runInBand
```

Expected: FAIL because there is no `searchbox`, no `Tudo` scope control, and no grouped search headings yet.

- [ ] **Step 5: Add local explorer types and helpers**

In `apps/frontend/src/pages/InternalDocsPage.tsx`, add these types near existing types:

```ts
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
```

Add helpers below `findNode`-style helpers:

```ts
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
```

- [ ] **Step 6: Add grouped result computation**

Inside `InternalDocsPage`, add state:

```ts
const [searchScope, setSearchScope] = useState<SearchScope>('current');
const [selectedItem, setSelectedItem] = useState<DocsItem | null>(null);
const [panelMode, setPanelMode] = useState<DocsPanelMode>('details');
```

Add item-building memos:

```ts
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
```

Add grouped search:

```ts
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
```

- [ ] **Step 7: Run test and verify partial pass**

Run:

```bash
npm --workspace apps/frontend exec vitest run src/pages/InternalDocsPage.test.tsx --runInBand
```

Expected: still FAIL because the UI has not rendered these grouped results.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/InternalDocsPage.test.tsx apps/frontend/src/pages/InternalDocsPage.tsx
git commit -m "test: cover documentation grouped search"
```

## Task 2: Render Search Header And Grouped Results

**Files:**
- Modify: `apps/frontend/src/pages/InternalDocsPage.tsx`
- Modify: `apps/frontend/src/pages/InternalDocsPage.test.tsx`

- [ ] **Step 1: Replace sidebar search input with searchbox semantics**

Change the search input to:

```tsx
<input
  aria-label="Buscar documentação"
  type="search"
  role="searchbox"
  placeholder="Buscar"
  value={query}
  onChange={(event) => setQuery(event.target.value)}
/>
```

- [ ] **Step 2: Render scope segmented control in main toolbar**

Inside `.docs-toolbar`, render:

```tsx
<div className="docs-search-scope" role="group" aria-label="Escopo da busca">
  <button
    type="button"
    className={searchScope === 'current' ? 'is-active' : ''}
    onClick={() => setSearchScope('current')}
  >
    Nesta pasta
  </button>
  <button
    type="button"
    className={searchScope === 'all' ? 'is-active' : ''}
    onClick={() => setSearchScope('all')}
  >
    Tudo
  </button>
</div>
```

- [ ] **Step 3: Create `ResultGroup` component**

Below `FolderTree`, add:

```tsx
function ResultGroup({
  title,
  items,
  onOpen,
  onSelect
}: {
  title: string;
  items: DocsItem[];
  onOpen: (item: DocsItem) => void;
  onSelect: (item: DocsItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="docs-result-group">
      <header>
        <h3>{title}</h3>
        <span>{items.length} resultado(s)</span>
      </header>
      <div className="docs-result-list">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`docs-result-row docs-result-row--${item.kind}`}
            onClick={() => onSelect(item)}
            onDoubleClick={() => onOpen(item)}
          >
            <span className="docs-row-icon" aria-hidden="true">{item.kind === 'folder' ? '□' : item.kind === 'survey' ? '◇' : '▤'}</span>
            <span>
              <strong>{item.title}</strong>
              <small>{item.pathLabel}</small>
              <small>{item.subtitle}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Render grouped results when search is active**

Replace the current content list conditional with:

```tsx
{isSearchActive ? (
  <div className="docs-search-results">
    <ResultGroup title="Pastas" items={groupedResults.folders} onOpen={openDocsItem} onSelect={selectDocsItem} />
    <ResultGroup title="Pesquisas" items={groupedResults.surveys} onOpen={openDocsItem} onSelect={selectDocsItem} />
    <ResultGroup title="Certificados" items={groupedResults.certificates} onOpen={openDocsItem} onSelect={selectDocsItem} />
    <ResultGroup title="Arquivos" items={groupedResults.files} onOpen={openDocsItem} onSelect={selectDocsItem} />
    {groupedResults.folders.length + groupedResults.surveys.length + groupedResults.certificates.length + groupedResults.files.length === 0 ? (
      <p className="docs-empty-card">Nenhum resultado encontrado.</p>
    ) : null}
  </div>
) : (
  <CurrentFolderContent ... />
)}
```

If not extracting `CurrentFolderContent` yet, keep the existing non-search JSX in the `: (...)` branch.

- [ ] **Step 5: Add item handlers**

Inside `InternalDocsPage`, add:

```ts
function selectDocsItem(item: DocsItem) {
  setSelectedItem(item);
  setPanelMode('details');
}

function openDocsItem(item: DocsItem) {
  selectDocsItem(item);
  if (item.folder) {
    setSelectedPath(item.folder.path);
    return;
  }
  if (item.document && canPreviewDocument(item.document)) {
    void previewInternalDocument(item.document);
  }
}
```

- [ ] **Step 6: Run grouped search test**

Run:

```bash
npm --workspace apps/frontend exec vitest run src/pages/InternalDocsPage.test.tsx --runInBand
```

Expected: grouped search test PASS; existing preview/download tests may fail because labels changed and will be adjusted in later tasks.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/InternalDocsPage.tsx apps/frontend/src/pages/InternalDocsPage.test.tsx
git commit -m "feat: group documentation search results"
```

## Task 3: Make The Folder Tree Progressive

**Files:**
- Modify: `apps/frontend/src/pages/InternalDocsPage.tsx`
- Modify: `apps/frontend/src/pages/InternalDocsPage.test.tsx`

- [ ] **Step 1: Add progressive tree test**

Add:

```ts
test('keeps client module folders collapsed until the user expands them', async () => {
  const user = userEvent.setup();
  render(<InternalDocsPage />);

  await screen.findByRole('button', { name: /^Clientes/i });
  expect(screen.queryByRole('button', { name: /020102010/i })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /^Clientes/i }));
  await user.click(screen.getByRole('button', { name: /Magui Dispositivos/i }));
  expect(screen.getByRole('button', { name: /^Módulos/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /020102010/i })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /^Módulos/i }));
  expect(screen.getByRole('button', { name: /020102010/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npm --workspace apps/frontend exec vitest run src/pages/InternalDocsPage.test.tsx --runInBand
```

Expected: FAIL because current `FolderTree` renders all descendants.

- [ ] **Step 3: Add expanded path state**

Inside `InternalDocsPage`, add:

```ts
const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set([CLIENTS_PATH, INTERNAL_PATH]));

function toggleFolderExpanded(path: string) {
  setExpandedPaths((current) => {
    const next = new Set(current);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    return next;
  });
}
```

In breadcrumb and item open handlers, expand ancestors:

```ts
function expandAncestors(path: string) {
  let current = parentPath(path);
  setExpandedPaths((existing) => {
    const next = new Set(existing);
    while (current) {
      next.add(current);
      current = parentPath(current);
    }
    return next;
  });
}
```

- [ ] **Step 4: Replace `FolderTree` props and rendering**

Update `FolderTree` signature:

```tsx
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
          <span>{node.name}</span>
        </button>
      ) : null}
      {(node.path === ROOT_PATH || expanded) ? node.children.map((child) => (
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
```

Call it with:

```tsx
<FolderTree
  node={tree}
  selectedPath={selectedNode.path}
  expandedPaths={expandedPaths}
  onSelect={(path) => {
    setSelectedPath(path);
    expandAncestors(path);
  }}
  onToggle={toggleFolderExpanded}
/>
```

- [ ] **Step 5: Run tree test**

Run:

```bash
npm --workspace apps/frontend exec vitest run src/pages/InternalDocsPage.test.tsx --runInBand
```

Expected: progressive tree test PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/InternalDocsPage.tsx apps/frontend/src/pages/InternalDocsPage.test.tsx
git commit -m "feat: make documentation tree progressive"
```

## Task 4: Add Right Details Panel And Selection

**Files:**
- Modify: `apps/frontend/src/pages/InternalDocsPage.tsx`
- Modify: `apps/frontend/src/pages/InternalDocsPage.test.tsx`

- [ ] **Step 1: Add details panel test**

Add:

```ts
test('shows selected document metadata in the right details panel', async () => {
  const user = userEvent.setup();
  render(<InternalDocsPage />);

  await screen.findByRole('heading', { name: 'Documentação' });
  await user.type(screen.getByRole('searchbox', { name: 'Buscar documentação' }), 'Magui');
  await user.click(screen.getByRole('button', { name: 'Tudo' }));
  await user.click(await screen.findByRole('button', { name: /Treinamento TopSolid'Cam 7 - Fresamento 2D/i }));

  expect(screen.getByRole('heading', { name: 'Detalhes' })).toBeInTheDocument();
  expect(screen.getByText(/Tipo/i)).toBeInTheDocument();
  expect(screen.getByText(/Pesquisa/i)).toBeInTheDocument();
  expect(screen.getByText(/Clientes > Magui Dispositivos de Controle Ltda/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npm --workspace apps/frontend exec vitest run src/pages/InternalDocsPage.test.tsx --runInBand
```

Expected: FAIL because the right panel still only contains action sections.

- [ ] **Step 3: Add panel components**

Below `ResultGroup`, add:

```tsx
function DetailsPanel({
  item,
  selectedNode,
  onPreview,
  onDownload,
  onDelete
}: {
  item: DocsItem | null;
  selectedNode: FolderNode;
  onPreview: (row: InternalDocumentRow) => void;
  onDownload: (row: InternalDocumentRow) => void;
  onDelete: (row: InternalDocumentRow) => void;
}) {
  if (!item) {
    return (
      <section className="docs-details-panel">
        <h2>Detalhes</h2>
        <p className="muted">Selecione uma pasta, pesquisa, certificado ou arquivo para ver detalhes.</p>
        <dl>
          <div><dt>Pasta atual</dt><dd>{selectedNode.name}</dd></div>
          <div><dt>Caminho</dt><dd>{selectedNode.path}</dd></div>
        </dl>
      </section>
    );
  }

  return (
    <section className="docs-details-panel">
      <h2>Detalhes</h2>
      <strong>{item.title}</strong>
      <dl>
        <div><dt>Tipo</dt><dd>{item.kind === 'survey' ? 'Pesquisa' : item.kind === 'certificate' ? 'Certificado' : item.kind === 'folder' ? 'Pasta' : 'Arquivo'}</dd></div>
        <div><dt>Caminho</dt><dd>{item.pathLabel}</dd></div>
        <div><dt>Atualizado</dt><dd>{formatDateBr(item.updatedAt)}</dd></div>
        {item.document ? <div><dt>Arquivo</dt><dd>{item.document.file_name}</dd></div> : null}
        {item.document ? <div><dt>Tamanho</dt><dd>{formatBytes(item.document.file_size_bytes)}</dd></div> : null}
      </dl>
      {item.document ? (
        <div className="docs-details-actions">
          {canPreviewDocument(item.document) ? <button type="button" onClick={() => onPreview(item.document!)}>Visualizar</button> : null}
          <button type="button" onClick={() => onDownload(item.document!)}>Baixar</button>
          <button type="button" onClick={() => onDelete(item.document!)}>Excluir</button>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Replace right aside content**

Change right aside to:

```tsx
<aside className="docs-right-panel" aria-label="Detalhes e ações">
  {panelMode === 'details' ? (
    <DetailsPanel
      item={selectedItem}
      selectedNode={selectedNode}
      onPreview={(row) => void previewInternalDocument(row)}
      onDownload={(row) => void downloadDocument(row)}
      onDelete={(row) => deleteDocument(row)}
    />
  ) : null}
  {panelMode === 'new-folder' ? <NewFolderPanel ... /> : null}
  {panelMode === 'upload' ? <UploadPanel ... /> : null}
</aside>
```

Temporarily keep inline form JSX if `NewFolderPanel` and `UploadPanel` are not extracted until Task 5.

- [ ] **Step 5: Run details test**

Run:

```bash
npm --workspace apps/frontend exec vitest run src/pages/InternalDocsPage.test.tsx --runInBand
```

Expected: details panel test PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/InternalDocsPage.tsx apps/frontend/src/pages/InternalDocsPage.test.tsx
git commit -m "feat: add documentation details panel"
```

## Task 5: Implement `+ Novo` Menu And Right-Panel Forms

**Files:**
- Modify: `apps/frontend/src/pages/InternalDocsPage.tsx`
- Modify: `apps/frontend/src/pages/InternalDocsPage.test.tsx`

- [ ] **Step 1: Add `+ Novo` interaction test**

Add:

```ts
test('opens new folder and upload forms from the Novo menu', async () => {
  const user = userEvent.setup();
  render(<InternalDocsPage />);

  await screen.findByRole('heading', { name: 'Documentação' });
  await user.click(screen.getByRole('button', { name: '+ Novo' }));
  expect(screen.getByRole('menuitem', { name: 'Nova pasta' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Enviar arquivo' })).toBeInTheDocument();

  await user.click(screen.getByRole('menuitem', { name: 'Nova pasta' }));
  expect(screen.getByRole('heading', { name: 'Nova pasta' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Cancelar' }));
  await user.click(screen.getByRole('button', { name: '+ Novo' }));
  await user.click(screen.getByRole('menuitem', { name: 'Enviar arquivo' }));
  expect(screen.getByRole('heading', { name: 'Enviar arquivo' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Add menu state**

Inside `InternalDocsPage`, add:

```ts
const [newMenuOpen, setNewMenuOpen] = useState(false);
```

- [ ] **Step 3: Render `+ Novo` in breadcrumb/topbar**

In the main breadcrumb/header area, add:

```tsx
<div className="docs-new-menu-wrap">
  <button type="button" className="docs-new-button" onClick={() => setNewMenuOpen((current) => !current)}>
    + Novo
  </button>
  {newMenuOpen ? (
    <div className="docs-new-menu" role="menu">
      <button type="button" role="menuitem" onClick={() => { setPanelMode('new-folder'); setNewMenuOpen(false); }}>
        Nova pasta
      </button>
      <button type="button" role="menuitem" onClick={() => { setPanelMode('upload'); setNewMenuOpen(false); }}>
        Enviar arquivo
      </button>
    </div>
  ) : null}
</div>
```

- [ ] **Step 4: Extract `NewFolderPanel`**

Add:

```tsx
function NewFolderPanel({
  value,
  disabled,
  creating,
  onChange,
  onCreate,
  onCancel
}: {
  value: string;
  disabled: boolean;
  creating: boolean;
  onChange: (value: string) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="docs-details-panel">
      <h2>Nova pasta</h2>
      <div className="form form-spacious">
        <label>Nome
          <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Ex.: Contratos" />
        </label>
        <div className="actions actions-compact">
          <button type="button" disabled={creating || disabled} onClick={onCreate}>{creating ? 'Criando...' : 'Criar pasta'}</button>
          <button type="button" onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Extract `UploadPanel`**

Add:

```tsx
function UploadPanel({
  title,
  category,
  notes,
  fileDraft,
  disabled,
  onTitleChange,
  onCategoryChange,
  onNotesChange,
  onPickFile,
  onCreate,
  onCancel
}: {
  title: string;
  category: string;
  notes: string;
  fileDraft: FileDraft;
  disabled: boolean;
  onTitleChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onPickFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="docs-details-panel">
      <h2>Enviar arquivo</h2>
      <div className="form form-spacious">
        <label>Título
          <input value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="Ex.: Checklist de implantação" />
        </label>
        <label>Categoria
          <input value={category} onChange={(event) => onCategoryChange(event.target.value)} placeholder="Ex.: Suporte, Certificados" />
        </label>
        <label>Descrição
          <textarea rows={3} value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Contexto rápido do arquivo." />
        </label>
        <label>Arquivo
          <input type="file" accept="application/pdf,image/*" onChange={onPickFile} />
        </label>
        {fileDraft ? <p className="form-hint">Selecionado: <strong>{fileDraft.file_name}</strong> ({formatBytes(fileDraft.file_size_bytes)})</p> : null}
        <div className="actions actions-compact">
          <button type="button" disabled={disabled} onClick={onCreate}>Salvar na pasta</button>
          <button type="button" onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Wire form success back to details**

After successful `createFolder`, add:

```ts
setPanelMode('details');
```

After successful `createDocument`, add:

```ts
setPanelMode('details');
```

Cancel handlers should do:

```ts
setPanelMode('details');
setNewFolderName('');
setFileDraft(null);
```

- [ ] **Step 7: Run menu test**

Run:

```bash
npm --workspace apps/frontend exec vitest run src/pages/InternalDocsPage.test.tsx --runInBand
```

Expected: `+ Novo` test PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/InternalDocsPage.tsx apps/frontend/src/pages/InternalDocsPage.test.tsx
git commit -m "feat: add documentation new item menu"
```

## Task 6: Polish Desktop And Mobile Styles

**Files:**
- Modify: `apps/frontend/src/styles.css`

- [ ] **Step 1: Replace old action panel styles**

Remove or stop using:

```css
.docs-actions-panel
.docs-actions-toggle
```

Add:

```css
.docs-explorer {
  min-height: calc(100vh - 190px);
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr) minmax(260px, 320px);
  gap: 16px;
  align-items: start;
}

.docs-right-panel {
  min-width: 0;
  position: sticky;
  top: 16px;
}

.docs-details-panel {
  display: grid;
  gap: 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: #ffffff;
  padding: 14px;
  box-shadow: var(--shadow-sm);
}

.docs-details-panel h2 {
  margin: 0;
  font-size: 1rem;
}

.docs-details-panel dl {
  display: grid;
  gap: 10px;
  margin: 0;
}

.docs-details-panel dt {
  color: var(--color-muted);
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
}

.docs-details-panel dd {
  margin: 3px 0 0;
  color: var(--color-text);
  overflow-wrap: anywhere;
}
```

- [ ] **Step 2: Add grouped result styles**

Add:

```css
.docs-search-results {
  display: grid;
  gap: 18px;
}

.docs-result-group {
  display: grid;
  gap: 8px;
}

.docs-result-group > header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-muted);
}

.docs-result-group h3 {
  margin: 0;
  color: var(--color-text);
  font-size: 0.95rem;
}

.docs-result-list {
  display: grid;
  gap: 8px;
}

.docs-result-row {
  min-width: 0;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: #ffffff;
  padding: 10px 12px;
  text-align: left;
}

.docs-result-row:hover,
.docs-result-row.is-selected {
  border-color: #b8c6d2;
  background: #f7fafc;
}
```

- [ ] **Step 3: Add search scope and new menu styles**

Add:

```css
.docs-search-scope {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: #ffffff;
}

.docs-search-scope button {
  min-height: 34px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #526678;
  padding: 0 12px;
}

.docs-search-scope button.is-active {
  background: #172530;
  color: #ffffff;
}

.docs-new-menu-wrap {
  position: relative;
}

.docs-new-button {
  background: #172530;
  color: #ffffff;
}

.docs-new-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 10;
  width: 180px;
  display: grid;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: #ffffff;
  padding: 6px;
  box-shadow: 0 14px 36px rgba(21, 28, 34, 0.16);
}

.docs-new-menu button {
  justify-content: flex-start;
  border: 0;
  background: transparent;
  box-shadow: none;
}
```

- [ ] **Step 4: Add responsive behavior**

Update the existing `@media (max-width: 900px)` docs rules:

```css
@media (max-width: 900px) {
  .docs-explorer {
    grid-template-columns: 1fr;
  }

  .docs-right-panel {
    position: static;
    order: -1;
  }

  .docs-main {
    min-height: 520px;
  }

  .docs-toolbar {
    display: grid;
  }

  .docs-search-scope,
  .docs-new-button {
    width: 100%;
  }
}
```

- [ ] **Step 5: Run CSS-independent checks**

Run:

```bash
npm --workspace apps/frontend run build
```

Expected: PASS with only the existing Vite chunk-size warning.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/styles.css
git commit -m "style: polish documentation explorer layout"
```

## Task 7: Preserve Preview, Download, Survey, And Folder Behavior

**Files:**
- Modify: `apps/frontend/src/pages/InternalDocsPage.test.tsx`
- Modify: `apps/frontend/src/pages/InternalDocsPage.tsx`

- [ ] **Step 1: Update existing preview/download tests to new UI labels**

Change the navigation in the existing tests from clicking the old `Certificados` folder card to using global search:

```ts
await user.type(screen.getByRole('searchbox', { name: 'Buscar documentação' }), 'Certificado');
await user.click(screen.getByRole('button', { name: 'Tudo' }));
await user.click(await screen.findByRole('button', { name: /Certificado - Holand/i }));
await user.click(screen.getByRole('button', { name: 'Baixar' }));
```

For preview:

```ts
await user.type(screen.getByRole('searchbox', { name: 'Buscar documentação' }), 'Certificado');
await user.click(screen.getByRole('button', { name: 'Tudo' }));
await user.click(await screen.findByRole('button', { name: /Certificado - Holand/i }));
await user.click(screen.getByRole('button', { name: 'Visualizar' }));
```

- [ ] **Step 2: Add certificate survey preview test**

Mock the fifth fetch response as HTML or JSON:

```ts
vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
  document_key: 'PESQUISA_CERTIFICADO:comp-magui:coh-1:mod-cam',
  company_name: 'Magui Dispositivos de Controle Ltda',
  cohort: 'TUR-008 · TopSolid CAM 2D',
  module_name: "Treinamento TopSolid'Cam 7 - Fresamento 2D",
  respondent_name: 'Cleberson',
  submitted_at: '2026-05-08T16:52:51.840Z',
  answers: { q1: 5 }
}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
```

Test:

```ts
test('opens certificate satisfaction survey as a formatted report', async () => {
  const user = userEvent.setup();
  render(<InternalDocsPage />);

  await user.type(await screen.findByRole('searchbox', { name: 'Buscar documentação' }), 'Fresamento');
  await user.click(screen.getByRole('button', { name: 'Tudo' }));
  await user.click(await screen.findByRole('button', { name: /Treinamento TopSolid'Cam 7 - Fresamento 2D/i }));
  await user.click(screen.getByRole('button', { name: /Visualizar/i }));

  expect(await screen.findByRole('dialog', { name: /Pesquisa/i })).toBeInTheDocument();
  expect(screen.getByText(/O instrutor demonstrou domínio técnico/i)).toBeInTheDocument();
  expect(screen.getByText('5')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm --workspace apps/frontend exec vitest run src/pages/InternalDocsPage.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 4: Run frontend build**

Run:

```bash
npm --workspace apps/frontend run build
```

Expected: PASS with only existing chunk-size warning.

- [ ] **Step 5: Run Docker frontend build**

Run:

```bash
DOCKER_BUILDKIT=1 docker build --progress=plain -f apps/frontend/Dockerfile .
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/InternalDocsPage.tsx apps/frontend/src/pages/InternalDocsPage.test.tsx
git commit -m "test: verify documentation explorer workflows"
```

## Task 8: Final Manual Browser Verification

**Files:**
- No source changes unless verification finds a bug.

- [ ] **Step 1: Start local app**

Run:

```bash
npm --workspace apps/frontend run dev
```

Expected: Vite serves the frontend on `http://localhost:5173`.

- [ ] **Step 2: Open documentation page**

Open `http://localhost:5173/documentacao` in the browser with an internal session.

Expected:

- Three-pane desktop layout.
- Progressive folder tree.
- Right details panel visible.
- `+ Novo` visible.

- [ ] **Step 3: Verify search behavior**

Search `satis`.

Expected:

- Results grouped by `Pastas`, `Pesquisas`, `Certificados`, `Arquivos`.
- Each result shows context path.
- `Nesta pasta` limits scope.
- `Tudo` searches both `Clientes` and `Interna`.

- [ ] **Step 4: Verify actions**

Select a certificate and click `Visualizar`.

Expected: preview modal opens with authenticated document fetch.

Select a certificate survey and click `Visualizar`.

Expected: formatted survey report opens; JSON is not shown raw.

Click `+ Novo > Nova pasta`.

Expected: right panel shows folder form.

Click `+ Novo > Enviar arquivo`.

Expected: right panel shows upload form.

- [ ] **Step 5: Stop local server**

Stop Vite with `Ctrl+C`.

- [ ] **Step 6: Final commit if manual fixes were required**

If manual verification required fixes:

```bash
git add apps/frontend/src/pages/InternalDocsPage.tsx apps/frontend/src/pages/InternalDocsPage.test.tsx apps/frontend/src/styles.css
git commit -m "fix: refine documentation explorer verification issues"
```

If no fixes were required, do not create an empty commit.

## Self-Review

Spec coverage:

- Progressive tree is covered in Task 3.
- `Nesta pasta` and `Tudo` search scope is covered in Tasks 1 and 2.
- Grouped results are covered in Tasks 1 and 2.
- Right details panel is covered in Task 4.
- `+ Novo` menu and forms are covered in Task 5.
- Desktop/mobile styling is covered in Task 6.
- Survey/certificate behavior is covered in Task 7.
- Manual visual verification is covered in Task 8.

Placeholder scan:

- No `TBD`, `TODO`, or open-ended placeholder tasks remain.

Type consistency:

- `SearchScope`, `DocsPanelMode`, `DocsItemKind`, `DocsItem`, and `GroupedDocsResults` are introduced before use.
- `openDocsItem`, `selectDocsItem`, `ResultGroup`, `DetailsPanel`, `NewFolderPanel`, and `UploadPanel` are defined before the tasks require their usage.

