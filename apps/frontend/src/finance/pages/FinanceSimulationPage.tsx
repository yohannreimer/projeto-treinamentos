import { useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import {
  financeApi,
  type FinanceSimulationDetail,
  type FinanceSimulationItem,
  type FinanceSimulationItemKind,
  type FinanceSimulationScenario,
  type FinanceSimulationSource,
  type FinanceSimulationSources
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

function simulationGridFieldLabel(field: SimulationGridField) {
  if (field === 'event_date') return 'data';
  if (field === 'label') return 'descrição';
  if (field === 'kind') return 'tipo';
  if (field === 'amount_cents') return 'valor';
  if (field === 'probability_percent') return 'probabilidade';
  return 'observação';
}

function itemKindLabel(kind: FinanceSimulationItemKind) {
  return itemKindOptions.find((option) => option.value === kind)?.label ?? 'Linha';
}

function itemKindTone(kind: FinanceSimulationItemKind) {
  return itemKindOptions.find((option) => option.value === kind)?.tone ?? 'inflow';
}

function itemNatureLabel(kind: FinanceSimulationItemKind) {
  return itemKindTone(kind) === 'outflow' ? 'Saída' : 'Entrada';
}

function signedItemAmount(item: FinanceSimulationItem) {
  return itemKindTone(item.kind) === 'outflow' ? -item.amount_cents : item.amount_cents;
}

function signedItemProjectedAmount(item: FinanceSimulationItem) {
  const weightedAmount = Math.round(Math.abs(item.amount_cents) * Math.min(100, Math.max(0, item.probability_percent)) / 100);
  return itemKindTone(item.kind) === 'outflow' ? -weightedAmount : weightedAmount;
}

function netLabel(cents: number) {
  return `${cents >= 0 ? '+' : ''}${formatCurrency(cents)}`;
}

function localizedSourceDetail(source: FinanceSimulationSource) {
  const statusLabels: Record<string, string> = {
    planned: 'Planejado',
    open: 'Aberto',
    partial: 'Parcial',
    paid: 'Pago',
    received: 'Recebido',
    overdue: 'Atrasado',
    canceled: 'Cancelado'
  };
  const detail = source.detail
    .split(' · ')
    .map((part) => statusLabels[part.trim().toLowerCase()] ?? part)
    .join(' · ');
  return `${detail} · ${formatDate(source.original_event_date ?? source.event_date)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fileSafeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'simulacao';
}

function isKeyboardEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT'
    || target.tagName === 'SELECT'
    || target.tagName === 'TEXTAREA'
    || target.isContentEditable;
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

type EditableItemForm = {
  kind: FinanceSimulationItemKind;
  label: string;
  amount: string;
  event_date: string;
  probability_percent: string;
  note: string;
};

type SourceView = 'all' | 'inflow' | 'outflow' | 'recurring' | 'overdue';
type SimulationGridField = 'event_date' | 'label' | 'kind' | 'amount_cents' | 'probability_percent' | 'note';
type EditingCell = {
  itemId: string;
  field: SimulationGridField;
  value: string;
};
type CopiedSimulationRow = {
  source_type: FinanceSimulationItem['source_type'];
  source_id: string | null;
  kind: FinanceSimulationItemKind;
  label: string;
  amount_cents: number;
  event_date: string;
  probability_percent: number;
  note: string | null;
};

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
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [selectedRowId, setSelectedRowId] = useState('');
  const [copiedRow, setCopiedRow] = useState<CopiedSimulationRow | null>(null);
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
    }), 'Linha manual adicionada ao cenário.');
  }

  function addSource(source: FinanceSimulationSource, eventDate?: string) {
    if (!selected) return Promise.resolve();
    if (source.kind === 'starting_balance') {
      return runDetailAction('balance', () => financeApi.updateSimulation(selected.id, {
        starting_balance_cents: source.amount_cents
      }), 'Saldo atual aplicado como saldo inicial.');
    }
    return runDetailAction(`source-${source.id}`, () => financeApi.createSimulationItem(selected.id, sourceToPayload(source, eventDate)), 'Linha puxada do financeiro.');
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

  function payloadFromItem(item: FinanceSimulationItem): CopiedSimulationRow {
    return {
      source_type: item.source_type,
      source_id: item.source_id,
      kind: item.kind,
      label: item.label,
      amount_cents: item.amount_cents,
      event_date: item.event_date,
      probability_percent: item.probability_percent,
      note: item.note
    };
  }

  function beginCellEdit(item: FinanceSimulationItem, field: SimulationGridField) {
    setEditingBalance(false);
    setEditingItemId('');
    setEditForm(null);
    setSelectedRowId(item.id);
    setEditingCell({
      itemId: item.id,
      field,
      value: field === 'amount_cents'
        ? centsToInput(item.amount_cents)
        : field === 'probability_percent'
          ? String(item.probability_percent)
          : field === 'note'
            ? item.note ?? ''
            : String(item[field])
    });
  }

  function commitCellEdit(item: FinanceSimulationItem) {
    if (!selected || !editingCell || editingCell.itemId !== item.id) return Promise.resolve();
    const value = editingCell.value.trim();
    const payload = editingCell.field === 'amount_cents'
      ? { amount_cents: parseCurrencyToCents(value) }
      : editingCell.field === 'probability_percent'
        ? { probability_percent: Number(value) || 100 }
        : editingCell.field === 'note'
          ? { note: value || null }
          : editingCell.field === 'kind'
            ? { kind: value as FinanceSimulationItemKind }
            : { [editingCell.field]: value };

    return runDetailAction(`cell-${item.id}-${editingCell.field}`, () => financeApi.updateSimulationItem(selected.id, item.id, payload), 'Linha atualizada.').then(() => {
      setEditingCell(null);
    });
  }

  function cancelCellEdit() {
    setEditingCell(null);
  }

  async function duplicateCopiedRow() {
    if (!selected) return;
    const base = copiedRow ?? (selectedRowId ? selected.items.find((item) => item.id === selectedRowId) ? payloadFromItem(selected.items.find((item) => item.id === selectedRowId) as FinanceSimulationItem) : null : null);
    if (!base) return;
    setBusyKey('paste-row');
    setError('');
    setMessage('');
    try {
      const detail = await financeApi.createSimulationItem(selected.id, {
        ...base,
        source_type: 'manual',
        source_id: null,
        label: base.label
      });
      setSelected(detail);
      const list = await financeApi.listSimulations();
      setScenarios(list.scenarios);
      await refreshSources(detail.id);
      const duplicated = [...detail.items].reverse().find((item) => (
        item.label === base.label
        && item.amount_cents === base.amount_cents
        && item.event_date === base.event_date
        && item.kind === base.kind
      ));
      if (duplicated) {
        setSelectedRowId(duplicated.id);
        setEditingCell({ itemId: duplicated.id, field: 'event_date', value: duplicated.event_date });
      }
      setMessage('Linha duplicada. Ajuste a data e aperte Enter.');
    } catch (pasteError) {
      setError(pasteError instanceof Error ? pasteError.message : 'Falha ao duplicar linha.');
    } finally {
      setBusyKey('');
    }
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
    return runDetailAction(`delete-item-${item.id}`, () => financeApi.deleteSimulationItem(selected.id, item.id), 'Linha removida do cenário.').then(() => {
      setSelectedRowId('');
      setEditingCell(null);
    });
  }

  function deleteSelectedRow() {
    if (!selectedRowId || !selected) return Promise.resolve();
    const item = selected.items.find((candidate) => candidate.id === selectedRowId);
    if (!item) return Promise.resolve();
    return deleteItem(item);
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

  const availableSources = sources?.sources ?? [];
  const draggingSource = availableSources.find((source) => source.id === draggingSourceId) ?? null;
  const editingItem = selected?.items.find((item) => item.id === editingItemId) ?? null;
  const normalizedSourceSearch = sourceSearch.trim().toLowerCase();
  const usedSourceKeys = useMemo(() => new Set(
    (selected?.items ?? [])
      .filter((item) => item.source_id)
      .map((item) => `${item.source_type}:${item.source_id}`)
  ), [selected?.items]);
  const filteredSources = availableSources.filter((source) => {
    if (source.source_id && usedSourceKeys.has(`${source.source_type}:${source.source_id}`)) return false;
    const matchesView = sourceView === 'all'
      || (sourceView === 'inflow' && source.tone === 'inflow')
      || (sourceView === 'outflow' && source.tone === 'outflow')
      || (sourceView === 'recurring' && source.cadence === 'recurring')
      || (sourceView === 'overdue' && ['overdue', 'atrasado'].some((status) => source.detail.toLowerCase().includes(status)));
    const matchesSearch = !normalizedSourceSearch
      || source.label.toLowerCase().includes(normalizedSourceSearch)
      || source.detail.toLowerCase().includes(normalizedSourceSearch);
    return matchesView && matchesSearch;
  });
  const sortedItems = useMemo(() => (
    [...(selected?.items ?? [])].sort((left, right) => (
      left.event_date.localeCompare(right.event_date)
      || left.created_at.localeCompare(right.created_at)
      || left.label.localeCompare(right.label)
    ))
  ), [selected?.items]);
  const impactPoints = useMemo(() => (
    selected?.result.timeline.filter((point) => point.net_cents !== 0) ?? []
  ), [selected]);
  const balanceByDate = useMemo(() => (
    new Map((selected?.result.timeline ?? []).map((point) => [point.date, point.balance_cents]))
  ), [selected]);
  const runningBalanceByItemId = useMemo(() => {
    const balances = new Map<string, number>();
    let balance = selected?.result.starting_balance_cents ?? 0;
    sortedItems.forEach((item) => {
      balance += signedItemProjectedAmount(item);
      balances.set(item.id, balance);
    });
    return balances;
  }, [selected?.result.starting_balance_cents, sortedItems]);
  const startingPoint = selected?.result.timeline[0] ?? null;
  const endingPoint = selected?.result.timeline[selected.result.timeline.length - 1] ?? null;

  function balanceAfterItem(item: FinanceSimulationItem) {
    const itemBalance = runningBalanceByItemId.get(item.id);
    if (typeof itemBalance === 'number') return itemBalance;
    const exact = balanceByDate.get(item.event_date);
    if (typeof exact === 'number') return exact;
    const previous = [...(selected?.result.timeline ?? [])].filter((point) => point.date <= item.event_date).pop();
    return previous?.balance_cents ?? selected?.result.starting_balance_cents ?? 0;
  }

  function handleGridKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!selected) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      const item = selected.items.find((candidate) => candidate.id === selectedRowId);
      if (!item) return;
      event.preventDefault();
      setCopiedRow(payloadFromItem(item));
      setMessage(`Linha "${item.label}" copiada.`);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      void duplicateCopiedRow();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (isKeyboardEditingTarget(event.target)) return;
      event.preventDefault();
      void deleteSelectedRow();
    }
  }

  function exportSimulationTablePdf() {
    if (!selected || !startingPoint || !endingPoint) return;
    const printWindow = window.open('', '_blank', 'width=1280,height=900');
    if (!printWindow) {
      setError('Não consegui abrir a janela de exportação. Libere pop-ups para gerar o PDF.');
      return;
    }

    const rows = [
      {
        className: 'anchor',
        date: formatDate(startingPoint.date),
        label: 'Saldo inicial',
        nature: 'Base',
        amount: formatCurrency(selected.result.starting_balance_cents),
        amountClass: '',
        balance: formatCurrency(selected.result.starting_balance_cents),
        balanceClass: selected.result.starting_balance_cents < 0 ? 'neg' : '',
        detail: 'Ponto de partida da mesa'
      },
      ...sortedItems.map((item) => ({
        className: itemKindTone(item.kind),
        date: formatDate(item.event_date),
        label: item.label,
        nature: itemNatureLabel(item.kind),
        amount: formatCurrency(signedItemAmount(item)),
        amountClass: itemKindTone(item.kind) === 'outflow' ? 'neg' : 'pos',
        balance: formatCurrency(balanceAfterItem(item)),
        balanceClass: balanceAfterItem(item) < 0 ? 'neg' : '',
        detail: itemKindLabel(item.kind)
      })),
      {
        className: endingPoint.balance_cents < 0 ? 'final negative' : 'final positive',
        date: formatDate(endingPoint.date),
        label: 'Saldo final',
        nature: 'Resultado',
        amount: formatCurrency(endingPoint.balance_cents),
        amountClass: endingPoint.balance_cents < 0 ? 'neg' : '',
        balance: formatCurrency(endingPoint.balance_cents),
        balanceClass: endingPoint.balance_cents < 0 ? 'neg' : '',
        detail: selected.result.first_negative_date
          ? `Caixa negativo em ${formatDate(selected.result.first_negative_date)}`
          : `${sortedItems.length} linhas simuladas`
      }
    ];

    const tableRows = rows.map((row) => `
      <tr class="${escapeHtml(row.className)}">
        <td class="col-date">${escapeHtml(row.date)}</td>
        <td class="col-movement">
          <strong>${escapeHtml(row.label)}</strong>
          <small>${escapeHtml(row.detail)}</small>
        </td>
        <td class="col-nature"><span class="tag ${escapeHtml(row.className.split(' ')[0])}">${escapeHtml(row.nature)}</span></td>
        <td class="col-value money ${escapeHtml(row.amountClass)}">${escapeHtml(row.amount)}</td>
        <td class="col-balance money ${escapeHtml(row.balanceClass)}">${escapeHtml(row.balance)}</td>
      </tr>
    `).join('');

    const impactRows = impactPoints.length === 0
      ? '<p class="empty-impact">Nenhuma alteração no cenário.</p>'
      : impactPoints.map((point) => `
        <div class="impact-row">
          <span class="i-date">${escapeHtml(formatDateShort(point.date))}</span>
          <span class="i-amount ${point.net_cents < 0 ? 'neg' : 'pos'}">${escapeHtml(netLabel(point.net_cents))}</span>
          <span class="i-balance ${point.balance_cents < 0 ? 'neg' : ''}">${escapeHtml(formatCurrency(point.balance_cents))}</span>
        </div>
      `).join('');

    const title = `Mesa de simulação - ${selected.name}`;
    const filename = `${fileSafeName(selected.name)}.pdf`;
    const exportedAt = new Date().toLocaleString('pt-BR');
    const finalNegative = endingPoint.balance_cents < 0;

    printWindow.document.write(`<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            @page { size: A4 landscape; margin: 0; }
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
              background: #faf8f5;
              color: #1a2230;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              font-size: 10px;
              line-height: 1.4;
            }
            .page {
              width: 297mm;
              min-height: 210mm;
              display: flex;
              flex-direction: column;
            }
            /* ── Cabeçalho escuro ── */
            .page-header {
              background: #1a1f2e;
              padding: 8mm 10mm 7.5mm;
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 14mm;
              align-items: center;
            }
            .eyebrow {
              display: block;
              font-size: 7px;
              font-weight: 800;
              letter-spacing: 0.26em;
              text-transform: uppercase;
              color: #e35f25;
              margin-bottom: 5px;
            }
            .page-title {
              font-family: Georgia, "Times New Roman", serif;
              font-size: 25px;
              font-weight: 700;
              color: #f5f2ed;
              line-height: 1.08;
              letter-spacing: -0.02em;
            }
            .page-subtitle {
              margin-top: 5px;
              font-size: 8.5px;
              color: #7a8394;
              max-width: 340px;
            }
            .header-meta { display: flex; gap: 7px; }
            .meta-box {
              padding: 7px 10px;
              border: 1px solid rgba(255,255,255,0.10);
              border-radius: 6px;
              background: rgba(255,255,255,0.05);
              text-align: right;
              min-width: 106px;
            }
            .meta-box span {
              display: block;
              font-size: 6.5px;
              font-weight: 800;
              letter-spacing: 0.16em;
              text-transform: uppercase;
              color: #5e6b7e;
              margin-bottom: 4px;
            }
            .meta-box strong {
              display: block;
              font-size: 11px;
              font-weight: 700;
              color: #f5f2ed;
            }
            /* ── Corpo ── */
            .page-body {
              flex: 1;
              padding: 5.5mm 10mm 0;
              display: flex;
              flex-direction: column;
              gap: 4.5mm;
            }
            /* ── Faixa de fluxo (equação narrativa) ── */
            .cashflow-strip {
              display: grid;
              grid-template-columns: 1fr 20px 1fr 20px 1fr 20px 1fr;
              align-items: stretch;
              background: #ffffff;
              border: 1px solid #e4ddd6;
              border-radius: 8px;
              overflow: hidden;
            }
            .cf-node { padding: 9px 13px 10px; }
            .cf-node.final-node    { background: #fff8f5; border-left: 1px solid #f0d5c5; }
            .cf-node.final-success { background: #f4fdf8; border-left: 1px solid #c3e8d6; }
            .cf-label {
              display: block;
              font-size: 6.5px;
              font-weight: 800;
              letter-spacing: 0.15em;
              text-transform: uppercase;
              color: #9aa3b2;
              margin-bottom: 5px;
            }
            .cf-val {
              display: block;
              font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
              font-size: 14.5px;
              font-weight: 700;
              color: #1a2230;
              white-space: nowrap;
            }
            .cf-op {
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 15px;
              font-weight: 300;
              color: #c8cdd8;
              background: #faf8f5;
              border-left: 1px solid #ede8e2;
              border-right: 1px solid #ede8e2;
            }
            /* ── Grade principal ── */
            .main-grid {
              display: grid;
              grid-template-columns: 1fr 186px;
              gap: 4.5mm;
              flex: 1;
              align-items: start;
            }
            /* ── Tabela ── */
            .table-card {
              background: #ffffff;
              border: 1px solid #e4ddd6;
              border-radius: 8px;
              overflow: hidden;
            }
            .table-bar {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 8px 13px;
              background: #f7f4ef;
              border-bottom: 1px solid #e4ddd6;
            }
            .table-bar strong { font-size: 10px; font-weight: 700; color: #1a2230; }
            .table-bar span   { font-size: 7px; font-weight: 700; color: #9aa3b2; letter-spacing: 0.05em; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            .col-date   { width: 76px; }
            .col-nature { width: 80px; }
            .col-value, .col-balance { width: 114px; }
            thead th {
              padding: 6px 13px;
              background: #ffffff;
              font-size: 6.5px;
              font-weight: 900;
              letter-spacing: 0.14em;
              text-transform: uppercase;
              color: #b8bfc9;
              text-align: left;
              border-bottom: 1px solid #f0ebe3;
            }
            thead th.r { text-align: right; }
            tbody td {
              padding: 7px 13px;
              font-size: 9.5px;
              color: #1a2230;
              border-bottom: 1px solid #f5f1ec;
              vertical-align: middle;
            }
            tbody tr:last-child td { border-bottom: none; }
            td strong {
              display: block;
              font-size: 9.5px;
              font-weight: 600;
              color: #1a2230;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            td small {
              display: block;
              font-size: 7px;
              color: #9aa3b2;
              margin-top: 1px;
            }
            .tag {
              display: inline-block;
              padding: 2px 6px;
              border-radius: 3px;
              font-size: 6.5px;
              font-weight: 900;
              letter-spacing: 0.10em;
              text-transform: uppercase;
              background: #f0ebe3;
              color: #6b7280;
            }
            .tag.inflow  { background: #ccf2e8; color: #0a5c42; }
            .tag.outflow { background: #fde4e4; color: #8b1a1a; }
            .tag.final   { background: #dbeafe; color: #1e3a8a; }
            .money {
              font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
              font-weight: 600;
              text-align: right;
              white-space: nowrap;
              font-size: 9.5px;
            }
            .pos { color: #0f766e; }
            .neg { color: #be3232; }
            tbody tr.anchor  td { background: #fdfcfa; color: #6b7280; }
            tbody tr.outflow td { background: #fffbfb; }
            tbody tr.inflow  td { background: #fbfffe; }
            tbody tr.final.positive td { background: #f4fdf8; font-weight: 700; }
            tbody tr.final.negative td { background: #fff6f6; font-weight: 700; }
            /* ── Resumo (lista tipográfica, sem card) ── */
            .summary { padding: 2px 0 0 2px; }
            .summary .eyebrow { margin-bottom: 3px; }
            .summary h2 { font-size: 11px; font-weight: 700; color: #1a2230; margin-bottom: 6px; }
            .impact-row {
              display: grid;
              grid-template-columns: auto 1fr;
              column-gap: 8px;
              padding: 7px 0;
              border-top: 1px solid #ede8e2;
            }
            .i-date   { font-size: 10.5px; font-weight: 900; color: #e35f25; white-space: nowrap; }
            .i-amount {
              font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
              font-size: 9.5px;
              font-weight: 700;
              text-align: right;
            }
            .i-balance {
              grid-column: 1 / -1;
              font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
              font-size: 8px;
              color: #9aa3b2;
              margin-top: 1px;
            }
            .empty-impact { font-size: 9px; color: #9aa3b2; padding-top: 8px; }
            /* ── Rodapé ── */
            .page-footer {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 3.5mm 10mm 4mm;
              margin-top: 4.5mm;
              border-top: 1px solid #e4ddd6;
              font-size: 7.5px;
              color: #9aa3b2;
              font-weight: 500;
            }
            .page-footer .brand { font-weight: 800; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="page">

            <header class="page-header">
              <div>
                <span class="eyebrow">Mesa de simulação</span>
                <div class="page-title">${escapeHtml(selected.name)}</div>
                <p class="page-subtitle">Cenário de caixa com linhas reais e manuais para decisão gerencial.</p>
              </div>
              <div class="header-meta">
                <div class="meta-box">
                  <span>Período</span>
                  <strong>${escapeHtml(formatDate(selected.start_date))} – ${escapeHtml(formatDate(selected.end_date))}</strong>
                </div>
                <div class="meta-box">
                  <span>Linhas</span>
                  <strong>${escapeHtml(String(selected.result.item_count))}</strong>
                </div>
              </div>
            </header>

            <div class="page-body">

              <div class="cashflow-strip">
                <div class="cf-node">
                  <span class="cf-label">Saldo inicial</span>
                  <span class="cf-val">${escapeHtml(formatCurrency(selected.result.starting_balance_cents))}</span>
                </div>
                <div class="cf-op">+</div>
                <div class="cf-node">
                  <span class="cf-label">Entradas</span>
                  <span class="cf-val pos">${escapeHtml(formatCurrency(selected.result.total_inflow_cents))}</span>
                </div>
                <div class="cf-op">&minus;</div>
                <div class="cf-node">
                  <span class="cf-label">Saídas</span>
                  <span class="cf-val neg">${escapeHtml(formatCurrency(selected.result.total_outflow_cents))}</span>
                </div>
                <div class="cf-op">=</div>
                <div class="cf-node ${finalNegative ? 'final-node' : 'final-success'}">
                  <span class="cf-label">Saldo final</span>
                  <span class="cf-val ${finalNegative ? 'neg' : 'pos'}">${escapeHtml(formatCurrency(endingPoint.balance_cents))}</span>
                </div>
              </div>

              <div class="main-grid">

                <div class="table-card">
                  <div class="table-bar">
                    <strong>Grade de movimentos</strong>
                    <span>${escapeHtml(filename)}</span>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th class="col-date">Data</th>
                        <th class="col-movement">Movimento</th>
                        <th class="col-nature">Natureza</th>
                        <th class="col-value r">Valor</th>
                        <th class="col-balance r">Saldo após</th>
                      </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                  </table>
                </div>

                <div class="summary">
                  <span class="eyebrow">Resumo</span>
                  <h2>Datas impactadas</h2>
                  ${impactRows}
                </div>

              </div>
            </div>

            <footer class="page-footer">
              <span class="brand">Holand Financeiro ERP</span>
              <span>Exportado em ${escapeHtml(exportedAt)}</span>
            </footer>

          </div>
          <script>
            window.addEventListener('load', () => {
              window.focus();
              window.print();
            });
          </script>
        </body>
      </html>`);
    printWindow.document.close();
  }

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
            <p>Clique para adicionar na data original ou arraste para a grade.</p>
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
            <small>Linha manual rápida</small>
            <label><span>Tipo do movimento</span><select value={itemForm.kind} onChange={(event) => setItemForm((current) => ({ ...current, kind: event.target.value as FinanceSimulationItemKind }))}>
                {itemKindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select></label>
            <label><span>Título da linha</span><input aria-label="Descrição da linha manual" value={itemForm.label} onChange={(event) => setItemForm((current) => ({ ...current, label: event.target.value }))} /></label>
            <div className="finance-simulation-form__row">
              <label><span>Valor</span><input aria-label="Valor da linha" value={itemForm.amount} onChange={(event) => setItemForm((current) => ({ ...current, amount: event.target.value }))} /></label>
              <label><span>Data</span><input aria-label="Data da linha" type="date" value={itemForm.event_date} onChange={(event) => setItemForm((current) => ({ ...current, event_date: event.target.value }))} /></label>
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
                ['recurring', 'Recorr.'],
                ['overdue', 'Atrasos']
              ] as Array<[SourceView, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-label={value === 'recurring' ? 'Recorrentes' : undefined}
                  aria-pressed={sourceView === value}
                  title={value === 'recurring' ? 'Recorrentes' : label}
                  onClick={() => setSourceView(value)}
                >
                  {label}
                </button>
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
                  <span>{localizedSourceDetail(source)}</span>
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
          <span>{itemKindLabel(item.kind)}</span>
        </div>
        <FinanceMono>{formatCurrency(item.amount_cents)}</FinanceMono>
        <div className="finance-simulation-item-actions">
          <button type="button" className="finance-advanced-button" onClick={() => { setEditingBalance(false); setEditingItemId(item.id); setEditForm(editableFormFromItem(item)); }}>Editar</button>
          <button type="button" className="finance-advanced-button finance-advanced-button--danger" onClick={() => { void deleteItem(item); }} disabled={busyKey === `delete-item-${item.id}`}>Remover</button>
        </div>
      </article>
    );
  }

  function renderCellInput(item: FinanceSimulationItem, field: SimulationGridField) {
    if (!editingCell || editingCell.itemId !== item.id || editingCell.field !== field) return null;
    const commit = () => { void commitCellEdit(item); };
    const commonProps = {
      value: editingCell.value,
      autoFocus: true,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setEditingCell((current) => current ? ({ ...current, value: event.target.value }) : current),
      onBlur: commit,
      onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelCellEdit();
        }
      }
    };

    if (field === 'kind') {
      return (
        <select aria-label="Editar tipo da linha" className="finance-simulation-grid__cell-input" {...commonProps}>
          {itemKindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      );
    }

    return (
      <input
        aria-label={`Editar ${simulationGridFieldLabel(field)}`}
        className="finance-simulation-grid__cell-input"
        type={field === 'event_date' ? 'date' : 'text'}
        {...commonProps}
      />
    );
  }

  function renderEditableCell(item: FinanceSimulationItem, field: SimulationGridField, display: ReactNode, className = '') {
    const isEditing = editingCell?.itemId === item.id && editingCell.field === field;
    return (
      <td
        className={`${className} ${isEditing ? 'is-editing' : ''}`}
        onDoubleClick={() => beginCellEdit(item, field)}
      >
        {isEditing ? renderCellInput(item, field) : <button type="button" className="finance-simulation-grid__cell-button" onClick={() => setSelectedRowId(item.id)}>{display}</button>}
      </td>
    );
  }

  function renderSimulationFlow() {
    if (!selected || !startingPoint || !endingPoint) return null;
    return (
      <section className="finance-panel finance-simulation-panel">
        <div className="finance-panel__header">
          <div className="finance-panel__header-copy">
            <small>Mesa</small>
            <h2>Planilha de cenário</h2>
            <p>{selected.result.first_negative_date ? `Atenção: o caixa fica negativo em ${formatDate(selected.result.first_negative_date)}.` : 'Linhas compactas para testar caixa com velocidade de planilha.'}</p>
          </div>
          <button
            type="button"
            className="finance-simulation-export-button finance-simulation-export-button--panel"
            onClick={exportSimulationTablePdf}
            aria-label="Exportar planilha em PDF"
            title="Exportar tabela em PDF"
          >
            PDF
          </button>
        </div>
        <div className="finance-panel__content">
          <div className="finance-simulation-workbench" onKeyDown={handleGridKeyDown} tabIndex={0}>
            <div
              className={`finance-simulation-grid-board ${activeDropTarget === 'grid-original' ? 'is-drop-active' : ''}`}
              onDragEnter={() => markDropTarget('grid-original')}
              onDragOver={(event) => {
                if (draggingSource) {
                  event.preventDefault();
                  markDropTarget('grid-original');
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
              <div className="finance-simulation-grid-toolbar">
                <div>
                  <strong>Grade de movimentos</strong>
                  <span>Duplo clique edita. Ctrl+C copia. Ctrl+V duplica.</span>
                </div>
                <div className="finance-simulation-grid-toolbar__actions">
                  <button type="button" className="finance-advanced-button finance-advanced-button--primary" onClick={() => { void addManualItem(); }} disabled={busyKey === 'item'}>
                    + Linha manual
                  </button>
                </div>
              </div>

              <div className="finance-simulation-grid-wrap">
                <table className="finance-simulation-grid" aria-label="Planilha de simulação financeira">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Valor</th>
                      <th>Saldo após</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="finance-simulation-grid__anchor-row">
                      <td>{formatDate(startingPoint.date)}</td>
                      <td>Saldo inicial</td>
                      <td className="finance-simulation-grid__money">
                        {editingBalance ? (
                          <input
                            aria-label="Editar saldo inicial"
                            className="finance-simulation-grid__cell-input"
                            value={balanceForm}
                            autoFocus
                            onChange={(event) => setBalanceForm(event.target.value)}
                            onBlur={() => { void updateStartingBalance(); }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void updateStartingBalance();
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                setEditingBalance(false);
                                setBalanceForm('');
                              }
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="finance-simulation-grid__cell-button"
                            onDoubleClick={() => {
                              setEditingBalance(true);
                              setBalanceForm(centsToInput(selected.result.starting_balance_cents));
                            }}
                          >
                            {formatCurrency(selected.result.starting_balance_cents)}
                          </button>
                        )}
                      </td>
                      <td className="finance-simulation-grid__money">{formatCurrency(selected.result.starting_balance_cents)}</td>
                    </tr>
                    {sortedItems.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <button
                            type="button"
                            className={`finance-simulation-grid-empty ${activeDropTarget === 'grid-original' ? 'is-drop-active' : ''}`}
                            onClick={() => { void addManualItem(); }}
                          >
                            Solte uma conta aqui para começar ou clique para adicionar uma linha manual
                          </button>
                        </td>
                      </tr>
                    ) : sortedItems.map((item) => {
                      const tone = itemKindTone(item.kind);
                      const rowDropKey = `row-${item.id}`;
                      return (
                        <tr
                          key={item.id}
                          className={`${selectedRowId === item.id ? 'is-selected' : ''} ${activeDropTarget === rowDropKey ? 'is-drop-active' : ''} finance-simulation-grid__row--${tone}`}
                          tabIndex={0}
                          onClick={(event) => {
                            setSelectedRowId(item.id);
                            if (!isKeyboardEditingTarget(event.target)) event.currentTarget.focus();
                          }}
                          onKeyDown={(event) => {
                            if ((event.key === 'Delete' || event.key === 'Backspace') && !isKeyboardEditingTarget(event.target)) {
                              event.preventDefault();
                              event.stopPropagation();
                              setSelectedRowId(item.id);
                              void deleteItem(item);
                            }
                          }}
                          onDragEnter={(event) => {
                            event.stopPropagation();
                            markDropTarget(rowDropKey);
                          }}
                          onDragOver={(event) => {
                            if (draggingSource) {
                              event.stopPropagation();
                              event.preventDefault();
                              markDropTarget(rowDropKey);
                            }
                          }}
                          onDragLeave={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearDropTarget();
                          }}
                          onDrop={(event) => {
                            event.stopPropagation();
                            event.preventDefault();
                            if (draggingSource) void addSource(draggingSource, item.event_date);
                            setDraggingSourceId('');
                            clearDropTarget();
                          }}
                        >
                          {renderEditableCell(item, 'event_date', formatDate(item.event_date), 'finance-simulation-grid__date')}
                          {renderEditableCell(item, 'label', item.label)}
                          {renderEditableCell(item, 'amount_cents', formatCurrency(signedItemAmount(item)), `finance-simulation-grid__money finance-simulation-grid__money--${tone}`)}
                          <td className={`finance-simulation-grid__money ${balanceAfterItem(item) < 0 ? 'is-negative' : ''}`}>{formatCurrency(balanceAfterItem(item))}</td>
                        </tr>
                      );
                    })}
                    <tr className={`finance-simulation-grid__anchor-row finance-simulation-grid__anchor-row--final ${endingPoint.balance_cents < 0 ? 'is-negative' : 'is-positive'}`}>
                      <td>{formatDate(endingPoint.date)}</td>
                      <td>Saldo final</td>
                      <td className="finance-simulation-grid__muted">{sortedItems.length} linhas</td>
                      <td className="finance-simulation-grid__money">{formatCurrency(endingPoint.balance_cents)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="finance-simulation-impact-summary">
              <small>Resumo</small>
              <h3>Datas impactadas</h3>
              {impactPoints.length === 0 ? (
                <p>Nenhuma alteração no cenário ainda.</p>
              ) : impactPoints.map((point) => (
                <div key={point.date} className={point.net_cents < 0 ? 'is-negative' : ''}>
                  <span>{formatDateShort(point.date)}</span>
                  <strong>{netLabel(point.net_cents)}</strong>
                  <small>{formatCurrency(point.balance_cents)}</small>
                </div>
              ))}
            </aside>
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
        description="Monte cenários de caixa puxando contas reais, linhas manuais e pagamentos parciais sem alterar lançamentos reais."
        meta={selected ? (
          <>
            <span>Período: <strong>{formatDate(selected.start_date)} - {formatDate(selected.end_date)}</strong></span>
            <span>Linhas: <strong>{selected.result.item_count}</strong></span>
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
