import { useCallback, useEffect, useMemo, useState } from 'react';
import { internalSessionStore } from '../../auth/session';

export type FinancePeriodPreset = 'last_7' | 'last_30' | 'today' | 'next_7' | 'next_30' | 'month' | 'all' | 'custom';

export type FinancePeriodState = {
  preset: FinancePeriodPreset;
  from: string;
  to: string;
};

export type FinanceSavedPeriodFilter = FinancePeriodState & {
  id: string;
  name: string;
  created_at: string;
};

const GLOBAL_PERIOD_KEY_PREFIX = 'orquestrador_finance_global_period_v1';
const SAVED_PERIODS_KEY_PREFIX = 'orquestrador_finance_saved_periods_v1';
const FINANCE_PERIOD_CHANGED_EVENT = 'orquestrador_finance_period_changed';
const DEFAULT_FINANCE_PERIOD: FinancePeriodState = { preset: 'month', from: '', to: '' };

export const FINANCE_PERIOD_OPTIONS: Array<{ value: FinancePeriodPreset; label: string }> = [
  { value: 'last_7', label: 'Últimos 7 dias' },
  { value: 'last_30', label: 'Últimos 30 dias' },
  { value: 'today', label: 'Hoje' },
  { value: 'next_7', label: 'Próximos 7 dias' },
  { value: 'next_30', label: 'Próximos 30 dias' },
  { value: 'month', label: 'Mês atual' },
  { value: 'all', label: 'Todos' },
  { value: 'custom', label: 'Customizado' }
];

function currentUsername() {
  return internalSessionStore.read()?.user.username ?? 'anonymous';
}

function scopedKey(prefix: string, username = currentUsername()) {
  return `${prefix}:${username}`;
}

function isFinancePeriodPreset(value: unknown): value is FinancePeriodPreset {
  return FINANCE_PERIOD_OPTIONS.some((option) => option.value === value);
}

function normalizePeriod(raw: unknown, fallback: FinancePeriodState = DEFAULT_FINANCE_PERIOD): FinancePeriodState {
  if (!raw || typeof raw !== 'object') return fallback;
  const source = raw as Partial<Record<keyof FinancePeriodState, unknown>>;
  return {
    preset: isFinancePeriodPreset(source.preset) ? source.preset : fallback.preset,
    from: typeof source.from === 'string' ? source.from : fallback.from,
    to: typeof source.to === 'string' ? source.to : fallback.to
  };
}

function readGlobalPeriod(fallback: FinancePeriodState = DEFAULT_FINANCE_PERIOD) {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(scopedKey(GLOBAL_PERIOD_KEY_PREFIX));
  if (!raw) return fallback;
  try {
    return normalizePeriod(JSON.parse(raw), fallback);
  } catch {
    return fallback;
  }
}

function writeGlobalPeriod(period: FinancePeriodState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(scopedKey(GLOBAL_PERIOD_KEY_PREFIX), JSON.stringify(period));
  window.dispatchEvent(new CustomEvent(FINANCE_PERIOD_CHANGED_EVENT, { detail: period }));
}

function normalizeSavedFilter(raw: unknown): FinanceSavedPeriodFilter | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Partial<Record<keyof FinanceSavedPeriodFilter, unknown>>;
  const id = typeof source.id === 'string' ? source.id : '';
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  if (!id || !name) return null;
  return {
    id,
    name,
    created_at: typeof source.created_at === 'string' ? source.created_at : new Date().toISOString(),
    ...normalizePeriod(source)
  };
}

export function readSavedFinancePeriodFilters(username = currentUsername()): FinanceSavedPeriodFilter[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(scopedKey(SAVED_PERIODS_KEY_PREFIX, username));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSavedFilter).filter((item): item is FinanceSavedPeriodFilter => Boolean(item));
  } catch {
    return [];
  }
}

export function saveFinancePeriodFilter(period: FinancePeriodState, name: string, username = currentUsername()) {
  const trimmedName = name.trim();
  if (!trimmedName) return readSavedFinancePeriodFilters(username);
  const nextFilter: FinanceSavedPeriodFilter = {
    ...period,
    id: `fpf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmedName,
    created_at: new Date().toISOString()
  };
  const existing = readSavedFinancePeriodFilters(username).filter((filter) => filter.name.toLowerCase() !== trimmedName.toLowerCase());
  const next = [nextFilter, ...existing].slice(0, 12);
  window.localStorage.setItem(scopedKey(SAVED_PERIODS_KEY_PREFIX, username), JSON.stringify(next));
  return next;
}

export function deleteFinancePeriodFilter(filterId: string, username = currentUsername()) {
  const next = readSavedFinancePeriodFilters(username).filter((filter) => filter.id !== filterId);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(scopedKey(SAVED_PERIODS_KEY_PREFIX, username), JSON.stringify(next));
  }
  return next;
}

function dateKeyFromOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function resolveFinancePeriodWindow(period: FinancePeriodState): { from: string | null; to: string | null } {
  if (period.preset === 'all') return { from: null, to: null };
  if (period.preset === 'custom') {
    return {
      from: period.from || null,
      to: period.to || null
    };
  }
  if (period.preset === 'last_7') return { from: dateKeyFromOffset(-6), to: dateKeyFromOffset(0) };
  if (period.preset === 'last_30') return { from: dateKeyFromOffset(-29), to: dateKeyFromOffset(0) };
  if (period.preset === 'today') {
    const today = dateKeyFromOffset(0);
    return { from: today, to: today };
  }
  if (period.preset === 'next_7') return { from: dateKeyFromOffset(0), to: dateKeyFromOffset(6) };
  if (period.preset === 'next_30') return { from: dateKeyFromOffset(0), to: dateKeyFromOffset(29) };

  const today = dateKeyFromOffset(0);
  const [year, month] = today.split('-');
  const start = `${year}-${month}-01`;
  const endDate = new Date(Number(year), Number(month), 0);
  const end = `${year}-${month}-${String(endDate.getDate()).padStart(2, '0')}`;
  return { from: start, to: end };
}

export function useFinancePeriod(initial: FinancePeriodState = DEFAULT_FINANCE_PERIOD) {
  const [period, setPeriodState] = useState<FinancePeriodState>(() => readGlobalPeriod(initial));
  const setPeriod = useCallback((next: FinancePeriodState | ((current: FinancePeriodState) => FinancePeriodState)) => {
    setPeriodState((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      writeGlobalPeriod(resolved);
      return resolved;
    });
  }, []);

  useEffect(() => {
    const handlePeriodChanged = (event: Event) => {
      const detail = (event as CustomEvent<FinancePeriodState>).detail;
      if (detail) {
        setPeriodState(normalizePeriod(detail));
      }
    };

    window.addEventListener(FINANCE_PERIOD_CHANGED_EVENT, handlePeriodChanged);
    return () => window.removeEventListener(FINANCE_PERIOD_CHANGED_EVENT, handlePeriodChanged);
  }, []);

  const apiFilters = useMemo(() => ({
    preset: period.preset,
    from: period.preset === 'custom' ? period.from || null : null,
    to: period.preset === 'custom' ? period.to || null : null
  }), [period]);

  return { period, setPeriod, apiFilters };
}

export function financePeriodToQuery(period: FinancePeriodState) {
  const params = new URLSearchParams();
  params.set('preset', period.preset);
  if (period.preset === 'custom') {
    if (period.from) params.set('from', period.from);
    if (period.to) params.set('to', period.to);
  }
  return params;
}
