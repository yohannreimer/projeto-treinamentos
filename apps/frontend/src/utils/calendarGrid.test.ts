import { describe, expect, test } from 'vitest';
import { buildMonthGrid } from './calendarGrid';

describe('buildMonthGrid', () => {
  test('keeps the default rolling view anchored to the current Monday', () => {
    const cells = buildMonthGrid('2026-06', {}, { mode: 'rolling', todayIso: '2026-06-15' });

    expect(cells).toHaveLength(42);
    expect(cells[0]?.date).toBe('2026-06-15');
    expect(cells.at(-1)?.date).toBe('2026-07-26');
  });

  test('builds a closed month view from day 1 through the last day', () => {
    const cells = buildMonthGrid('2026-06', {}, { mode: 'month', todayIso: '2026-06-15' });
    const realDates = cells.map((cell) => cell.date).filter(Boolean);

    expect(realDates[0]).toBe('2026-06-01');
    expect(realDates.at(-1)).toBe('2026-06-30');
    expect(realDates).toHaveLength(30);
    expect(realDates.every((date) => date?.startsWith('2026-06'))).toBe(true);
  });

  test('pads closed month view with empty cells to preserve weekday alignment', () => {
    const cells = buildMonthGrid('2026-08', {}, { mode: 'month', todayIso: '2026-06-15' });
    const realDates = cells.map((cell) => cell.date).filter(Boolean);

    expect(cells).toHaveLength(42);
    expect(cells.slice(0, 5).every((cell) => cell.date === null)).toBe(true);
    expect(cells[5]?.date).toBe('2026-08-01');
    expect(realDates.at(-1)).toBe('2026-08-31');
    expect(realDates).toHaveLength(31);
  });
});
