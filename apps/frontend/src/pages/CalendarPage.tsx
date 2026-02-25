import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import type { Cohort, Module } from '../types';
import { StatusChip } from '../components/StatusChip';
import { Section } from '../components/Section';
import { statusLabel } from '../utils/labels';

type BlockDraft = {
  key: string;
  module_id: string;
  duration_days: number;
};

type MonthCell = {
  date: string;
  inMonth: boolean;
  isWeekend: boolean;
  isToday: boolean;
  holidays: string[];
};

type CohortCalendarOccurrence = Cohort & {
  calendar_date: string;
  day_index: number;
  total_business_days: number;
};
type DaySortKey = 'name' | 'technician_name' | 'participant_names' | 'status';
type SortDirection = 'asc' | 'desc';

const statuses = ['Planejada', 'Aguardando_quorum', 'Confirmada', 'Concluida', 'Cancelada'];
const periodOptions = ['Integral', 'Meio_periodo'] as const;
const deliveryModeOptions = ['Online', 'Presencial', 'Hibrida'] as const;
const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const fixedBrazilHolidays = [
  { monthDay: '01-01', name: 'Confraternização Universal' },
  { monthDay: '04-21', name: 'Tiradentes' },
  { monthDay: '05-01', name: 'Dia do Trabalho' },
  { monthDay: '09-07', name: 'Independência do Brasil' },
  { monthDay: '10-12', name: 'Nossa Senhora Aparecida' },
  { monthDay: '11-02', name: 'Finados' },
  { monthDay: '11-15', name: 'Proclamação da República' },
  { monthDay: '11-20', name: 'Dia da Consciência Negra' },
  { monthDay: '12-25', name: 'Natal' }
];

function randomKey() {
  return Math.random().toString(36).slice(2, 10);
}

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

