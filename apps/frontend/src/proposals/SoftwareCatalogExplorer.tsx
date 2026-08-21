import { useEffect, useMemo, useRef, useState } from 'react';

import { formatUsdCurrency } from './proposalMath';
import {
  buildCatalogTree,
  displayCatalogFamily,
  displayCatalogSubfamily,
  groupSoftwareCatalogResults,
  querySoftwareCatalog,
  SOFTWARE_CATALOG_PAGE_SIZE,
  type SoftwareCatalogEntry,
} from './softwareCatalog';

type SoftwareCatalogExplorerProps = {
  products: SoftwareCatalogEntry[];
  selectedIds: ReadonlySet<string>;
  softwareSubtotalUsd: number;
  adminDisabled: boolean;
  onToggle: (id: string) => void;
  onNewProduct: () => void;
  onEditProduct: (product: SoftwareCatalogEntry) => void;
  onDone: () => void;
};

export function SoftwareCatalogExplorer({
  products,
  selectedIds,
  softwareSubtotalUsd,
  adminDisabled,
  onToggle,
  onNewProduct,
  onEditProduct,
  onDone,
}: SoftwareCatalogExplorerProps) {
  const tree = useMemo(() => buildCatalogTree(products), [products]);
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState(() => tree[0]?.name ?? '');
  const [subfamily, setSubfamily] = useState('Todos');
  const [folder, setFolder] = useState('Todos');
  const [limit, setLimit] = useState(SOFTWARE_CATALOG_PAGE_SIZE);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!tree.some((item) => item.name === family)) {
      setFamily(tree[0]?.name ?? '');
      setSubfamily('Todos');
      setFolder('Todos');
    }
  }, [family, tree]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onDone();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDone]);

  const selectedFamily = tree.find((item) => item.name === family);
  const selectedSubfamily = selectedFamily?.subfamilies.find((item) => item.name === subfamily);
  const result = useMemo(
    () => querySoftwareCatalog(products, { query, family, subfamily, folder, limit }),
    [family, folder, limit, products, query, subfamily],
  );
  const resultGroups = useMemo(() => groupSoftwareCatalogResults(result.items), [result.items]);
  const resultFamilies = useMemo(() => {
    const families = new Map<string, typeof resultGroups>();
    for (const group of resultGroups) {
      const groups = families.get(group.family) ?? [];
      groups.push(group);
      families.set(group.family, groups);
    }
    return [...families.entries()];
  }, [resultGroups]);

  function updateQuery(value: string) {
    setQuery(value);
    setLimit(SOFTWARE_CATALOG_PAGE_SIZE);
  }

  function chooseFamily(value: string) {
    setQuery('');
    setFamily(value);
    setSubfamily('Todos');
    setFolder('Todos');
    setLimit(SOFTWARE_CATALOG_PAGE_SIZE);
  }

  function chooseSubfamily(value: string) {
    setQuery('');
    setSubfamily(value);
    setFolder('Todos');
    setLimit(SOFTWARE_CATALOG_PAGE_SIZE);
  }

  function chooseFolder(value: string) {
    setQuery('');
    setFolder(value);
    setLimit(SOFTWARE_CATALOG_PAGE_SIZE);
  }

  const resultPath = query
    ? 'Todo o catálogo'
    : [displayCatalogFamily(family), subfamily === 'Todos' ? '' : displayCatalogSubfamily(family, subfamily), folder === 'Todos' ? '' : folder]
      .filter(Boolean)
      .join(' / ');

  function renderProduct(product: SoftwareCatalogEntry) {
    const isSelected = selectedIds.has(product.id);
    return (
      <article key={product.id} className={`proposal-catalog-product${isSelected ? ' is-selected' : ''}`}>
        <div className="proposal-catalog-product-copy">
          <div className="proposal-catalog-product-title">
            <strong>{product.name}</strong>
            {product.catalog?.reviewStatus === 'REVISAR' ? <span>REVISAR</span> : null}
          </div>
          <p>{product.description}</p>
          <small>{product.path.map((part, index) => index === 0 ? displayCatalogFamily(part) : index === 1 ? displayCatalogSubfamily(product.path[0], part) : part).join(' / ')}</small>
        </div>
        <div className="proposal-catalog-product-action">
          <strong>US$ {formatUsdCurrency(product.unitValueUsd)}</strong>
          <div>
            <button
              type="button"
              className="proposal-catalog-product-menu"
              aria-label={`Editar ${product.name}`}
              disabled={adminDisabled}
              onClick={() => onEditProduct(product)}
            >
              ⋯
            </button>
            <button
              type="button"
              aria-label={`${isSelected ? 'Remover' : 'Adicionar'} ${product.name}`}
              aria-pressed={isSelected}
              onClick={() => onToggle(product.id)}
            >
              {isSelected ? 'Adicionado ✓' : '+ Adicionar'}
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <section className="proposal-catalog" aria-label="Catálogo de software">
      <header className="proposal-catalog-header">
        <button type="button" className="proposal-catalog-back" onClick={onDone} aria-label="Voltar para a proposta">
          ←
        </button>
        <div>
          <span>Software</span>
          <h2>Adicionar software</h2>
        </div>
        <button
          type="button"
          className="proposal-catalog-new-product"
          aria-label="Novo produto"
          disabled={adminDisabled}
          onClick={onNewProduct}
        >
          + Novo produto
        </button>
        <label className="proposal-catalog-search">
          <span>Buscar software</span>
          <input
            ref={searchRef}
            type="search"
            aria-label="Buscar software"
            placeholder="Nome, módulo, código ou descrição…"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
          />
        </label>
      </header>

      <nav className="proposal-catalog-families" aria-label="Famílias de software">
        {tree.map((item) => (
          <button
            key={item.name}
            type="button"
            aria-label={`${displayCatalogFamily(item.name)}, ${item.count} produtos`}
            aria-pressed={!query && family === item.name}
            onClick={() => chooseFamily(item.name)}
          >
            <strong>{displayCatalogFamily(item.name)}</strong>
            <small>{item.count}</small>
          </button>
        ))}
      </nav>

      <div className="proposal-catalog-body">
        <nav className="proposal-catalog-subfamilies" aria-label={`Subfamílias de ${displayCatalogFamily(family)}`}>
          <button
            type="button"
            aria-label={`Todos, ${selectedFamily?.count ?? 0} produtos`}
            aria-pressed={!query && subfamily === 'Todos'}
            onClick={() => chooseSubfamily('Todos')}
          >
            <span>Todos</span><small>{selectedFamily?.count ?? 0}</small>
          </button>
          {selectedFamily?.subfamilies.map((item) => (
            <button
              key={item.name}
              type="button"
              aria-label={`${displayCatalogSubfamily(family, item.name)}, ${item.count} produtos`}
              aria-pressed={!query && subfamily === item.name}
              onClick={() => chooseSubfamily(item.name)}
            >
              <span>{displayCatalogSubfamily(family, item.name)}</span><small>{item.count}</small>
            </button>
          ))}
        </nav>

        <div className="proposal-catalog-results">
          <div className="proposal-catalog-results-header">
            <div>
              <span>Software / {resultPath}</span>
              <h3>{query ? `Resultados para “${query}”` : subfamily === 'Todos' ? displayCatalogFamily(family) : displayCatalogSubfamily(family, subfamily)}</h3>
            </div>
            <span role="status">{result.total} {result.total === 1 ? 'produto' : 'produtos'}</span>
          </div>

          {!query && selectedSubfamily && selectedSubfamily.folders.length > 1 ? (
            <nav className="proposal-catalog-folders" aria-label="Pastas de produtos">
              <button type="button" aria-pressed={folder === 'Todos'} onClick={() => chooseFolder('Todos')}>Todos</button>
              {selectedSubfamily.folders.map((item) => (
                <button key={item.name} type="button" aria-pressed={folder === item.name} onClick={() => chooseFolder(item.name)}>
                  {item.name} · {item.count}
                </button>
              ))}
            </nav>
          ) : null}

          {query ? (
            <div className="proposal-catalog-search-groups" data-testid="catalog-search-groups">
              {resultFamilies.map(([familyName, groups]) => (
                <section className="proposal-catalog-result-family-group" key={familyName}>
                  <h4 className="proposal-catalog-result-family">{displayCatalogFamily(familyName)}</h4>
                  {groups.map((group) => (
                    <section className="proposal-catalog-result-group" key={`${group.family}:${group.subfamily}`}>
                      <h5 className="proposal-catalog-result-subfamily">
                        {displayCatalogSubfamily(group.family, group.subfamily)}
                      </h5>
                      <div className="proposal-catalog-product-list">
                        {group.items.map(renderProduct)}
                      </div>
                    </section>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <div className="proposal-catalog-product-list">
              {result.items.map(renderProduct)}
            </div>
          )}

          {result.items.length === 0 ? <p className="proposal-catalog-empty">Nenhum software encontrado.</p> : null}
          {result.hasMore ? (
            <button type="button" className="proposal-catalog-more" onClick={() => setLimit((value) => value + SOFTWARE_CATALOG_PAGE_SIZE)}>
              Mostrar mais {Math.min(SOFTWARE_CATALOG_PAGE_SIZE, result.total - result.items.length)} de {result.total - result.items.length} restantes
            </button>
          ) : null}
        </div>
      </div>

      <footer className="proposal-catalog-footer">
        <div aria-live="polite">
          <strong>{selectedIds.size} {selectedIds.size === 1 ? 'produto selecionado' : 'produtos selecionados'}</strong>
          <span>US$ {formatUsdCurrency(softwareSubtotalUsd)}</span>
        </div>
        <button type="button" onClick={onDone}>Concluir seleção</button>
      </footer>
    </section>
  );
}
