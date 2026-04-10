import { useEffect, useState } from 'react';
import type { PortalAuthedApi, PortalPlanningItem } from '../types';
import { statusLabel } from '../../utils/labels';

type PortalPlanningPageProps = {
  api: PortalAuthedApi;
};

function planningStatusTone(status: string) {
  if (status === 'Concluido') return 'is-success';
  if (status === 'Em_execucao') return 'is-progress';
  if (status === 'Planejado') return 'is-warning';
  return 'is-muted';
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
                <th>Módulo</th>
                <th>Nome</th>
                <th>Status</th>
                <th>Concluído em</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.module_code}-${item.module_name}`}>
                  <td>{item.module_code}</td>
                  <td>{item.module_name}</td>
                  <td>
                    <span className={`portal-status-chip ${planningStatusTone(item.status)}`}>
                      {statusLabel(item.status)}
                    </span>
                  </td>
                  <td>{item.completed_at ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
