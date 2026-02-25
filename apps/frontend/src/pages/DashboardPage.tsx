import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import type { DashboardResponse } from '../types';
import { KpiCard } from '../components/KpiCard';
import { Section } from '../components/Section';
type PendingSortKey = 'name' | 'pending' | 'ready';
type TechSortKey = 'name' | 'cohorts_in_month';

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moduleQuery, setModuleQuery] = useState('');
  const [techQuery, setTechQuery] = useState('');
  const [pendingSortKey, setPendingSortKey] = useState<PendingSortKey>('pending');
  const [pendingSortDirection, setPendingSortDirection] = useState<'asc' | 'desc'>('desc');
  const [techSortKey, setTechSortKey] = useState<TechSortKey>('cohorts_in_month');
  const [techSortDirection, setTechSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    api.dashboard().then(setData).catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Carregando dashboard...</p>;

  const pendingRows = data.pending_by_module.filter((row) =>
    `${row.code} ${row.name}`.toLowerCase().includes(moduleQuery.toLowerCase())
  );
  const techRows = data.load_by_technician.filter((row) =>
    row.name.toLowerCase().includes(techQuery.toLowerCase())
  );

  const orderedPendingRows = [...pendingRows].sort((a, b) => {
    const direction = pendingSortDirection === 'asc' ? 1 : -1;
    if (pendingSortKey === 'pending' || pendingSortKey === 'ready') {
      return ((a[pendingSortKey] - b[pendingSortKey]) * direction);
    }
    return `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`) * direction;
  });

  const orderedTechRows = [...techRows].sort((a, b) => {
    const direction = techSortDirection === 'asc' ? 1 : -1;
    if (techSortKey === 'cohorts_in_month') {
      return (a.cohorts_in_month - b.cohorts_in_month) * direction;
    }
    return a.name.localeCompare(b.name) * direction;
  });

  function togglePendingSort(nextKey: PendingSortKey) {
    if (pendingSortKey === nextKey) {
      setPendingSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setPendingSortKey(nextKey);
    setPendingSortDirection(nextKey === 'name' ? 'asc' : 'desc');
  }

  function toggleTechSort(nextKey: TechSortKey) {
    if (techSortKey === nextKey) {
      setTechSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setTechSortKey(nextKey);
    setTechSortDirection(nextKey === 'name' ? 'asc' : 'desc');
  }

  function sortIndicator(activeKey: string, currentKey: string, direction: 'asc' | 'desc') {
    if (activeKey !== currentKey) return '';
    return direction === 'asc' ? ' ↑' : ' ↓';
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Dashboard Operacional</h1>
      </header>

      <div className="kpi-grid">
        <KpiCard title="Turmas em aberto" value={data.cards.open_cohorts} />
        <KpiCard title="Próximas turmas (7 dias)" value={data.cards.next_7_days} />
        <KpiCard title="Turmas sem quórum" value={data.cards.cohorts_without_quorum} />
        <KpiCard title="Clientes travados (MOD-01)" value={data.cards.blocked_by_installation} />
      </div>

      <div className="two-col">
        <Section title="Pendências por módulo" action={
          <input
            placeholder="Filtrar módulo"
            value={moduleQuery}
            onChange={(e) => setModuleQuery(e.target.value)}
          />
        }>
          <table className="table">
            <thead><tr>
              <th><button type="button" className="table-sort-btn" onClick={() => togglePendingSort('name')}>Módulo{sortIndicator('name', pendingSortKey, pendingSortDirection)}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => togglePendingSort('pending')}>Pendências{sortIndicator('pending', pendingSortKey, pendingSortDirection)}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => togglePendingSort('ready')}>Prontas{sortIndicator('ready', pendingSortKey, pendingSortDirection)}</button></th>
              <th></th>
            </tr></thead>
            <tbody>
              {orderedPendingRows.map((row) => (
                <tr key={row.code}>
                  <td>{row.code} - {row.name}</td>
                  <td>{row.pending}</td>
                  <td>{row.ready}</td>
                  <td>
                    <Link to={`/turmas?module=${encodeURIComponent(row.code)}`}>Criar turma</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Gargalo por técnico" action={
          <input
            placeholder="Filtrar técnico"
            value={techQuery}
            onChange={(e) => setTechQuery(e.target.value)}
          />
        }>
          <table className="table">
            <thead><tr>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleTechSort('name')}>Técnico{sortIndicator('name', techSortKey, techSortDirection)}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleTechSort('cohorts_in_month')}>Turmas no mês{sortIndicator('cohorts_in_month', techSortKey, techSortDirection)}</button></th>
            </tr></thead>
            <tbody>
              {orderedTechRows.map((row) => (
                <tr key={row.id}><td>{row.name}</td><td>{row.cohorts_in_month}</td></tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  );
}
