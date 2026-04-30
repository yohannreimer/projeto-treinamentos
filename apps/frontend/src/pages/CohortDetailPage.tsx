import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { StatusChip } from '../components/StatusChip';
import { Section } from '../components/Section';
import { statusLabel } from '../utils/labels';

function formatDateBr(dateIso: string): string {
  const [year, month, day] = dateIso.split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function formatTimeRange(startTime?: string | null, endTime?: string | null): string {
  if (startTime && endTime) return `${startTime} - ${endTime}`;
  if (startTime) return startTime;
  if (endTime) return endTime;
  return '-';
}

function formatCohortSchedule(period?: 'Integral' | 'Meio_periodo', startTime?: string | null, endTime?: string | null): string {
  if (period !== 'Meio_periodo') return statusLabel(period ?? 'Integral');
  if (startTime && endTime) return `${statusLabel('Meio_periodo')} (${startTime} - ${endTime})`;
  return statusLabel('Meio_periodo');
}

function moduleShortLabel(name: string): string {
  return name
    .replace(/^Treinamento\s+/i, '')
    .replace(/^TopSolid'?/i, 'TopSolid')
    .trim();
}

export function CohortDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.cohortById(id)
      .then((detail) => {
        setData(detail);
        setError('');
      })
      .catch((err: Error) => {
        setData(null);
        setError(err.message);
      });
  }, [id]);

  const scheduleDays = useMemo(() => {
    return [...(data?.schedule_days ?? [])].sort((a: any, b: any) => Number(a.day_index) - Number(b.day_index));
  }, [data]);

  const activeAllocations = useMemo(() => {
    return (data?.allocations ?? []).filter((allocation: any) => allocation.status !== 'Cancelado');
  }, [data]);

  const clients = useMemo(() => {
    const rows = new Map<string, {
      company_id: string;
      company_name: string;
      modules: string[];
      statuses: string[];
    }>();

    activeAllocations.forEach((allocation: any) => {
      const key = allocation.company_id ?? allocation.company_name;
      const current = rows.get(key) ?? {
        company_id: allocation.company_id ?? key,
        company_name: allocation.company_name,
        modules: [] as string[],
        statuses: [] as string[]
      };
      current.modules.push(`${moduleShortLabel(allocation.module_name)} (dia ${allocation.entry_day})`);
      current.statuses.push(allocation.status);
      rows.set(key, current);
    });

    return Array.from(rows.values()).sort((a, b) => a.company_name.localeCompare(b.company_name));
  }, [activeAllocations]);

  if (!data && !error) return <p>Carregando turma...</p>;

  return (
    <div className="page cohort-detail-page">
      <header className="page-header">
        <h1>{data ? `${data.code} - ${data.name}` : 'Turma'}</h1>
        <p>Visão rápida da turma: datas, horários, técnico, blocos e clientes confirmados no fluxo.</p>
      </header>
      {error ? <p className="error">{error}</p> : null}

      {!data ? null : (
        <>
          <Section
            title="Dados gerais"
            action={<Link to="/turmas" className="action-link-button">Voltar para turmas</Link>}
          >
            <div className="cohort-detail-summary">
              <article>
                <span>Início</span>
                <strong>{formatDateBr(data.start_date)}</strong>
              </article>
              <article>
                <span>Técnico</span>
                <strong>{data.technician_name ?? 'Sem técnico'}</strong>
              </article>
              <article>
                <span>Formato</span>
                <strong>{statusLabel(data.delivery_mode ?? 'Online')} · {formatCohortSchedule(data.period, data.start_time, data.end_time)}</strong>
              </article>
              <article>
                <span>Capacidade</span>
                <strong>{data.capacity_companies}</strong>
              </article>
              <article>
                <span>Status</span>
                <StatusChip value={data.status} />
              </article>
            </div>
          </Section>

          <div className="two-col cohort-detail-grid">
            <Section title="Agenda da turma">
              {scheduleDays.length === 0 ? (
                <p className="muted">Nenhum dia personalizado salvo para esta turma.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table table-hover table-tight">
                    <thead>
                      <tr>
                        <th>Dia</th>
                        <th>Data</th>
                        <th>Horário</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleDays.map((day: any) => (
                        <tr key={`${day.day_index}-${day.day_date}`}>
                          <td>Dia {day.day_index}</td>
                          <td>{formatDateBr(day.day_date)}</td>
                          <td>{formatTimeRange(day.start_time ?? data.start_time, day.end_time ?? data.end_time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section title="Blocos">
              {(data.blocks ?? []).length === 0 ? (
                <p className="muted">Nenhum bloco cadastrado nesta turma.</p>
              ) : (
                <div className="event-list">
                  {data.blocks.map((block: any) => (
                    <div key={block.id} className="event-item">
                      <span>{block.order_in_cohort}. {moduleShortLabel(block.module_name)}</span>
                      <span>Dia {block.start_day_offset} · {block.duration_days} diária(s)</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <Section title="Clientes da turma">
            {clients.length === 0 ? (
              <p className="muted">Nenhum cliente confirmado nesta turma ainda.</p>
            ) : (
              <div className="table-wrap">
                <table className="table table-hover table-tight">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Módulos</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((client) => (
                      <tr key={client.company_id}>
                        <td><strong>{client.company_name}</strong></td>
                        <td>{client.modules.join(' · ')}</td>
                        <td>
                          <div className="status-chip-list">
                            {Array.from(new Set(client.statuses)).map((status) => (
                              <StatusChip key={status} value={status} />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
