import { useEffect, useMemo, useState } from 'react';
import {
  financeApi,
  type FinanceCatalogSnapshot,
  type FinanceEntity,
  type FinanceEntityKind
} from '../api';
import { FinanceEntityForm } from '../components/FinanceEntityForm';
import { FinanceEmptyState, FinanceErrorState, FinanceLoadingState, FinanceMono, FinancePageHeader, FinancePanel, FinanceTableShell } from '../components/FinancePrimitives';

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
      <FinancePageHeader
        eyebrow="Cadastros"
        title="Cadastros híbridos"
        description="Base única para clientes e fornecedores, com catálogos separados para suportar o ERP financeiro."
      />

      {error ? (
        <FinanceErrorState title="Falha ao carregar cadastros." description={error} />
      ) : null}

      <FinancePanel title="Filtro de leitura" eyebrow="Base única" ariaLabel="Filtros de entidades">
          <div role="tablist" aria-label="Filtrar entidades" className="finance-cadastros-tabs">
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
          <p className="finance-cadastros-summary">
            {loading ? 'Carregando a base única...' : `${filteredEntities.length} entidade(s) exibida(s) de ${entities.length}.`}
          </p>
      </FinancePanel>

      <div className="finance-cadastros-grid">
        <div className="finance-cadastros-form-shell">
          <FinanceEntityForm onSubmit={handleCreateEntity} />
        </div>

        <FinanceTableShell title="Entidades cadastradas" description="Leitura operacional da base única de clientes e fornecedores.">
          {loading ? (
            <FinanceLoadingState title="Carregando entidades..." />
          ) : filteredEntities.length === 0 ? (
            <FinanceEmptyState title="Nenhuma entidade encontrada para este filtro." />
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
                    <td><strong>{entity.legal_name}</strong></td>
                    <td>{entity.trade_name || '—'}</td>
                    <td>{entityKindLabel(entity.kind)}</td>
                    <td><FinanceMono>{entity.document_number || '—'}</FinanceMono></td>
                    <td>{entity.is_active ? 'Ativa' : 'Inativa'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </FinanceTableShell>

        <FinancePanel title="Contas, categorias e referências" eyebrow="Catálogo financeiro" ariaLabel="Catálogo financeiro">
          <div className="finance-report-list">
            {catalogBlocks.map((block) => {
              const items = catalog?.[block.key] ?? [];
              const count = catalogSummary?.[block.key] ?? 0;
              return (
                <article key={block.key} className="finance-report-card">
                  <small><FinanceMono>{count}</FinanceMono> registro(s)</small>
                  <strong>{block.title}</strong>
                  <p>{block.copy}</p>
                  <p>{formatCatalogPreview(items as Array<{ name: string }>)}</p>
                </article>
              );
            })}
          </div>
        </FinancePanel>
      </div>
    </section>
  );
}
