import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { Section } from '../components/Section';
import { StatusChip } from '../components/StatusChip';

export function ClientDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function load() {
    if (!id) return;
    api.companyById(id)
      .then((response) => {
        setData(response);
        setError('');
      })
      .catch((err: Error) => {
        setData(null);
        setError(err.message);
      });
  }

  useEffect(() => {
    load();
  }, [id]);

  async function markDone(moduleId: string) {
    if (!id) return;
    try {
      await api.updateCompanyProgress(id, moduleId, { status: 'Concluido' });
      setMessage('Módulo atualizado manualmente.');
      setError('');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleModule(moduleId: string, currentEnabled: boolean) {
    if (!id) return;
    try {
      await api.updateCompanyModuleActivation(id, moduleId, { is_enabled: !currentEnabled });
      setMessage(currentEnabled ? 'Módulo desativado para este cliente.' : 'Módulo ativado para este cliente.');
      setError('');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!data && !error) return <p>Carregando cliente...</p>;

  return (
    <div className="page">
      <header className="page-header">
        <h1>{data?.company?.name ?? 'Cliente'}</h1>
        <p>{data?.company?.notes ?? '-'}</p>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}

      {!data ? null : (
      <>
      <div className="two-col">
        <Section title="Jornada de módulos">
          <ul className="timeline">
            {data.timeline.map((m: any) => (
              <li key={m.module_id} className="timeline-item">
                <div>
                  <strong>{m.code} - {m.name}</strong>
                  <p>{m.category} | {m.duration_days} diárias</p>
                  <p>Concluído em: {m.completed_at ?? '-'}</p>
                  <p>Módulo para este cliente: {m.is_enabled ? 'Ativo' : 'Desativado'}</p>
                </div>
                <div className="actions">
                  {m.is_enabled ? <StatusChip value={m.status} /> : <span className="chip">Desativado</span>}
                  <button type="button" onClick={() => toggleModule(m.module_id, Boolean(m.is_enabled))}>
                    {m.is_enabled ? 'Desativar módulo' : 'Ativar módulo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => markDone(m.module_id)}
                    disabled={!m.is_enabled}
                  >
                    Concluir (Admin)
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Opcionais">
          <table className="table">
          <thead><tr><th>Código</th><th>Nome</th><th>Status</th></tr></thead>
            <tbody>
              {data.optionals.map((o: any) => (
                <tr key={o.id}><td>{o.code}</td><td>{o.name}</td><td><StatusChip value={o.status} /></td></tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <Section title="Histórico de turmas">
        <table className="table">
          <thead><tr><th>Turma</th><th>Data</th><th>Módulo</th><th>Dia de entrada</th><th>Status</th></tr></thead>
          <tbody>
            {data.history.map((h: any) => (
              <tr key={h.id}>
                <td>{h.cohort_name}</td>
                <td>{h.start_date}</td>
                <td>{h.module_code} - {h.module_name}</td>
                <td>{h.entry_day}</td>
                <td><StatusChip value={h.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      </>
      )}
    </div>
  );
}
