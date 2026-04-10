import { useEffect, useState, type FormEvent } from 'react';
import type { PortalAgendaItem, PortalAuthedApi } from '../types';
import { statusLabel } from '../../utils/labels';

type PortalAgendaPageProps = {
  api: PortalAuthedApi;
  isInternal: boolean;
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

export function PortalAgendaPage({ api, isInternal }: PortalAgendaPageProps) {
  const [items, setItems] = useState<PortalAgendaItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showOperatorForm, setShowOperatorForm] = useState(false);
  const [savingOperatorItem, setSavingOperatorItem] = useState(false);
  const [operatorTitle, setOperatorTitle] = useState('');
  const [operatorDate, setOperatorDate] = useState('');
  const [operatorStatus, setOperatorStatus] = useState<'Planejada' | 'Em_andamento' | 'Concluida' | 'Cancelada'>('Planejada');
  const [operatorNotes, setOperatorNotes] = useState('');

  async function loadAgenda() {
    setLoading(true);
    try {
      const response = await api.agenda();
      setItems(response.items ?? []);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar agenda.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAgenda();
  }, []);

  async function createOperatorAgendaItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!operatorTitle.trim() || !operatorDate) {
      setError('Informe título e data para adicionar evento manual.');
      return;
    }
    setSavingOperatorItem(true);
    try {
      await api.createOperatorAgendaItem({
        title: operatorTitle.trim(),
        activity_type: 'Outro',
        start_date: operatorDate,
        end_date: operatorDate,
        all_day: true,
        status: operatorStatus,
        notes: operatorNotes.trim() || null
      });
      setOperatorTitle('');
      setOperatorDate('');
      setOperatorStatus('Planejada');
      setOperatorNotes('');
      setShowOperatorForm(false);
      await loadAgenda();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Falha ao criar evento manual.');
    } finally {
      setSavingOperatorItem(false);
    }
  }

  async function deleteOperatorAgendaItem(itemId: string) {
    try {
      await api.deleteOperatorAgendaItem(itemId);
      await loadAgenda();
      setError('');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Falha ao remover evento manual.');
    }
  }

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
          {item.source === 'manual' ? (
            <small className="form-hint">Evento manual ajustado pela equipe Holand.</small>
          ) : null}
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
          {isInternal && item.source === 'manual' ? (
            <button type="button" className="portal-secondary-btn" onClick={() => void deleteOperatorAgendaItem(item.id)}>
              Remover ajuste
            </button>
          ) : null}
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

      {isInternal ? (
        <section className="portal-operator-panel">
          <div className="portal-panel-header portal-panel-header-row">
            <div>
              <h3>Ajustes internos de agenda</h3>
              <p>Inclua ou remova eventos manuais exibidos apenas no portal do cliente.</p>
            </div>
            <button type="button" className="portal-secondary-btn" onClick={() => setShowOperatorForm((prev) => !prev)}>
              {showOperatorForm ? 'Fechar ajuste' : 'Novo ajuste de agenda'}
            </button>
          </div>
          {showOperatorForm ? (
            <form className="portal-ticket-form" onSubmit={createOperatorAgendaItem}>
              <label>
                Título
                <input value={operatorTitle} onChange={(event) => setOperatorTitle(event.target.value)} placeholder="Ex.: Reunião de alinhamento" />
              </label>
              <label>
                Data
                <input type="date" value={operatorDate} onChange={(event) => setOperatorDate(event.target.value)} />
              </label>
              <label>
                Status
                <select value={operatorStatus} onChange={(event) => setOperatorStatus(event.target.value as 'Planejada' | 'Em_andamento' | 'Concluida' | 'Cancelada')}>
                  <option value="Planejada">Planejada</option>
                  <option value="Em_andamento">Em andamento</option>
                  <option value="Concluida">Concluída</option>
                  <option value="Cancelada">Cancelada</option>
                </select>
              </label>
              <label>
                Observações
                <textarea rows={2} value={operatorNotes} onChange={(event) => setOperatorNotes(event.target.value)} />
              </label>
              <div className="actions actions-compact">
                <button type="submit" className="portal-primary-btn" disabled={savingOperatorItem}>
                  {savingOperatorItem ? 'Salvando...' : 'Adicionar ajuste'}
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

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
