import { useEffect, useState } from 'react';
import type { PortalAgendaItem, PortalAuthedApi } from '../types';
import { statusLabel } from '../../utils/labels';

type PortalAgendaPageProps = {
  api: PortalAuthedApi;
};

function agendaTimeLabel(item: PortalAgendaItem) {
  if (item.all_day === 1) return 'Dia inteiro';
  if (item.start_time && item.end_time) return `${item.start_time} - ${item.end_time}`;
  return 'Horário a confirmar';
}

export function PortalAgendaPage({ api }: PortalAgendaPageProps) {
  const [items, setItems] = useState<PortalAgendaItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.agenda()
      .then((response) => {
        if (!mounted) return;
        setItems(response.items ?? []);
        setError('');
      })
      .catch((loadError) => {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar agenda.');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [api]);

  if (loading) return <p>Carregando agenda...</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <section className="portal-panel">
      <header className="portal-panel-header">
        <h2>Agenda</h2>
        <p>Próximas atividades planejadas para sua operação com a Holand, com foco em previsibilidade.</p>
      </header>
      <div className="portal-agenda-list">
        {items.length === 0 ? (
          <div className="portal-empty-state">
            <strong>Nenhuma atividade agendada no momento.</strong>
            <p>Quando houver novas ações planejadas, elas aparecerão aqui em ordem cronológica.</p>
          </div>
        ) : null}
        {items.map((item) => (
          <article key={item.id} className="portal-agenda-item">
            <div className="portal-agenda-main">
              <strong>{item.title}</strong>
              <p>{item.notes?.trim() || 'Atividade registrada para o seu cronograma operacional.'}</p>
            </div>
            <div className="portal-agenda-meta">
              <span className="portal-status-chip is-muted">{statusLabel(item.activity_type)}</span>
              <span className="portal-status-chip is-progress">{statusLabel(item.status)}</span>
              {item.encounter_index && item.total_encounters ? (
                <span className="portal-status-chip is-analysis">
                  Encontro {item.encounter_index}/{item.total_encounters}
                </span>
              ) : null}
              {item.source === 'jornada' ? (
                <span className="portal-status-chip is-muted">Jornada de treinamento</span>
              ) : null}
              <span>{item.start_date} até {item.end_date}</span>
              <span>{agendaTimeLabel(item)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
