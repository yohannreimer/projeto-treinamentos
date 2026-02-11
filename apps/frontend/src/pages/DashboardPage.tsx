import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import type { DashboardResponse } from '../types';
import { KpiCard } from '../components/KpiCard';
import { Section } from '../components/Section';

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moduleQuery, setModuleQuery] = useState('');
  const [techQuery, setTechQuery] = useState('');

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
            <thead><tr><th>Módulo</th><th>Pendências</th><th>Prontas</th><th></th></tr></thead>
            <tbody>
              {pendingRows.map((row) => (
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
            <thead><tr><th>Técnico</th><th>Turmas no mês</th></tr></thead>
            <tbody>
              {techRows.map((row) => (
                <tr key={row.id}><td>{row.name}</td><td>{row.cohorts_in_month}</td></tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  );
}
