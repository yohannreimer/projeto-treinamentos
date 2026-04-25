import type { FinancePeriodFilterInput } from './types.js';

export const FINANCE_TIMEZONE = 'America/Sao_Paulo';

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getZonedDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '0');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '0');

  return { year, month, day };
}

export function currentFinanceMonthRange() {
  const { year, month } = getZonedDateParts(new Date(), FINANCE_TIMEZONE);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return {
    start: formatDateOnly(start),
    end: formatDateOnly(end)
  };
}

export function financeDayWindow(days: number) {
  const { year, month, day } = getZonedDateParts(new Date(), FINANCE_TIMEZONE);
  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return {
    start: formatDateOnly(start),
    end: formatDateOnly(end)
  };
}

export function financeOffsetDateKey(days: number) {
  const { year, month, day } = getZonedDateParts(new Date(), FINANCE_TIMEZONE);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

export function resolveFinancePeriodWindow(filter?: FinancePeriodFilterInput | null): { start: string | null; end: string | null } {
  if (filter?.preset === 'all') return { start: null, end: null };
  if (filter?.preset === 'custom' && filter.from && filter.to) {
    return { start: filter.from, end: filter.to };
  }
  if (filter?.preset === 'last_7') return { start: financeOffsetDateKey(-6), end: financeOffsetDateKey(0) };
  if (filter?.preset === 'last_30') return { start: financeOffsetDateKey(-29), end: financeOffsetDateKey(0) };
  if (filter?.preset === 'today') {
    const today = financeOffsetDateKey(0);
    return { start: today, end: today };
  }
  if (filter?.preset === 'next_7') return financeDayWindow(6);
  if (filter?.preset === 'next_30') return financeDayWindow(29);
  return currentFinanceMonthRange();
}
