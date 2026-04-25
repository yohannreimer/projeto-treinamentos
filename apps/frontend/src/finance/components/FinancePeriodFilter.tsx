import { useMemo, useState } from 'react';
import {
  FINANCE_PERIOD_OPTIONS,
  deleteFinancePeriodFilter,
  readSavedFinancePeriodFilters,
  saveFinancePeriodFilter,
  type FinancePeriodState
} from '../hooks/useFinancePeriod';

type FinancePeriodFilterProps = {
  value: FinancePeriodState;
  onChange: (next: FinancePeriodState) => void;
  scopeLabel?: string;
};

export function FinancePeriodFilter({
  value,
  onChange,
  scopeLabel = 'Usando período global'
}: FinancePeriodFilterProps) {
  const [savedFilters, setSavedFilters] = useState(() => readSavedFinancePeriodFilters());
  const [selectedSavedFilterId, setSelectedSavedFilterId] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState('');
  const selectedSavedFilter = useMemo(
    () => savedFilters.find((filter) => filter.id === selectedSavedFilterId) ?? null,
    [savedFilters, selectedSavedFilterId]
  );

  function applySavedFilter(filterId: string) {
    setSelectedSavedFilterId(filterId);
    const saved = savedFilters.find((filter) => filter.id === filterId);
    if (!saved) return;
    onChange({
      preset: saved.preset,
      from: saved.from,
      to: saved.to
    });
  }

  function confirmSaveFilter() {
    const next = saveFinancePeriodFilter(value, draftName);
    setSavedFilters(next);
    setSelectedSavedFilterId(next[0]?.id ?? '');
    setDraftName('');
    setSaving(false);
  }

  function removeSavedFilter() {
    if (!selectedSavedFilter) return;
    const next = deleteFinancePeriodFilter(selectedSavedFilter.id);
    setSavedFilters(next);
    setSelectedSavedFilterId('');
  }

  const compactScope = scopeLabel.toLowerCase().includes('local') ? 'Local' : 'Global';

  return (
    <div className="finance-period-filter" aria-label="Filtro de período financeiro">
      <div className="finance-period-filter__group">
        <span className="finance-period-filter__label">Período</span>
        <select
          aria-label="Período financeiro"
          value={value.preset}
          onChange={(event) => onChange({ ...value, preset: event.target.value as FinancePeriodState['preset'] })}
        >
          {FINANCE_PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {value.preset === 'custom' ? (
        <>
          <input
            aria-label="Data inicial"
            type="date"
            value={value.from}
            onChange={(event) => onChange({ ...value, from: event.target.value })}
          />
          <input
            aria-label="Data final"
            type="date"
            value={value.to}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
          />
        </>
      ) : null}
      {savedFilters.length > 0 ? (
        <select
          aria-label="Filtros salvos"
          value={selectedSavedFilterId}
          onChange={(event) => applySavedFilter(event.target.value)}
        >
          <option value="">Salvos</option>
          {savedFilters.map((filter) => (
            <option key={filter.id} value={filter.id}>{filter.name}</option>
          ))}
        </select>
      ) : null}
      {saving ? (
        <>
          <input
            aria-label="Nome do filtro"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="Nome do filtro"
          />
          <button type="button" onClick={confirmSaveFilter} disabled={!draftName.trim()}>Confirmar</button>
          <button type="button" onClick={() => { setSaving(false); setDraftName(''); }}>Fechar</button>
        </>
      ) : (
        <button type="button" onClick={() => setSaving(true)} aria-label="Salvar filtro">Salvar</button>
      )}
      {selectedSavedFilter ? (
        <button type="button" onClick={removeSavedFilter}>Excluir</button>
      ) : null}
      <span className="finance-period-filter__scope" title={scopeLabel}>{compactScope}</span>
    </div>
  );
}
