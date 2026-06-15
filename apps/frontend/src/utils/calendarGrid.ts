export type CalendarGridMode = 'rolling' | 'month';

export type MonthCell = {
  key: string;
  date: string | null;
  inMonth: boolean;
  isWeekend: boolean;
  isToday: boolean;
  holidays: string[];
};

type BuildMonthGridOptions = {
  mode?: CalendarGridMode;
  todayIso?: string;
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function toDateIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromIso(dateIso: string): Date {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(dateIso: string, diff: number): string {
  const date = fromIso(dateIso);
  date.setDate(date.getDate() + diff);
  return toDateIso(date);
}

function monthStartIso(month: string): string {
  return `${month}-01`;
}

function monthDayCount(month: string): number {
  const [year, mon] = month.split('-').map(Number);
  return new Date(year, mon, 0).getDate();
}

function buildDateCell(date: string, month: string, todayIso: string, holidaysMap: Record<string, string[]>): MonthCell {
  const weekday = fromIso(date).getDay();
  return {
    key: date,
    date,
    inMonth: date.slice(0, 7) === month,
    isWeekend: weekday === 0 || weekday === 6,
    isToday: date === todayIso,
    holidays: holidaysMap[date] ?? []
  };
}

function buildEmptyCell(month: string, index: number, position: 'leading' | 'trailing'): MonthCell {
  return {
    key: `${month}-${position}-${index}`,
    date: null,
    inMonth: false,
    isWeekend: false,
    isToday: false,
    holidays: []
  };
}

function buildRollingMonthGrid(month: string, holidaysMap: Record<string, string[]>, todayIso: string): MonthCell[] {
  const first = fromIso(monthStartIso(month));
  const isCurrentMonth = month === todayIso.slice(0, 7);
  const anchor = isCurrentMonth ? fromIso(todayIso) : first;
  const anchorIso = toDateIso(anchor);
  const mondayIndex = (anchor.getDay() + 6) % 7;
  const gridStart = addDays(anchorIso, -mondayIndex);

  return Array.from({ length: 42 }, (_, index) => (
    buildDateCell(addDays(gridStart, index), month, todayIso, holidaysMap)
  ));
}

function buildClosedMonthGrid(month: string, holidaysMap: Record<string, string[]>, todayIso: string): MonthCell[] {
  const first = fromIso(monthStartIso(month));
  const leadingEmptyCells = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: leadingEmptyCells }, (_, index) => buildEmptyCell(month, index, 'leading'));
  const daysInMonth = monthDayCount(month);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(buildDateCell(`${month}-${pad(day)}`, month, todayIso, holidaysMap));
  }

  const trailingEmptyCells = (7 - (cells.length % 7)) % 7;
  for (let index = 0; index < trailingEmptyCells; index += 1) {
    cells.push(buildEmptyCell(month, index, 'trailing'));
  }

  return cells;
}

export function buildMonthGrid(
  month: string,
  holidaysMap: Record<string, string[]>,
  options: BuildMonthGridOptions = {}
): MonthCell[] {
  const todayIso = options.todayIso ?? toDateIso(new Date());
  if (options.mode === 'month') {
    return buildClosedMonthGrid(month, holidaysMap, todayIso);
  }
  return buildRollingMonthGrid(month, holidaysMap, todayIso);
}
