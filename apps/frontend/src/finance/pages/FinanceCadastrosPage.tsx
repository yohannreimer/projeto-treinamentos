import { useEffect, useMemo, useState } from 'react';
import {
  financeApi,
  type FinanceCatalogSnapshot,
  type FinanceEntity,
  type FinanceEntityKind
} from '../api';
import { FinanceEntityForm } from '../components/FinanceEntityForm';

type EntityFilter = 'all' | 'customer' | 'supplier';

const filterTabs: Array<{ value: EntityFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'customer', label: 'Clientes' },
  { value: 'supplier', label: 'Fornecedores' }
];

const catalogBlocks = [
  {
    key: 'accounts',
    title: 'Contas financeiras',
    copy: 'Caixa, bancos e carteiras que sustentam a liquidez operacional.'
  },
  {
    key: 'categories',
    title: 'Categorias',
    copy: 'Classificação gerencial para receitas, despesas e neutralidades.'
  },
  {
    key: 'cost_centers',
    title: 'Centros de custo',
    copy: 'Dimensão analítica para leitura interna e segmentação de gastos.'
  },
  {
    key: 'payment_methods',
    title: 'Formas de pagamento',
    copy: 'Regras de cobrança e liquidação como PIX, boleto, cartão e transferência.'
  }
] as const;

function normalizeEntityKindFilter(entityKind: FinanceEntityKind, filter: EntityFilter) {
  if (filter === 'all') return true;
  if (filter === 'customer') return entityKind === 'customer' || entityKind === 'both';
  return entityKind === 'supplier' || entityKind === 'both';
}

function entityKindLabel(kind: FinanceEntityKind) {
  if (kind === 'customer') return 'Cliente';
  if (kind === 'supplier') return 'Fornecedor';
  return 'Ambos';
}

function formatCatalogPreview(items: Array<{ name: string; kind?: string }>) {
  if (items.length === 0) {
    return 'Sem registros ainda.';
  }

  const preview = items.slice(0, 3).map((item) => item.name).join(' · ');
  return items.length > 3 ? `${preview} · +${items.length - 3}` : preview;
}

export function FinanceCadastrosPage() {
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [entities, setEntities] = useState<FinanceEntity[]>([]);
  const [catalog, setCatalog] = useState<FinanceCatalogSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    Promise.allSettled([financeApi.listEntities(), financeApi.getCatalogSnapshot()])
      .then(([entityResult, catalogResult]) => {
        if (cancelled) return;

        if (entityResult.status === 'fulfilled') {
          setEntities(entityResult.value);
        } else {
          setEntities([]);
        }

        if (catalogResult.status === 'fulfilled') {
          setCatalog(catalogResult.value);
        }

        if (entityResult.status === 'rejected') {
          setError(entityResult.reason instanceof Error ? entityResult.reason.message : 'Falha ao carregar as entidades.');
          return;
        }

        if (catalogResult.status === 'rejected') {
          setCatalog(null);
          setError(catalogResult.reason instanceof Error ? catalogResult.reason.message : 'Falha ao carregar o catálogo financeiro.');
          return;
        }

        setError(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredEntities = useMemo(
    () => entities.filter((entity) => normalizeEntityKindFilter(entity.kind, entityFilter)),
    [entities, entityFilter]
  );

  async function handleCreateEntity(payload: Parameters<typeof financeApi.createEntity>[0]) {
    const created = await financeApi.createEntity(payload);
    setEntities((current) => [created, ...current]);
  }

  const catalogSummary = catalog
    ? {
        accounts: catalog.accounts.length,
        categories: catalog.categories.length,
        cost_centers: catalog.cost_centers.length,
        payment_methods: catalog.payment_methods.length
      }
    : null;

  return (
    <section className="page finance-page">
      <header className="page-header">
        <div className="page-header-copy">
          <small style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Cadastros
          </small>
          <h1>Cadastros híbridos</h1>
          <p>Base única para clientes e fornecedores, com catálogos separados para suportar o ERP financeiro.</p>
        </div>
      </header>

      {error ? (
        <div className="panel" aria-live="polite">
          <div className="panel-content">
            <p role="alert">{error}</p>
          </div>
        </div>
      ) : null}

      <div className="panel" aria-label="Filtros de entidades">
        <div className="panel-header">
          <div>
            <small className="finance-panel-eyebrow">Base única</small>
            <h2>Filtro de leitura</h2>
          </div>
        </div>
        <div className="panel-content">
          <div role="tablist" aria-label="Filtrar entidades" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {filterTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={entityFilter === tab.value}
                onClick={() => setEntityFilter(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <p style={{ marginTop: '0.85rem' }}>
            {loading ? 'Carregando a base única...' : `${filteredEntities.length} entidade(s) exibida(s) de ${entities.length}.`}
          </p>
        </div>
      </div>

      <div className="finance-cadastros-grid" style={{ display: 'grid', gap: '1rem' }}>
        <div className="panel">
          <FinanceEntityForm onSubmit={handleCreateEntity} />
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <small className="finance-panel-eyebrow">Leitura operacional</small>
              <h2>Entidades cadastradas</h2>
            </div>
          </div>
          <div className="panel-content">
            {filteredEntities.length === 0 ? (
              <p>{loading ? 'Carregando entidades...' : 'Nenhuma entidade encontrada para este filtro.'}</p>
            ) : (
              <table aria-label="Entidades financeiras">
                <thead>
                  <tr>
                    <th>Razão social</th>
                    <th>Fantasia</th>
                    <th>Tipo</th>
                    <th>Documento</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntities.map((entity) => (
                    <tr key={entity.id}>
                      <td>{entity.legal_name}</td>
                      <td>{entity.trade_name || '—'}</td>
                      <td>{entityKindLabel(entity.kind)}</td>
                      <td>{entity.document_number || '—'}</td>
                      <td>{entity.is_active ? 'Ativa' : 'Inativa'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <small className="finance-panel-eyebrow">Catálogo financeiro</small>
              <h2>Contas, categorias e referências</h2>
            </div>
          </div>
          <div className="panel-content">
            <div className="finance-report-list">
              {catalogBlocks.map((block) => {
                const items = catalog?.[block.key] ?? [];
                const count = catalogSummary?.[block.key] ?? 0;
                return (
                  <article key={block.key} className="finance-report-card">
                    <small>{count} registro(s)</small>
                    <strong>{block.title}</strong>
                    <p>{block.copy}</p>
                    <p>{formatCatalogPreview(items as Array<{ name: string }>)}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
