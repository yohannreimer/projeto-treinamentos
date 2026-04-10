import { useEffect, useState } from 'react';
import type { PortalAuthedApi, PortalOverview } from '../types';

type PortalOverviewPageProps = {
  api: PortalAuthedApi;
};

export function PortalOverviewPage({ api }: PortalOverviewPageProps) {
  const [data, setData] = useState<PortalOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    api.overview()
      .then((response) => {
        if (!mounted) return;
        setData(response);
        setError('');
      })
      .catch((loadError) => {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar visão geral.');
      });
    return () => {
      mounted = false;
    };
  }, [api]);

  if (error) {
    return <p className="error">{error}</p>;
  }
  if (!data) {
    return <p>Carregando visão geral...</p>;
  }

  return (
    <section className="portal-panel">
      <header className="portal-panel-header">
        <h2>Visão geral</h2>
        <p>Resumo do planejamento e da agenda ativa para o seu time.</p>
      </header>
      <div className="portal-kpi-grid">
        <article className="portal-kpi-card">
          <strong>{data.planning.total}</strong>
          <span>Módulos no planejamento</span>
        </article>
        <article className="portal-kpi-card">
          <strong>{data.planning.completed}</strong>
          <span>Módulos concluídos</span>
        </article>
        <article className="portal-kpi-card">
          <strong>{data.planning.in_progress}</strong>
          <span>Em execução</span>
        </article>
        <article className="portal-kpi-card">
          <strong>{data.agenda.total}</strong>
          <span>Atividades de agenda</span>
        </article>
      </div>
      <p className="portal-meta-line">
        Próxima data prevista: <strong>{data.agenda.next_date ?? 'Sem data definida'}</strong>
      </p>
    </section>
  );
}
