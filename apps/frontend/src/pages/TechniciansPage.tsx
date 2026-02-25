import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { Section } from '../components/Section';
import { StatusChip } from '../components/StatusChip';
import { askDestructiveConfirmation } from '../utils/destructive';

function monthRange(month: string) {
  const [year, mon] = month.split('-').map(Number);
  const first = `${month}-01`;
  const lastDate = new Date(year, mon, 0).getDate();
  const last = `${month}-${String(lastDate).padStart(2, '0')}`;
  return { first, last };
}

function moduleShortLabel(name: string): string {
  return name
    .replace(/^Treinamento\s+/i, '')
    .replace(/^TopSolid'?/i, 'TopSolid')
    .trim();
}

type TechSortKey = 'name' | 'monthly_load';
type TechCalendarSortKey = 'start_date' | 'code' | 'occupancy' | 'status';

export function TechniciansPage() {
  const [techs, setTechs] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [calendarRows, setCalendarRows] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [sortKey, setSortKey] = useState<TechSortKey>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [calendarSortKey, setCalendarSortKey] = useState<TechCalendarSortKey>('start_date');
  const [calendarSortDirection, setCalendarSortDirection] = useState<'asc' | 'desc'>('asc');

  async function loadBase() {
    const [technicianRows, moduleRows] = await Promise.all([api.technicians(), api.modules()]);
    const normalizedTechs = technicianRows as any[];
    setTechs(normalizedTechs);
    setModules(moduleRows as any[]);
    if (normalizedTechs.length > 0) {
      setSelectedId((prev) => prev || normalizedTechs[0].id);
    }
  }

  async function loadCalendar(technicianId: string, monthValue: string) {
    if (!technicianId) return;
    const range = monthRange(monthValue);
    const response = await api.technicianCalendar(technicianId, {
      date_from: range.first,
      date_to: range.last
    }) as any;
    setCalendarRows(response.cohorts ?? []);
  }

  useEffect(() => {
    loadBase().catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    const selected = techs.find((item) => item.id === selectedId);
    const normalizedSkills = (selected?.skills ?? [])
      .map((skill: any) => {
        const module = modules.find((moduleItem) => moduleItem.code === skill.code);
        return module?.id;
      })
      .filter(Boolean);
    setSelectedSkills(normalizedSkills);
  }, [selectedId, techs, modules]);

  useEffect(() => {
    if (!selectedId) return;
    loadCalendar(selectedId, month).catch(() => setCalendarRows([]));
  }, [selectedId, month]);

  const selectedTech = useMemo(
    () => techs.find((item) => item.id === selectedId),
    [techs, selectedId]
  );

  const sortedTechs = useMemo(() => {
    const rows = [...techs];
    rows.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      if (sortKey === 'monthly_load') {
        return (Number(a.monthly_load ?? 0) - Number(b.monthly_load ?? 0)) * direction;
      }
      return String(a.name ?? '').localeCompare(String(b.name ?? '')) * direction;
    });
    return rows;
  }, [techs, sortKey, sortDirection]);

  const sortedCalendarRows = useMemo(() => {
    const rows = [...calendarRows];
    rows.sort((a, b) => {
      const direction = calendarSortDirection === 'asc' ? 1 : -1;
      if (calendarSortKey === 'start_date') {
        return String(a.start_date ?? '').localeCompare(String(b.start_date ?? '')) * direction;
      }
      if (calendarSortKey === 'occupancy') {
        return ((Number(a.occupancy ?? 0) - Number(b.occupancy ?? 0)) * direction);
      }
      if (calendarSortKey === 'code') {
        return String(a.code ?? '').localeCompare(String(b.code ?? '')) * direction;
      }
      return String(a.status ?? '').localeCompare(String(b.status ?? '')) * direction;
    });
    return rows;
  }, [calendarRows, calendarSortKey, calendarSortDirection]);

  function toggleSort(nextKey: TechSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'name' ? 'asc' : 'desc');
  }

  function toggleCalendarSort(nextKey: TechCalendarSortKey) {
    if (calendarSortKey === nextKey) {
      setCalendarSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setCalendarSortKey(nextKey);
    setCalendarSortDirection(nextKey === 'start_date' ? 'asc' : 'desc');
  }

  function sortIndicator(nextKey: TechSortKey) {
    if (sortKey !== nextKey) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  function calendarSortIndicator(nextKey: TechCalendarSortKey) {
    if (calendarSortKey !== nextKey) return '';
    return calendarSortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  function toggleModule(moduleId: string) {
    setSelectedSkills((prev) => (prev.includes(moduleId)
      ? prev.filter((id) => id !== moduleId)
      : [...prev, moduleId]));
  }

  async function saveSkills() {
    if (!selectedId) return;
    setError('');
    setMessage('');
    try {
      await api.updateTechnicianSkills(selectedId, { module_ids: selectedSkills });
      setMessage('Capacitações atualizadas.');
      await loadBase();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function createTechnician() {
    if (!newName.trim()) {
      setError('Informe o nome do técnico.');
      return;
    }
    setError('');
    setMessage('');
    try {
      const response = await api.createTechnician({
        name: newName.trim(),
        availability_notes: newNotes.trim() || null
      }) as any;
      setNewName('');
      setNewNotes('');
      setMessage('Técnico adicionado com sucesso.');
      await loadBase();
      if (response?.id) {
        setSelectedId(response.id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteSelectedTechnician() {
    if (!selectedTech) return;
    const confirmationPhrase = askDestructiveConfirmation(`Excluir técnico "${selectedTech.name}"`);
    if (!confirmationPhrase) {
      setMessage('Ação cancelada.');
      return;
    }
    setError('');
    setMessage('');
    try {
      await api.deleteTechnician(selectedTech.id, confirmationPhrase);
      setMessage('Técnico excluído com sucesso.');
      setSelectedId('');
      await loadBase();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="page">
      <header className="page-header"><h1>Técnicos</h1></header>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}

      <Section title="Adicionar técnico">
        <div className="form">
          <label>
            Nome
            <input value={newName} onChange={(event) => setNewName(event.target.value)} />
          </label>
          <label>
            Observações de disponibilidade
            <input value={newNotes} onChange={(event) => setNewNotes(event.target.value)} />
          </label>
          <button type="button" onClick={createTechnician}>Adicionar técnico</button>
        </div>
      </Section>

      <div className="two-col">
        <Section title="Lista e carga">
          <table className="table">
            <thead><tr>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('name')}>Nome{sortIndicator('name')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('monthly_load')}>Carga no mês{sortIndicator('monthly_load')}</button></th>
              <th>Capacitações</th>
            </tr></thead>
            <tbody>
              {sortedTechs.map((tech) => (
                <tr key={tech.id} onClick={() => setSelectedId(tech.id)} className={selectedId === tech.id ? 'row-selected' : ''}>
                  <td>{tech.name}</td>
                  <td>{tech.monthly_load}</td>
                  <td>{(tech.skills ?? []).map((skill: any) => skill.name).join(', ') || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Editar capacitações">
          <p><strong>Técnico selecionado:</strong> {selectedTech?.name ?? '-'}</p>
          <div className="check-grid">
            {modules.map((module) => (
              <label key={module.id}>
                <input
                  type="checkbox"
                  checked={selectedSkills.includes(module.id)}
                  onChange={() => toggleModule(module.id)}
                />
                {module.name}
              </label>
            ))}
          </div>
          <div className="actions">
            <button type="button" onClick={saveSkills}>Salvar capacitações</button>
            <button type="button" onClick={deleteSelectedTechnician} disabled={!selectedTech}>Excluir técnico</button>
          </div>
        </Section>
      </div>

      <Section title="Calendário individual do técnico">
        <div className="actions">
          <label>
            Mês
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
        </div>
        {calendarRows.length === 0 ? <p>Sem turmas para este técnico no período.</p> : (
          <table className="table">
            <thead><tr>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleCalendarSort('start_date')}>Data{calendarSortIndicator('start_date')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleCalendarSort('code')}>Turma{calendarSortIndicator('code')}</button></th>
              <th>Blocos</th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleCalendarSort('occupancy')}>Ocupação{calendarSortIndicator('occupancy')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleCalendarSort('status')}>Status{calendarSortIndicator('status')}</button></th>
            </tr></thead>
            <tbody>
              {sortedCalendarRows.map((cohort) => (
                <tr key={cohort.id}>
                  <td>{cohort.start_date}</td>
                  <td>{cohort.code} - {cohort.name}</td>
                  <td>
                    {(cohort.blocks ?? [])
                      .sort((a: any, b: any) => a.order_in_cohort - b.order_in_cohort)
                      .map((block: any) => {
                        const label = block.module_name ? moduleShortLabel(block.module_name) : block.module_code;
                        return `${block.order_in_cohort}. ${label}`;
                      })
                      .join(' | ') || '-'}
                  </td>
                  <td>{cohort.occupancy}/{cohort.capacity_companies}</td>
                  <td><StatusChip value={cohort.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
