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
        <p>Próximas atividades planejadas para sua operação com a Holand.</p>
      </header>
      <div className="portal-agenda-list">
        {items.length === 0 ? <p>Nenhuma atividade agendada no momento.</p> : null}
        {items.map((item) => (
          <article key={item.id} className="portal-agenda-item">
            <div>
              <strong>{item.title}</strong>
              <p>{statusLabel(item.activity_type)} • {statusLabel(item.status)}</p>
            </div>
            <div className="portal-agenda-meta">
              <span>{item.start_date} até {item.end_date}</span>
              <span>{agendaTimeLabel(item)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
