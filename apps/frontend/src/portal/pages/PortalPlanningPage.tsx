import { useEffect, useState } from 'react';
import type { PortalAuthedApi, PortalPlanningItem } from '../types';

type PortalPlanningPageProps = {
  api: PortalAuthedApi;
};

function planningStatusTone(status: string) {
  if (status === 'Concluido') return 'is-success';
  if (status === 'Em_execucao' || status === 'Em_andamento') return 'is-progress';
  return 'is-muted';
}

function planningStatusLabel(status: string) {
  if (status === 'Concluido') return 'Concluído';
  if (status === 'Em_execucao' || status === 'Em_andamento') return 'Em andamento';
  return 'Não iniciado';
}

function formatDateBr(dateIso: string | null) {
  if (!dateIso) return '-';
  const [year, month, day] = dateIso.split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function formatDateListBr(values: string[] | undefined) {
  if (!values || values.length === 0) return '';
  return values.slice(0, 3).map((value) => formatDateBr(value)).join(' · ');
}

export function PortalPlanningPage({ api }: PortalPlanningPageProps) {
  const [items, setItems] = useState<PortalPlanningItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.planning()
      .then((response) => {
        if (!mounted) return;
        setItems(response.items ?? []);
        setError('');
      })
      .catch((loadError) => {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar planejamento.');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [api]);

  if (loading) return <p>Carregando planejamento...</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <section className="portal-panel">
      <header className="portal-panel-header">
        <h2>Planejamento</h2>
        <p>Acompanhe os módulos previstos, concluídos e em andamento com leitura rápida por status.</p>
      </header>
      {items.length === 0 ? (
        <div className="portal-empty-state">
          <strong>Nenhum módulo disponível no planejamento.</strong>
          <p>Assim que o plano for publicado pela equipe Holand, ele aparece aqui automaticamente.</p>
        </div>
      ) : null}
      {items.length > 0 ? (
        <div className="portal-table-wrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Status</th>
                <th>Concluído em</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.module_code}-${item.module_name}`}>
                  <td>
                    <strong>{item.module_name}</strong>
                    {item.total_encounters ? (
                      <p className="portal-table-subline">
                        {item.completed_encounters ?? 0}/{item.total_encounters} encontros
                        {' · '}
                        faltam {item.remaining_encounters ?? 0}
                        {item.next_dates && item.next_dates.length > 0 ? ` · próximas: ${formatDateListBr(item.next_dates)}` : ''}
                      </p>
                    ) : null}
                  </td>
                  <td>
                    <span className={`portal-status-chip ${planningStatusTone(item.status)}`}>
                      {planningStatusLabel(item.status)}
                    </span>
                  </td>
                  <td>{formatDateBr(item.completed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