function isWeekendDate(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function normalizeToBusinessDay(dateIso: string): string {
  const date = fromIso(dateIso);
  while (isWeekendDate(date)) {
    date.setDate(date.getDate() + 1);
  }
  return toDateIso(date);
}

function addBusinessDays(startDateIso: string, offset: number): string {
  const date = fromIso(normalizeToBusinessDay(startDateIso));
  let moved = 0;
  while (moved < offset) {
    date.setDate(date.getDate() + 1);
    if (!isWeekendDate(date)) {
      moved += 1;
    }
  }
  return toDateIso(date);
}

function monthStartIso(month: string): string {
  return `${month}-01`;
}

function monthLabel(month: string): string {
  const date = fromIso(`${month}-01`);
  const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fullDateLabel(dateIso: string): string {
  const label = fromIso(dateIso).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function prevMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(year, mon - 2, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function nextMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(year, mon, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function calculateEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function buildBrazilHolidayMap(year: number): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  const pushHoliday = (dateIso: string, name: string) => {
    map[dateIso] = map[dateIso] ?? [];
    map[dateIso].push(name);
  };

  fixedBrazilHolidays.forEach((holiday) => {
    pushHoliday(`${year}-${holiday.monthDay}`, holiday.name);
  });

  const easterIso = toDateIso(calculateEasterSunday(year));
  pushHoliday(addDays(easterIso, -48), 'Carnaval (segunda-feira)');
  pushHoliday(addDays(easterIso, -47), 'Carnaval (terça-feira)');
  pushHoliday(addDays(easterIso, -2), 'Sexta-feira Santa');
  pushHoliday(easterIso, 'Páscoa');
  pushHoliday(addDays(easterIso, 60), 'Corpus Christi');

  return map;
}

function buildMonthGrid(month: string, holidaysMap: Record<string, string[]>): MonthCell[] {
  const start = monthStartIso(month);
  const first = fromIso(start);
  const jsWeekday = first.getDay();
  const mondayIndex = (jsWeekday + 6) % 7;
  const gridStart = addDays(start, -mondayIndex);
  const todayIso = toDateIso(new Date());

  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(gridStart, i);
    const weekday = fromIso(date).getDay();
    cells.push({
      date,
      inMonth: date.slice(0, 7) === month,
      isWeekend: weekday === 0 || weekday === 6,
      isToday: date === todayIso,
      holidays: holidaysMap[date] ?? []
    });
  }

  return cells;
}

function splitPipeList(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function collapseList(items: string[], max: number): string {
  if (items.length === 0) return '-';
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')} +${items.length - max}`;
}

function moduleShortLabel(name: string): string {
  return name
    .replace(/^Treinamento\s+/i, '')
    .replace(/^TopSolid'?/i, 'TopSolid')
    .trim();
}

function moduleDurationById(modules: Module[], moduleId: string): number {
  const duration = modules.find((module) => module.id === moduleId)?.duration_days;
  return Math.max(1, Number(duration) || 1);
}

export function CalendarPage() {
  const [rows, setRows] = useState<Cohort[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [technicians, setTechnicians] = useState<Array<{ id: string; name: string }>>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(toDateIso(new Date()));
  const [isDayPanelOpen, setIsDayPanelOpen] = useState(false);

  const [statusFilter, setStatusFilter] = useState('');
  const [technicianFilter, setTechnicianFilter] = useState('');
  const [message, setMessage] = useState('');
  const [daySortKey, setDaySortKey] = useState<DaySortKey>('name');
  const [daySortDirection, setDaySortDirection] = useState<SortDirection>('asc');

  const [code, setCode] = useState('');
  const [name, setName] = useState('Nova turma');
  const [technicianId, setTechnicianId] = useState('');
  const [capacity, setCapacity] = useState(8);
  const [status, setStatus] = useState('Planejada');
  const [period, setPeriod] = useState<(typeof periodOptions)[number]>('Integral');
  const [deliveryMode, setDeliveryMode] = useState<(typeof deliveryModeOptions)[number]>('Online');
  const [notes, setNotes] = useState('');
  const [blocks, setBlocks] = useState<BlockDraft[]>([]);
  const [isCheckingTechnicianConflict, setIsCheckingTechnicianConflict] = useState(false);
  const [hasTechnicianConflict, setHasTechnicianConflict] = useState(false);
  const [technicianConflictMessage, setTechnicianConflictMessage] = useState('');
  const [technicianConflictCohortId, setTechnicianConflictCohortId] = useState<string | null>(null);

  async function loadAll() {
    const [calendarRows, modulesRows, techRows] = await Promise.all([
      api.calendar(),
      api.modules(),
      api.technicians()
    ]);
    setRows(calendarRows as Cohort[]);
    setModules(modulesRows as Module[]);
    setTechnicians(techRows as Array<{ id: string; name: string }>);
    return {
      rows: calendarRows as Cohort[],
      modules: modulesRows as Module[]
    };
  }

  useEffect(() => {
    loadAll().then(({ rows: loadedRows, modules: loadedModules }) => {
      const next = loadedRows.length + 1;
      setCode(`TUR-${String(next).padStart(3, '0')}`);
      if (loadedModules.length > 0) {
        setBlocks([
          {
            key: randomKey(),
            module_id: loadedModules[0].id,
            duration_days: moduleDurationById(loadedModules, loadedModules[0].id)
          }
        ]);
      }
    }).catch(() => {
      setRows([]);
      setModules([]);
      setTechnicians([]);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    api.cohortById(selectedId).then(setDetail).catch(() => setDetail(null));
  }, [selectedId]);

  useEffect(() => {
    if (!isDayPanelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDayPanelOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDayPanelOpen]);

  const filteredRows = useMemo(() => {
    return rows.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (technicianFilter && item.technician_name !== technicianFilter) return false;
      return true;
    });
  }, [rows, statusFilter, technicianFilter]);

  const eventsByDate = useMemo(() => {
    return filteredRows.reduce<Record<string, CohortCalendarOccurrence[]>>((acc, item) => {
      const totalBusinessDays = Math.max(1, Number(item.total_duration_days) || 1);
      for (let dayIndex = 1; dayIndex <= totalBusinessDays; dayIndex += 1) {
        const calendarDate = addBusinessDays(item.start_date, dayIndex - 1);
        acc[calendarDate] = acc[calendarDate] ?? [];
        acc[calendarDate].push({
          ...item,
          calendar_date: calendarDate,
          day_index: dayIndex,
          total_business_days: totalBusinessDays
        });
      }
      return acc;
    }, {});
  }, [filteredRows]);

  const holidaysMap = useMemo(
    () => buildBrazilHolidayMap(Number(month.slice(0, 4))),
    [month]
  );

  const holidaysInMonth = useMemo(() => {
    return Object.entries(holidaysMap)
      .filter(([date]) => date.slice(0, 7) === month)
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([date, names]) => names.map((holidayName) => ({ date, holidayName })));
  }, [holidaysMap, month]);

  const monthCells = useMemo(() => buildMonthGrid(month, holidaysMap), [month, holidaysMap]);

  const monthMetrics = useMemo(() => {
    const monthDates = Object.keys(eventsByDate).filter((date) => date.slice(0, 7) === month);
    const totalOccurrences = monthDates.reduce((sum, date) => sum + (eventsByDate[date]?.length ?? 0), 0);
    const activeCohortIds = new Set<string>();
    const activeTechnicians = new Set<string>();

    monthDates.forEach((date) => {
      (eventsByDate[date] ?? []).forEach((event) => {
        activeCohortIds.add(event.id);
        if (event.technician_name) activeTechnicians.add(event.technician_name);
      });
    });

    const monthBusinessDays = monthCells.filter((cell) => cell.inMonth && !cell.isWeekend).length;
    const busyBusinessDays = monthCells.filter(
      (cell) => cell.inMonth && !cell.isWeekend && (eventsByDate[cell.date]?.length ?? 0) > 0
    ).length;

    return {
      totalOccurrences,
      activeCohorts: activeCohortIds.size,
      activeTechnicians: activeTechnicians.size,
      monthBusinessDays,
      busyBusinessDays
    };
  }, [eventsByDate, month, monthCells]);

  const selectedDayEvents = useMemo(() => {
    const direction = daySortDirection === 'asc' ? 1 : -1;
    return [...(eventsByDate[selectedDate] ?? [])].sort((a, b) => {
      switch (daySortKey) {
        case 'name': {
          const compare = String(a.name ?? '').localeCompare(String(b.name ?? ''));
          if (compare !== 0) return compare * direction;
          break;
        }
        case 'technician_name': {
          const compare = String(a.technician_name ?? '').localeCompare(String(b.technician_name ?? ''));
          if (compare !== 0) return compare * direction;
          break;
        }
        case 'participant_names': {
          const leftCount = splitPipeList(a.participant_names).length;
          const rightCount = splitPipeList(b.participant_names).length;
          if (leftCount !== rightCount) return (leftCount - rightCount) * direction;
          break;
        }
        case 'status': {
          const compare = String(a.status ?? '').localeCompare(String(b.status ?? ''));
          if (compare !== 0) return compare * direction;
          break;
        }
        default:
          break;
      }
      if (a.code === b.code) return a.day_index - b.day_index;
      return a.code.localeCompare(b.code);
    });
  }, [eventsByDate, selectedDate, daySortKey, daySortDirection]);

  const statusOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.status))).sort(), [rows]);
  const technicianOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.technician_name).filter(Boolean) as string[])).sort(),
    [rows]
  );
  const createBlocksPreview = useMemo(() => {
    let day = 1;
    return blocks.map((block, index) => {
      const duration = Math.max(1, Number(block.duration_days) || 1);
      const result = {
        module_id: block.module_id,
        order_in_cohort: index + 1,
        start_day_offset: day,
        duration_days: duration
      };
      day += duration;
      return result;
    });
  }, [blocks]);

  function addBlock() {
    const fallbackModuleId = modules[0]?.id ?? '';
    setBlocks((prev) => [
      ...prev,
      {
        key: randomKey(),
        module_id: fallbackModuleId,
        duration_days: moduleDurationById(modules, fallbackModuleId)
      }
    ]);
  }

  function toggleDaySort(nextKey: DaySortKey) {
    if (daySortKey === nextKey) {
      setDaySortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setDaySortKey(nextKey);
    setDaySortDirection('asc');
  }

  function daySortIndicator(nextKey: DaySortKey) {
    if (daySortKey !== nextKey) return '';
    return daySortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  function updateBlock(key: string, patch: Partial<BlockDraft>) {
    setBlocks((prev) => prev.map((block) => (block.key === key ? { ...block, ...patch } : block)));
  }

  function removeBlock(key: string) {
    setBlocks((prev) => prev.filter((block) => block.key !== key));
  }

  function payloadBlocks() {
    return createBlocksPreview;
  }

  function openDayPanel(date: string) {
    setSelectedDate(date);
    setSelectedId(null);
    setDetail(null);
    setIsDayPanelOpen(true);
  }

  function openCohort(event: CohortCalendarOccurrence, date: string) {
    setSelectedId(event.id);
    setSelectedDate(date);
    setIsDayPanelOpen(true);
  }

  useEffect(() => {
    if (!technicianId || status === 'Cancelada' || createBlocksPreview.length === 0) {
      setIsCheckingTechnicianConflict(false);
      setHasTechnicianConflict(false);
      setTechnicianConflictMessage('');
      setTechnicianConflictCohortId(null);
      return;
    }

    let active = true;
    setIsCheckingTechnicianConflict(true);
    api.checkTechnicianConflict({
      technician_id: technicianId,
      start_date: selectedDate,
      status,
      blocks: createBlocksPreview
    }).then((response: any) => {
      if (!active) return;
      if (response.has_conflict) {
        setHasTechnicianConflict(true);
        setTechnicianConflictMessage(response.message ?? 'Conflito de agenda detectado para o técnico.');
        setTechnicianConflictCohortId(response.conflict?.cohort_id ?? null);
      } else {
        setHasTechnicianConflict(false);
        setTechnicianConflictMessage('');
        setTechnicianConflictCohortId(null);
      }
    }).catch(() => {
      if (!active) return;
      setHasTechnicianConflict(false);
      setTechnicianConflictMessage('Não foi possível validar a agenda agora. O bloqueio será aplicado ao salvar.');
      setTechnicianConflictCohortId(null);
    }).finally(() => {
      if (active) setIsCheckingTechnicianConflict(false);
    });

    return () => {
      active = false;
    };
  }, [technicianId, selectedDate, status, createBlocksPreview]);

  async function createCohortOnSelectedDay() {
    if (!selectedDate) return;
    if (!code.trim() || !name.trim()) {
      setMessage('Preencha código e nome da turma.');
      return;
    }

    if (blocks.length === 0 || blocks.some((block) => !block.module_id)) {
      setMessage('Selecione ao menos um bloco de módulo válido.');
      return;
    }

    const uniqueModules = new Set(blocks.map((block) => block.module_id));
    if (uniqueModules.size !== blocks.length) {
      setMessage('Não repita o mesmo módulo na turma.');
      return;
    }
    if (isCheckingTechnicianConflict) {
      setMessage('Aguarde a validação da agenda do técnico.');
      return;
    }
    if (hasTechnicianConflict) {
      setMessage(technicianConflictMessage || 'Conflito de agenda detectado para o técnico.');
      return;
    }

    try {
      await api.createCohort({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        start_date: selectedDate,
        technician_id: technicianId || null,
        status,
        capacity_companies: Math.max(1, Number(capacity) || 1),
        period,
        delivery_mode: deliveryMode,
        notes: notes.trim() || null,
        blocks: payloadBlocks()
      });

      setMessage('Turma criada no calendário.');
      const refreshed = await loadAll();
      const next = refreshed.rows.length + 1;
      setCode(`TUR-${String(next).padStart(3, '0')}`);
      setName('Nova turma');
      setNotes('');
      setTechnicianId('');
      setCapacity(8);
      setStatus('Planejada');
      setPeriod('Integral');
      setDeliveryMode('Online');
      if (refreshed.modules.length > 0) {
        setBlocks([
          {
            key: randomKey(),
            module_id: refreshed.modules[0].id,
            duration_days: moduleDurationById(refreshed.modules, refreshed.modules[0].id)
          }
        ]);
      }
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  return (
    <div className="page calendar-page">
      <header className="page-header">
        <h1>Calendário Operacional de Turmas</h1>
        <p>Visão mensal ampla com feriados do Brasil. Clique no dia para abrir o painel expandido.</p>
      </header>
      {message ? <p className="info">{message}</p> : null}

      <Section title="Controles do calendário" className="calendar-controls-panel">
        <div className="calendar-toolbar">
          <div className="calendar-toolbar-main">
            <h3 className="month-title">{monthLabel(month)}</h3>
            <div className="actions">
              <button type="button" onClick={() => setMonth(prevMonth(month))}>Mês anterior</button>
              <button
                type="button"
                onClick={() => {
                  const currentMonth = new Date().toISOString().slice(0, 7);
                  const today = toDateIso(new Date());
                  setMonth(currentMonth);
                  setSelectedDate(today);
                  setIsDayPanelOpen(true);
                }}
              >
                Hoje
              </button>
              <button type="button" onClick={() => setMonth(nextMonth(month))}>Próximo mês</button>
              <button type="button" onClick={() => setIsDayPanelOpen(true)}>
                Abrir painel do dia {selectedDate}
              </button>
            </div>
          </div>
          <div className="calendar-toolbar-filters">
            <label className="calendar-filter-field">
              Ir para mês
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            </label>
            <label className="calendar-filter-field">
              Técnico
              <select value={technicianFilter} onChange={(event) => setTechnicianFilter(event.target.value)}>
                <option value="">Todos</option>
                {technicianOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="calendar-filter-field">
              Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">Todos</option>
                {statusOptions.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
              </select>
            </label>
          </div>

          <div className="calendar-metrics-grid">
            <article className="calendar-metric-card">
              <span>Turmas ativas no mês</span>
              <strong>{monthMetrics.activeCohorts}</strong>
            </article>
            <article className="calendar-metric-card">
              <span>Ocupações em dias úteis</span>
              <strong>{monthMetrics.totalOccurrences}</strong>
            </article>
            <article className="calendar-metric-card">
              <span>Dias úteis com turma</span>
              <strong>{monthMetrics.busyBusinessDays}/{monthMetrics.monthBusinessDays}</strong>
            </article>
            <article className="calendar-metric-card">
              <span>Técnicos em agenda</span>
              <strong>{monthMetrics.activeTechnicians}</strong>
            </article>
          </div>
        </div>

        <div className="calendar-holidays-bar">
          <strong>Feriados do mês</strong>
          {holidaysInMonth.length === 0 ? <span>Nenhum feriado nacional no período.</span> : (
            <div className="calendar-holidays-list">
              {holidaysInMonth.map((holiday) => (
                <span key={`${holiday.date}-${holiday.holidayName}`} className="calendar-holiday-pill">
                  {holiday.date.slice(-2)}/{holiday.date.slice(5, 7)} · {holiday.holidayName}
                </span>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title="Visão mensal" className="calendar-month-panel">
        <div className="calendar-grid-head">
          {weekDays.map((day) => <div key={day} className="calendar-head-cell">{day}</div>)}
        </div>

        <div className="calendar-grid-body">
          {monthCells.map((cell) => {
            const events = (eventsByDate[cell.date] ?? []).sort((a, b) => {
              if (a.code === b.code) return a.day_index - b.day_index;
              return a.code.localeCompare(b.code);
            });
            const isSelected = selectedDate === cell.date;
            const hasHoliday = cell.holidays.length > 0;

            return (
              <div
                key={cell.date}
                className={`calendar-day-cell ${cell.inMonth ? '' : 'outside'} ${isSelected ? 'selected' : ''} ${cell.isWeekend ? 'weekend' : ''} ${hasHoliday ? 'holiday' : ''} ${cell.isToday ? 'today' : ''}`}
                onClick={() => openDayPanel(cell.date)}
                onKeyDown={(domEvent) => {
                  if (domEvent.key === 'Enter' || domEvent.key === ' ') {
                    domEvent.preventDefault();
                    openDayPanel(cell.date);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="calendar-day-top">
                  <span className="calendar-day-number">{Number(cell.date.slice(-2))}</span>
                  <small>{events.length} turma(s)</small>
                </div>

                {cell.holidays.slice(0, 1).map((holiday) => (
                  <div key={holiday} className="calendar-holiday-inline" title={holiday}>{holiday}</div>
                ))}

                <div className="calendar-day-events">
                  {events.slice(0, 3).map((event) => {
                    const participants = splitPipeList(event.participant_names);
                    const moduleNames = splitPipeList(event.module_names).map(moduleShortLabel);
                    return (
                      <div
                        key={`${event.id}-${event.day_index}`}
                        className="calendar-event-card"
                        onClick={(domEvent) => {
                          domEvent.stopPropagation();
                          openCohort(event, cell.date);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(domEvent) => {
                          if (domEvent.key === 'Enter' || domEvent.key === ' ') {
                            domEvent.preventDefault();
                            openCohort(event, cell.date);
                          }
                        }}
                      >
                        <p className="calendar-event-title" title={`${event.code} · ${event.name}`}>
                          {event.name}
                        </p>
                        <p className="calendar-event-meta">Técnico: {event.technician_name ?? '-'}</p>
                        <p className="calendar-event-meta">Dia {event.day_index}/{event.total_business_days}</p>
                        <p className="calendar-event-meta">
                          {statusLabel(event.delivery_mode ?? 'Online')} · {statusLabel(event.period ?? 'Integral')}
                        </p>
                        <p className="calendar-event-meta calendar-ops-only" title={collapseList(moduleNames, 10)}>
                          Módulos: {collapseList(moduleNames, 2)}
                        </p>
                        <p className="calendar-event-meta calendar-ops-only" title={collapseList(participants, 20)}>
                          Participantes: {collapseList(participants, 2)}
                        </p>
                      </div>
                    );
                  })}
                  {events.length > 3 ? <small className="calendar-more">+{events.length - 3} turma(s)</small> : null}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {isDayPanelOpen ? (
        <div className="calendar-overlay" role="dialog" aria-modal="true" aria-label={`Painel do dia ${selectedDate}`}>
          <button
            type="button"
            className="calendar-overlay-backdrop"
            onClick={() => setIsDayPanelOpen(false)}
            aria-label="Fechar painel"
          />

          <div className="calendar-overlay-panel">
            <header className="calendar-overlay-header">
              <div>
                <h2>{fullDateLabel(selectedDate)}</h2>
                <p>{selectedDayEvents.length} turma(s) neste dia</p>
              </div>
              <div className="actions">
                <button type="button" onClick={() => setIsDayPanelOpen(false)}>Fechar</button>
              </div>
            </header>

            <div className="calendar-overlay-grid">
              <section className="calendar-overlay-col">
                <h3>Turmas do dia</h3>
                {selectedDayEvents.length === 0 ? <p>Sem turmas neste dia.</p> : (
                  <table className="table table-hover table-tight">
                    <thead>
                      <tr>
                        <th><button type="button" className="table-sort-btn" onClick={() => toggleDaySort('name')}>Turma{daySortIndicator('name')}</button></th>
                        <th><button type="button" className="table-sort-btn" onClick={() => toggleDaySort('technician_name')}>Técnico{daySortIndicator('technician_name')}</button></th>
                        <th className="calendar-ops-only"><button type="button" className="table-sort-btn" onClick={() => toggleDaySort('participant_names')}>Participantes{daySortIndicator('participant_names')}</button></th>
                        <th><button type="button" className="table-sort-btn" onClick={() => toggleDaySort('status')}>Status{daySortIndicator('status')}</button></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDayEvents.map((event) => (
                        <tr
                          key={`${event.id}-${event.day_index}`}
                          onClick={() => setSelectedId(event.id)}
                          className={selectedId === event.id ? 'row-selected' : ''}
                        >
                          <td>{event.name} (dia {event.day_index}/{event.total_business_days})</td>
                          <td>{event.technician_name ?? '-'}</td>
                          <td className="calendar-ops-only" title={collapseList(splitPipeList(event.participant_names), 100)}>
                            {collapseList(splitPipeList(event.participant_names), 3)}
                          </td>
                          <td><StatusChip value={event.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div className="form-subcard">
                  {!detail ? <p>Clique em uma turma para abrir os detalhes completos.</p> : (
                    <div className="stack">
                      <p><strong>{detail.code} - {detail.name}</strong></p>
                      <p>Início: {detail.start_date} | Técnico: {detail.technician_name ?? '-'}</p>
                      <p>Formato: {statusLabel(detail.delivery_mode ?? 'Online')} · {statusLabel(detail.period ?? 'Integral')}</p>
                      <p>Capacidade: {detail.capacity_companies}</p>
                      <StatusChip value={detail.status} />

                      <h3>Linha do tempo de módulos</h3>
                      <table className="table table-tight">
                        <thead><tr><th>Ordem</th><th>Módulo</th><th>Início</th><th>Duração</th></tr></thead>
                        <tbody>
                          {detail.blocks.map((block: any) => (
                            <tr key={block.id}>
                              <td>{block.order_in_cohort}</td>
                              <td>{block.module_name}</td>
                              <td>Dia {block.start_day_offset}</td>
                              <td>{block.duration_days}d</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <h3>Participantes alocados</h3>
                      <table className="table table-tight">
                        <thead><tr><th>Empresa</th><th>Módulo</th><th>Dia de entrada</th><th>Status</th></tr></thead>
                        <tbody>
                          {detail.allocations.map((allocation: any) => (
                            <tr key={allocation.id}>
                              <td>{allocation.company_name}</td>
                              <td>{allocation.module_name ?? allocation.module_code}</td>
                              <td>{allocation.entry_day}</td>
                              <td><StatusChip value={allocation.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>

              <section className="calendar-overlay-col">
                <h3>Criar turma em {selectedDate}</h3>
                <div className="form form-spacious">
                  <label>Código<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} /></label>
                  <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} /></label>
                  <label>Técnico
                    <select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}>
                      <option value="">Sem técnico</option>
                      {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                    </select>
                  </label>
                  <label>Capacidade
                    <input
                      type="number"
                      min={1}
                      value={capacity}
                      onChange={(event) => setCapacity(Math.max(1, Number(event.target.value) || 1))}
                    />
                  </label>
                  <label>Status
                    <select value={status} onChange={(event) => setStatus(event.target.value)}>
                      {statuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
                    </select>
                  </label>
                  <label>Período
                    <select value={period} onChange={(event) => setPeriod(event.target.value as (typeof periodOptions)[number])}>
                      {periodOptions.map((option) => (
                        <option key={option} value={option}>{statusLabel(option)}</option>
                      ))}
                    </select>
                  </label>
                  <label>Formato
                    <select value={deliveryMode} onChange={(event) => setDeliveryMode(event.target.value as (typeof deliveryModeOptions)[number])}>
                      {deliveryModeOptions.map((option) => (
                        <option key={option} value={option}>{statusLabel(option)}</option>
                      ))}
                    </select>
                  </label>
                  {technicianId && status !== 'Cancelada' ? (
                    <div className="form-subcard">
                      {isCheckingTechnicianConflict ? (
                        <p className="muted">Verificando conflito de agenda do técnico...</p>
                      ) : hasTechnicianConflict ? (
                        <div className="stack">
                          <p className="error">{technicianConflictMessage}</p>
                          {technicianConflictCohortId ? (
                            <button type="button" onClick={() => setSelectedId(technicianConflictCohortId)}>
                              Abrir turma conflitante
                            </button>
                          ) : null}
                        </div>
                      ) : technicianConflictMessage ? (
                        <p className="warn-text">{technicianConflictMessage}</p>
                      ) : (
                        <p className="ok-text">Agenda do técnico disponível para esta turma.</p>
                      )}
                    </div>
                  ) : null}
                  <label>Observações
                    <input value={notes} onChange={(event) => setNotes(event.target.value)} />
                  </label>

                  <h3>Blocos da turma</h3>
                  <p className="muted">Ao escolher o módulo, a diária inicial já puxa o valor configurado no Admin.</p>
                  <div className="stack">
                    {blocks.map((block, index) => (
                      <div key={block.key} className="form form-subcard">
                        <strong>Bloco {index + 1}</strong>
                        <label>Módulo
                          <select
                            value={block.module_id}
                            onChange={(event) => {
                              const nextModuleId = event.target.value;
                              updateBlock(block.key, {
                                module_id: nextModuleId,
                                duration_days: moduleDurationById(modules, nextModuleId)
                              });
                            }}
                          >
                            {modules.map((module) => (
                              <option key={module.id} value={module.id}>{module.name}</option>
                            ))}
                          </select>
                        </label>
                        <label>Diárias
                          <input
                            type="number"
                            min={1}
                            value={block.duration_days}
                            onChange={(event) => {
                              updateBlock(block.key, {
                                duration_days: Math.max(1, Number(event.target.value) || 1)
                              });
                            }}
                          />
                        </label>
                        <button type="button" onClick={() => removeBlock(block.key)} disabled={blocks.length <= 1}>
                          Remover bloco
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={addBlock}>Adicionar bloco</button>
                  </div>

                  <button type="button" onClick={createCohortOnSelectedDay} disabled={isCheckingTechnicianConflict || hasTechnicianConflict}>
                    Criar turma em {selectedDate}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
