import { useEffect, useMemo, useState } from 'react';
import {
  financeApi,
  type FinanceSimulationDetail,
  type FinanceSimulationItem,
  type FinanceSimulationItemKind,
  type FinanceSimulationScenario,
  type FinanceSimulationSource,
  type FinanceSimulationSources,
  type FinanceSimulationTimelinePoint
} from '../api';
import { FinanceEmptyState, FinanceErrorState, FinanceLoadingState, FinanceMono, FinancePageHeader } from '../components/FinancePrimitives';

const itemKindOptions: Array<{ value: FinanceSimulationItemKind; label: string; tone: 'inflow' | 'outflow' }> = [
  { value: 'manual_inflow', label: 'Entrada livre', tone: 'inflow' },
  { value: 'expected_inflow', label: 'Entrada prevista', tone: 'inflow' },
  { value: 'manual_outflow', label: 'Saída livre', tone: 'outflow' },
  { value: 'scheduled_outflow', label: 'Pagamento planejado', tone: 'outflow' },
  { value: 'partial_payment', label: 'Pagamento parcial', tone: 'outflow' }
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function offsetDate(baseDate: string, days: number) {
  const value = new Date(`${baseDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(dateIso?: string | null): string {
  if (!dateIso) return '-';
  const [year, month, day] = dateIso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function formatDateShort(dateIso: string) {
  const [day, month] = formatDate(dateIso).split('/');
  return `${day}/${month}`;
}

function parseCurrencyToCents(raw: string): number {
  const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function centsToInput(cents: number) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function itemKindLabel(kind: FinanceSimulationItemKind) {
  return itemKindOptions.find((option) => option.value === kind)?.label ?? 'Bloco';
}

function itemKindTone(kind: FinanceSimulationItemKind) {
  return itemKindOptions.find((option) => option.value === kind)?.tone ?? 'inflow';
}

function netLabel(cents: number) {
  return `${cents >= 0 ? '+' : ''}${formatCurrency(cents)}`;
}

function sourceToPayload(source: FinanceSimulationSource, eventDate?: string) {
  return {
    source_type: source.source_type === 'balance' ? 'manual' as const : source.source_type,
    source_id: source.source_id,
    kind: source.kind === 'starting_balance' ? 'manual_inflow' as const : source.kind,
    label: source.label,
    amount_cents: source.amount_cents,
    event_date: eventDate ?? source.event_date,
    probability_percent: 100,
    note: source.detail
  };
}

function groupItemsByDate(items: FinanceSimulationItem[]) {
  return items.reduce<Record<string, FinanceSimulationItem[]>>((accumulator, item) => {
    accumulator[item.event_date] = [...(accumulator[item.event_date] ?? []), item];
    return accumulator;
  }, {});
}

type EditableItemForm = {
  kind: FinanceSimulationItemKind;
  label: string;
  amount: string;
  event_date: string;
  probability_percent: string;
  note: string;
};

type SourceView = 'all' | 'inflow' | 'outflow' | 'recurring' | 'overdue';

function editableFormFromItem(item: FinanceSimulationItem): EditableItemForm {
  return {
    kind: item.kind,
    label: item.label,
    amount: centsToInput(item.amount_cents),
    event_date: item.event_date,
    probability_percent: String(item.probability_percent),
    note: item.note ?? ''
  };
}

export function FinanceSimulationPage() {
  const initialStart = todayIso();
  const [scenarios, setScenarios] = useState<FinanceSimulationScenario[]>([]);
  const [selected, setSelected] = useState<FinanceSimulationDetail | null>(null);
  const [sources, setSources] = useState<FinanceSimulationSources | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [draggingSourceId, setDraggingSourceId] = useState('');
  const [activeDropTarget, setActiveDropTarget] = useState('');
  const [editingItemId, setEditingItemId] = useState('');
  const [editForm, setEditForm] = useState<EditableItemForm | null>(null);
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceForm, setBalanceForm] = useState('');
  const [sourceView, setSourceView] = useState<SourceView>('all');
  const [sourceSearch, setSourceSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [scenarioForm, setScenarioForm] = useState({
    name: 'Cenário de caixa da semana',
    description: 'Mesa para testar entradas, pagamentos e negociações.',
    start_date: initialStart,
    end_date: offsetDate(initialStart, 90),
    starting_balance: '100.000,00'
  });
  const [itemForm, setItemForm] = useState({
    kind: 'expected_inflow' as FinanceSimulationItemKind,
    label: 'Entrada prevista',
    amount: '20.000,00',
    event_date: offsetDate(initialStart, 2),
    probability_percent: '100',
    note: ''
  });

  async function refreshSources(scenarioId: string | null) {
    setSources(await financeApi.listSimulationSources(scenarioId));
  }

  async function loadSimulations(preferredId?: string | null) {
    setLoading(true);
    setError('');
    try {
      const list = await financeApi.listSimulations();
      setScenarios(list.scenarios);
      const nextId = preferredId ?? selected?.id ?? list.scenarios[0]?.id ?? null;
      if (nextId) {
        const detail = await financeApi.getSimulation(nextId);
        setSelected(detail);
        setShowCreateForm(false);
        await refreshSources(detail.id);
      } else {
        setSelected(null);
        setShowCreateForm(true);
        await refreshSources(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar simulações.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSimulations();
  }, []);

  async function runDetailAction(key: string, action: () => Promise<FinanceSimulationDetail>, success: string) {
    setBusyKey(key);
    setError('');
    setMessage('');
    try {
      const detail = await action();
      setSelected(detail);
      setMessage(success);
      const list = await financeApi.listSimulations();
      setScenarios(list.scenarios);
      await refreshSources(detail.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Falha ao executar simulação.');
    } finally {
      setBusyKey('');
    }
  }

  function createScenario() {
    return runDetailAction('scenario', () => financeApi.createSimulation({
      name: scenarioForm.name,
      description: scenarioForm.description,
      start_date: scenarioForm.start_date,
      end_date: scenarioForm.end_date,
      starting_balance_cents: parseCurrencyToCents(scenarioForm.starting_balance)
    }), 'Cenário criado para simulação.').then(() => setShowCreateForm(false));
  }

  function addManualItem(eventDate?: string) {
    if (!selected) return Promise.resolve();
    return runDetailAction('item', () => financeApi.createSimulationItem(selected.id, {
      kind: itemForm.kind,
      label: itemForm.label,
      amount_cents: parseCurrencyToCents(itemForm.amount),
      event_date: eventDate ?? itemForm.event_date,
      probability_percent: Number(itemForm.probability_percent) || 100,
      note: itemForm.note.trim() || null
    }), 'Bloco manual adicionado ao cenário.');
  }

  function addSource(source: FinanceSimulationSource, eventDate?: string) {
    if (!selected) return Promise.resolve();
    if (source.kind === 'starting_balance') {
      return runDetailAction('balance', () => financeApi.updateSimulation(selected.id, {
        starting_balance_cents: source.amount_cents
      }), 'Saldo atual aplicado como saldo inicial.');
    }
    return runDetailAction(`source-${source.id}`, () => financeApi.createSimulationItem(selected.id, sourceToPayload(source, eventDate)), 'Bloco puxado do financeiro.');
  }

  function updateItem(item: FinanceSimulationItem) {
    if (!selected || !editForm) return Promise.resolve();
    return runDetailAction(`edit-${item.id}`, () => financeApi.updateSimulationItem(selected.id, item.id, {
      kind: editForm.kind,
      label: editForm.label,
      amount_cents: parseCurrencyToCents(editForm.amount),
      event_date: editForm.event_date,
      probability_percent: Number(editForm.probability_percent) || 100,
      note: editForm.note.trim() || null
    }), 'Bloco atualizado.').then(() => {
      setEditingItemId('');
      setEditForm(null);
    });
  }

  function updateStartingBalance() {
    if (!selected) return Promise.resolve();
    return runDetailAction('balance-edit', () => financeApi.updateSimulation(selected.id, {
      starting_balance_cents: parseCurrencyToCents(balanceForm)
    }), 'Saldo inicial atualizado.').then(() => {
      setEditingBalance(false);
      setBalanceForm('');
    });
  }

  function deleteItem(item: FinanceSimulationItem) {
    if (!selected) return Promise.resolve();
    return runDetailAction(`delete-item-${item.id}`, () => financeApi.deleteSimulationItem(selected.id, item.id), 'Bloco removido do cenário.');
  }

  function duplicateScenario() {
    if (!selected) return Promise.resolve();
    return runDetailAction('duplicate', () => financeApi.duplicateSimulation(selected.id), 'Cenário duplicado para nova comparação.');
  }

  async function deleteScenario() {
    if (!selected) return;
    if (!window.confirm(`Excluir o cenário "${selected.name}"? Essa ação remove apenas a simulação, não mexe nos lançamentos reais.`)) return;
    setBusyKey('delete-scenario');
    setError('');
    setMessage('');
    try {
      await financeApi.deleteSimulation(selected.id);
      setMessage('Cenário excluído.');
      setSelected(null);
      await loadSimulations(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Falha ao excluir cenário.');
    } finally {
      setBusyKey('');
    }
  }

  const itemsByDate = useMemo(() => groupItemsByDate(selected?.items ?? []), [selected]);
  const availableSources = sources?.sources ?? [];
  const draggingSource = availableSources.find((source) => source.id === draggingSourceId) ?? null;
  const editingItem = selected?.items.find((item) => item.id === editingItemId) ?? null;
  const normalizedSourceSearch = sourceSearch.trim().toLowerCase();
  const filteredSources = availableSources.filter((source) => {
    const matchesView = sourceView === 'all'
      || (sourceView === 'inflow' && source.tone === 'inflow')
      || (sourceView === 'outflow' && source.tone === 'outflow')
      || (sourceView === 'recurring' && source.cadence === 'recurring')
      || (sourceView === 'overdue' && source.detail.toLowerCase().includes('overdue'));
    const matchesSearch = !normalizedSourceSearch
      || source.label.toLowerCase().includes(normalizedSourceSearch)
      || source.detail.toLowerCase().includes(normalizedSourceSearch);
    return matchesView && matchesSearch;
  });
  const impactPoints = useMemo(() => (
    selected?.result.timeline.filter((point) => (itemsByDate[point.date]?.length ?? 0) > 0) ?? []
  ), [itemsByDate, selected]);
  const startingPoint = selected?.result.timeline[0] ?? null;
  const endingPoint = selected?.result.timeline[selected.result.timeline.length - 1] ?? null;

  function markDropTarget(target: string) {
    if (draggingSource) setActiveDropTarget(target);
  }

  function clearDropTarget() {
    setActiveDropTarget('');
  }

  function renderScenarioForm() {
    return (
      <section className="finance-panel finance-simulation-panel">
        <div className="finance-panel__header">
          <div className="finance-panel__header-copy">
            <small>Novo cenário</small>
            <h2>Criar mesa</h2>
          </div>
        </div>
        <div className="finance-panel__content finance-simulation-form">
          <label><span>Nome</span><input value={scenarioForm.name} onChange={(event) => setScenarioForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label><span>Descrição</span><input value={scenarioForm.description} onChange={(event) => setScenarioForm((current) => ({ ...current, description: event.target.value }))} /></label>
          <div className="finance-simulation-form__row">
            <label><span>Início</span><input type="date" value={scenarioForm.start_date} onChange={(event) => setScenarioForm((current) => ({ ...current, start_date: event.target.value }))} /></label>
            <label><span>Fim</span><input type="date" value={scenarioForm.end_date} onChange={(event) => setScenarioForm((current) => ({ ...current, end_date: event.target.value }))} /></label>
          </div>
          <label><span>Saldo inicial</span><input aria-label="Saldo inicial da simulação" value={scenarioForm.starting_balance} onChange={(event) => setScenarioForm((current) => ({ ...current, starting_balance: event.target.value }))} /></label>
          <button type="button" className="finance-advanced-button finance-advanced-button--primary" onClick={() => { void createScenario(); }} disabled={busyKey === 'scenario'}>
            {busyKey === 'scenario' ? 'Criando...' : 'Criar cenário'}
          </button>
        </div>
      </section>
    );
  }

  function renderSourceLibrary() {
    return (
      <section className="finance-panel finance-simulation-panel">
        <div className="finance-panel__header">
          <div className="finance-panel__header-copy">
            <small>Biblioteca</small>
            <h2>Fontes do financeiro</h2>
            <p>Clique para adicionar na data original ou arraste para a esteira.</p>
          </div>
        </div>
        <div className="finance-panel__content finance-simulation-source-library">
          {sources?.balance ? (
            <article className="finance-simulation-source finance-simulation-source--balance">
              <div>
                <strong>{sources.balance.label}</strong>
                <span>{sources.balance.detail}</span>
              </div>
              <FinanceMono>{formatCurrency(sources.balance.amount_cents)}</FinanceMono>
              <button type="button" className="finance-advanced-button" onClick={() => { void addSource(sources.balance); }}>Usar saldo</button>
            </article>
          ) : null}

          <div className="finance-simulation-manual">
            <small>Bloco manual rápido</small>
            <label><span>Tipo do movimento</span><select value={itemForm.kind} onChange={(event) => setItemForm((current) => ({ ...current, kind: event.target.value as FinanceSimulationItemKind }))}>
                {itemKindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select></label>
            <label><span>Título do bloco</span><input aria-label="Descrição do bloco manual" value={itemForm.label} onChange={(event) => setItemForm((current) => ({ ...current, label: event.target.value }))} /></label>
            <div className="finance-simulation-form__row">
              <label><span>Valor</span><input aria-label="Valor do bloco" value={itemForm.amount} onChange={(event) => setItemForm((current) => ({ ...current, amount: event.target.value }))} /></label>
              <label><span>Data</span><input aria-label="Data do bloco" type="date" value={itemForm.event_date} onChange={(event) => setItemForm((current) => ({ ...current, event_date: event.target.value }))} /></label>
            </div>
            <button type="button" className="finance-advanced-button finance-advanced-button--primary" onClick={() => { void addManualItem(); }} disabled={busyKey === 'item'}>
              Adicionar manual
            </button>
          </div>

          <div className="finance-simulation-source-tools">
            <div className="finance-simulation-source-tabs" aria-label="Filtros da biblioteca">
              {([
                ['all', 'Todos'],
                ['inflow', 'Receber'],
                ['outflow', 'Pagar'],
                ['recurring', 'Recorrentes'],
                ['overdue', 'Atrasos']
              ] as Array<[SourceView, string]>).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={sourceView === value} onClick={() => setSourceView(value)}>{label}</button>
              ))}
            </div>
            <input aria-label="Buscar fonte financeira" placeholder="Buscar por nome, entidade ou status" value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} />
          </div>

          <div className="finance-simulation-source-list">
            {filteredSources.length === 0 ? <FinanceEmptyState title="Nada nessa visão." description="Troque o filtro ou busque por outro termo." /> : filteredSources.map((source) => (
              <article
                key={source.id}
                className={`finance-simulation-source finance-simulation-source--${source.tone} ${draggingSourceId === source.id ? 'is-dragging' : ''}`}
                draggable
                onDragStart={() => setDraggingSourceId(source.id)}
                onDragEnd={() => {
                  setDraggingSourceId('');
                  clearDropTarget();
                }}
              >
                <div>
                  <strong>{source.label}</strong>
                  <span>{source.detail} · {formatDate(source.event_date)}</span>
                </div>
                <FinanceMono>{formatCurrency(source.amount_cents)}</FinanceMono>
                <button type="button" className="finance-advanced-button" onClick={() => { void addSource(source); }} disabled={busyKey === `source-${source.id}`}>
                  Adicionar
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  function renderItem(item: FinanceSimulationItem) {
    return (
      <article key={item.id} className={`finance-simulation-day-item finance-simulation-day-item--${itemKindTone(item.kind)} ${editingItemId === item.id ? 'is-editing' : ''}`}>
        <div>
          <strong>{item.label}</strong>
          <span>{itemKindLabel(item.kind)} · {item.probability_percent}%</span>
        </div>
        <FinanceMono>{formatCurrency(item.amount_cents)}</FinanceMono>
        <div className="finance-simulation-item-actions">
          <button type="button" className="finance-advanced-button" onClick={() => { setEditingBalance(false); setEditingItemId(item.id); setEditForm(editableFormFromItem(item)); }}>Editar</button>
          <button type="button" className="finance-advanced-button finance-advanced-button--danger" onClick={() => { void deleteItem(item); }} disabled={busyKey === `delete-item-${item.id}`}>Remover</button>
        </div>
      </article>
    );
  }

  function renderWorkbenchSidePanel() {
    if (editingBalance && selected) {
      return (
        <aside className="finance-simulation-impact-summary finance-simulation-editor-panel">
          <small>Editar</small>
          <h3>Saldo inicial</h3>
          <label><span>Valor inicial da mesa</span><input aria-label="Editar saldo inicial" value={balanceForm} onChange={(event) => setBalanceForm(event.target.value)} /></label>
          <div className="finance-simulation-editor-panel__actions">
            <button type="button" className="finance-advanced-button finance-advanced-button--primary" onClick={() => { void updateStartingBalance(); }} disabled={busyKey === 'balance-edit'}>Salvar</button>
            <button type="button" className="finance-advanced-button" onClick={() => { setEditingBalance(false); setBalanceForm(''); }}>Cancelar</button>
          </div>
        </aside>
      );
    }

    if (editingItem && editForm) {
      return (
        <aside className="finance-simulation-impact-summary finance-simulation-editor-panel">
          <small>Editar</small>
          <h3>Ajustar bloco</h3>
          <label><span>Tipo</span><select value={editForm.kind} onChange={(event) => setEditForm((current) => current ? ({ ...current, kind: event.target.value as FinanceSimulationItemKind }) : current)}>
              {itemKindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select></label>
          <label><span>Título</span><input aria-label="Editar descrição do bloco" value={editForm.label} onChange={(event) => setEditForm((current) => current ? ({ ...current, label: event.target.value }) : current)} /></label>
          <label><span>Valor</span><input aria-label="Editar valor do bloco" value={editForm.amount} onChange={(event) => setEditForm((current) => current ? ({ ...current, amount: event.target.value }) : current)} /></label>
          <label><span>Data</span><input aria-label="Editar data do bloco" type="date" value={editForm.event_date} onChange={(event) => setEditForm((current) => current ? ({ ...current, event_date: event.target.value }) : current)} /></label>
          <label><span>Chance (%)</span><input aria-label="Editar chance do bloco" value={editForm.probability_percent} onChange={(event) => setEditForm((current) => current ? ({ ...current, probability_percent: event.target.value }) : current)} /></label>
          <div className="finance-simulation-editor-panel__actions">
            <button type="button" className="finance-advanced-button finance-advanced-button--primary" onClick={() => { void updateItem(editingItem); }}>Salvar</button>
            <button type="button" className="finance-advanced-button" onClick={() => { setEditingItemId(''); setEditForm(null); }}>Cancelar</button>
          </div>
        </aside>
      );
    }

    return (
      <aside className="finance-simulation-impact-summary">
        <small>Resumo</small>
        <h3>Datas impactadas</h3>
        {impactPoints.length === 0 ? (
          <p>Nenhuma alteração no cenário ainda.</p>
        ) : impactPoints.map((point) => (
          <div key={point.date} className={point.balance_cents < 0 ? 'is-negative' : ''}>
            <span>{formatDateShort(point.date)}</span>
            <strong>{netLabel(point.net_cents)}</strong>
            <small>{formatCurrency(point.balance_cents)}</small>
          </div>
        ))}
      </aside>
    );
  }

  function renderFlowPoint(point: FinanceSimulationTimelinePoint, index: number) {
    const dayItems = itemsByDate[point.date] ?? [];
    return (
      <article
        key={point.date}
        className={`finance-simulation-flow-step ${point.balance_cents < 0 ? 'is-negative' : ''} ${activeDropTarget === `date-${point.date}` ? 'is-drop-active' : ''}`}
        onDragEnter={() => markDropTarget(`date-${point.date}`)}
        onDragOver={(event) => {
          if (draggingSource) {
            event.preventDefault();
            markDropTarget(`date-${point.date}`);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearDropTarget();
        }}
        onDrop={(event) => {
          event.stopPropagation();
          event.preventDefault();
          if (draggingSource) void addSource(draggingSource, point.date);
          setDraggingSourceId('');
          clearDropTarget();
        }}
      >
        <div className="finance-simulation-flow-step__date">
          <small>Movimento {index + 1}</small>
          <strong>{formatDate(point.date)}</strong>
          <span className={point.net_cents < 0 ? 'is-danger' : 'is-success'}>{netLabel(point.net_cents)}</span>
        </div>

        <div className="finance-simulation-flow-step__body">
          <div className="finance-simulation-flow-step__items">
            {dayItems.map(renderItem)}
            <button type="button" className="finance-simulation-flow-step__add" onClick={() => { void addManualItem(point.date); }}>Adicionar nesta data</button>
          </div>
        </div>

        <div className="finance-simulation-flow-step__balance">
          <span>Saldo após a data</span>
          <strong>{formatCurrency(point.balance_cents)}</strong>
        </div>
      </article>
    );
  }

  function renderSimulationFlow() {
    if (!selected || !startingPoint || !endingPoint) return null;
    return (
      <section className="finance-panel finance-simulation-panel">
        <div className="finance-panel__header">
          <div className="finance-panel__header-copy">
            <small>Esteira</small>
            <h2>Planejamento por eventos</h2>
            <p>{selected.result.first_negative_date ? `Atenção: o caixa fica negativo em ${formatDate(selected.result.first_negative_date)}.` : 'Mostrando só datas em que o caixa muda.'}</p>
          </div>
        </div>
        <div className="finance-panel__content">
          <div className="finance-simulation-workbench">
            <div className="finance-simulation-flow-board">
              <article className="finance-simulation-flow-anchor finance-simulation-flow-anchor--editable">
                <small>Saldo inicial</small>
                <strong>{formatCurrency(selected.result.starting_balance_cents)}</strong>
                <span>{formatDate(startingPoint.date)}</span>
                <button
                  type="button"
                  className="finance-simulation-flow-anchor__edit"
                  aria-label="Editar saldo inicial"
                  onClick={() => {
                    setEditingItemId('');
                    setEditForm(null);
                    setEditingBalance(true);
                    setBalanceForm(centsToInput(selected.result.starting_balance_cents));
                  }}
                >
                  Editar saldo
                </button>
              </article>

              {impactPoints.length > 0 ? (
                <>
                  <button
                    type="button"
                    className={`finance-simulation-original-drop ${activeDropTarget === 'original' ? 'is-drop-active' : ''}`}
                    onDragEnter={() => markDropTarget('original')}
                    onDragOver={(event) => {
                      if (draggingSource) {
                        event.preventDefault();
                        markDropTarget('original');
                      }
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearDropTarget();
                    }}
                    onDrop={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      if (draggingSource) void addSource(draggingSource);
                      setDraggingSourceId('');
                      clearDropTarget();
                    }}
                  >
                    Solte aqui para usar a data original do card
                  </button>
                  {impactPoints.map(renderFlowPoint)}
                </>
              ) : (
                <article
                  className={`finance-simulation-flow-empty finance-simulation-flow-empty--drop ${activeDropTarget === 'empty-original' ? 'is-drop-active' : ''}`}
                  onDragEnter={() => markDropTarget('empty-original')}
                  onDragOver={(event) => {
                    if (draggingSource) {
                      event.preventDefault();
                      markDropTarget('empty-original');
                    }
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearDropTarget();
                  }}
                  onDrop={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    if (draggingSource) void addSource(draggingSource);
                    setDraggingSourceId('');
                    clearDropTarget();
                  }}
                >
                  <strong>Solte uma conta aqui para começar a simular</strong>
                  <span>Ela entra na data original do card. Se preferir, crie um bloco manual para testar uma entrada ou saída livre.</span>
                  <button type="button" className="finance-advanced-button finance-advanced-button--primary" onClick={() => { void addManualItem(); }}>Adicionar bloco manual</button>
                </article>
              )}

              <article className={`finance-simulation-flow-anchor ${endingPoint.balance_cents < 0 ? 'is-negative' : 'is-positive'}`}>
                <small>Saldo final</small>
                <strong>{formatCurrency(endingPoint.balance_cents)}</strong>
                <span>{formatDate(endingPoint.date)}</span>
              </article>
            </div>

            {renderWorkbenchSidePanel()}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page finance-page finance-simulation-page">
      <FinancePageHeader
        eyebrow="Simulação"
        title="Mesa de simulação"
        description="Monte cenários de caixa puxando contas reais, blocos manuais e pagamentos parciais sem alterar lançamentos reais."
        meta={selected ? (
          <>
            <span>Período: <strong>{formatDate(selected.start_date)} - {formatDate(selected.end_date)}</strong></span>
            <span>Blocos: <strong>{selected.result.item_count}</strong></span>
          </>
        ) : undefined}
      />

      {loading ? <FinanceLoadingState title="Carregando simulações..." /> : null}
      {error ? <FinanceErrorState title="Falha na simulação." description={error} /> : null}

      {!loading ? (
        <div className="finance-simulation">
          {message ? <div className="finance-advanced__notice">{message}</div> : null}

          <div className="finance-simulation__grid">
            <aside className="finance-simulation__side">
              <section className="finance-panel finance-simulation-panel">
                <div className="finance-panel__header">
                  <div className="finance-panel__header-copy">
                    <small>Cenários</small>
                    <h2>Mesas salvas</h2>
                  </div>
                  <button type="button" className="finance-advanced-button" onClick={() => setShowCreateForm((current) => !current)}>
                    {showCreateForm ? 'Fechar' : 'Nova mesa'}
                  </button>
                </div>
                <div className="finance-panel__content finance-simulation-scenarios">
                  {scenarios.length === 0 ? <FinanceEmptyState title="Nenhum cenário ainda." description="Crie a primeira mesa para começar a simular." /> : scenarios.map((scenario) => (
                    <button
                      key={scenario.id}
                      type="button"
                      className={`finance-simulation-scenario ${selected?.id === scenario.id ? 'is-selected' : ''}`}
                      onClick={() => { void loadSimulations(scenario.id); }}
                    >
                      <strong>{scenario.name}</strong>
                      <span>{formatCurrency(scenario.result.ending_balance_cents)} no final</span>
                    </button>
                  ))}
                </div>
              </section>

              {showCreateForm || !selected ? renderScenarioForm() : renderSourceLibrary()}
            </aside>

            <main className="finance-simulation__main">
              {selected ? (
                <>
                  <section className="finance-simulation-hero">
                    <div>
                      <small>Cenário ativo</small>
                      <h2>{selected.name}</h2>
                      <p>{selected.description ?? 'Sem descrição.'}</p>
                    </div>
                    <div className="finance-simulation-hero__actions">
                      <button type="button" className="finance-advanced-button" onClick={() => { void duplicateScenario(); }} disabled={busyKey === 'duplicate'}>
                        Duplicar cenário
                      </button>
                      <button type="button" className="finance-advanced-button finance-advanced-button--danger" onClick={() => { void deleteScenario(); }} disabled={busyKey === 'delete-scenario'}>
                        Excluir cenário
                      </button>
                    </div>
                  </section>

                  <div className="finance-simulation-kpis">
                    <article><span>Saldo inicial</span><strong>{formatCurrency(selected.result.starting_balance_cents)}</strong></article>
                    <article><span>Entradas simuladas</span><strong>{formatCurrency(selected.result.total_inflow_cents)}</strong></article>
                    <article><span>Saídas simuladas</span><strong>{formatCurrency(selected.result.total_outflow_cents)}</strong></article>
                    <article className={selected.result.ending_balance_cents < 0 ? 'is-danger' : 'is-success'}><span>Saldo final</span><strong>{formatCurrency(selected.result.ending_balance_cents)}</strong></article>
                  </div>

                  {renderSimulationFlow()}
                </>
              ) : (
                <FinanceEmptyState title="Crie ou selecione um cenário." description="A mesa de simulação aparece aqui assim que existir um cenário." />
              )}
            </main>
          </div>
        </div>
      ) : null}
    </section>
  );
}
