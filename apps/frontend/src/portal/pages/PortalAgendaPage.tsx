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

function formatDateBr(dateIso: string) {
  const [year, month, day] = dateIso.split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function agendaStatusTone(status: string) {
  if (status === 'Em_andamento') return 'is-warning';
  if (status === 'Concluida') return 'is-success';
  if (status === 'Cancelada') return 'is-critical';
  return 'is-muted';
}

function agendaDateLabel(item: PortalAgendaItem) {
  const start = formatDateBr(item.start_date);
  const end = formatDateBr(item.end_date);
  if (start === end) return start;
  return `${start} até ${end}`;
}

function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return (hour * 60) + minute;
}

function nowSnapshot() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return {
    dateIso: `${year}-${month}-${day}`,
    minutes: (now.getHours() * 60) + now.getMinutes()
  };
}

function isPastAgendaItem(item: PortalAgendaItem, snapshot: { dateIso: string; minutes: number }) {
  if (item.status === 'Concluida') return true;
  if (item.end_date < snapshot.dateIso) return true;
  if (item.end_date > snapshot.dateIso) return false;
  if (item.all_day === 1) return item.status === 'Cancelada';

  const endMinutes = timeToMinutes(item.end_time);
  if (endMinutes !== null) return snapshot.minutes >= endMinutes;
  return item.status === 'Cancelada';
}

function agendaSortAsc(left: PortalAgendaItem, right: PortalAgendaItem) {
  const dateCmp = left.start_date.localeCompare(right.start_date);
  if (dateCmp !== 0) return dateCmp;
  const leftTime = left.start_time ?? '23:59';
  const rightTime = right.start_time ?? '23:59';
  return leftTime.localeCompare(rightTime);
}

function agendaSortDesc(left: PortalAgendaItem, right: PortalAgendaItem) {
  return agendaSortAsc(right, left);
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

  const snapshot = nowSnapshot();
  const upcomingItems = items
    .filter((item) => !isPastAgendaItem(item, snapshot))
    .sort(agendaSortAsc);
  const pastItems = items
    .filter((item) => isPastAgendaItem(item, snapshot))
    .sort(agendaSortDesc);

  function renderAgendaItem(item: PortalAgendaItem) {
    return (
      <article key={item.id} className={`portal-agenda-item ${agendaStatusTone(item.status)}`}>
        <div className="portal-agenda-main">
          <strong>{item.title}</strong>
          <p>{item.notes?.trim() || 'Atividade registrada para o seu cronograma operacional.'}</p>
        </div>
        <div className="portal-agenda-meta">
          <div className="portal-agenda-meta-chips">
            <span className="portal-status-chip is-muted">{statusLabel(item.activity_type)}</span>
            <span className={`portal-status-chip ${agendaStatusTone(item.status)}`}>{statusLabel(item.status)}</span>
            {item.encounter_index && item.total_encounters ? (
              <span className="portal-status-chip is-analysis">
                Encontro {item.encounter_index}/{item.total_encounters}
              </span>
            ) : null}
            {item.source === 'jornada' ? (
              <span className="portal-status-chip is-muted">Jornada de treinamento</span>
            ) : null}
          </div>
          <div className="portal-agenda-meta-datetime">
            <span>{agendaDateLabel(item)}</span>
            <strong>{agendaTimeLabel(item)}</strong>
          </div>
        </div>
      </article>
    );
  }

  return (
    <section className="portal-panel">
      <header className="portal-panel-header">
        <h2>Agenda</h2>
        <p>Acompanhe próximos eventos e histórico concluído da sua operação com a Holand.</p>
      </header>

      <section className="portal-agenda-section">
        <div className="portal-agenda-section-head">
          <h3>Próximos eventos</h3>
          <span>{upcomingItems.length}</span>
        </div>
        <div className="portal-agenda-list">
          {upcomingItems.length === 0 ? (
            <div className="portal-empty-state">
              <strong>Nenhuma atividade futura no momento.</strong>
              <p>Novos eventos planejados aparecerão aqui automaticamente.</p>
            </div>
          ) : null}
          {upcomingItems.map((item) => renderAgendaItem(item))}
        </div>
      </section>

      <section className="portal-agenda-section">
        <div className="portal-agenda-section-head">
          <h3>Eventos concluídos</h3>
          <span>{pastItems.length}</span>
        </div>
        <div className="portal-agenda-list">
          {pastItems.length === 0 ? (
            <div className="portal-empty-state">
              <strong>Nenhum evento concluído para exibir.</strong>
              <p>Conforme os encontros passarem, o histórico ficará disponível aqui.</p>
            </div>
          ) : null}
          {pastItems.map((item) => renderAgendaItem(item))}
        </div>
      </section>

    </section>
  );
}
