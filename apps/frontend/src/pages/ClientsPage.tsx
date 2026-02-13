import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { Section } from '../components/Section';
import { StatusChip } from '../components/StatusChip';
import { askDestructiveConfirmation } from '../utils/destructive';

export function ClientsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  function load() {
    api.companies().then(setRows).catch(() => setRows([]));
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase()));
  }, [rows, query]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((row) => row.status === 'Ativo').length;
    const blocked = rows.filter((row) => row.alert).length;
    const averageCompletion = total > 0
      ? Number((rows.reduce((sum, row) => sum + Number(row.completion_percent ?? 0), 0) / total).toFixed(1))
      : 0;

    return { total, active, blocked, averageCompletion };
  }, [rows]);

  async function createClient() {
    if (!newName.trim()) {
      setError('Informe o nome do cliente.');
      return;
    }

    setError('');
    setMessage('');

    try {
      await api.createCompany({ name: newName.trim(), status: 'Ativo' });
      setNewName('');
      setMessage('Cliente criado com sucesso.');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteClient(id: string, name: string) {
    const confirmationPhrase = askDestructiveConfirmation(`Excluir cliente "${name}"`);
    if (!confirmationPhrase) {
      setMessage('Ação cancelada.');
      return;
    }

    setError('');
    setMessage('');

    try {
      await api.deleteCompany(id, confirmationPhrase);
      setMessage('Cliente excluído com sucesso.');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function updatePriority(id: string, priority: number) {
    setSavingId(id);
    setError('');
    setMessage('');

    try {
      await api.updateCompanyPriority(id, { priority });
      setMessage('Prioridade atualizada.');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="page clients-page">
      <header className="page-header">
        <h1>Clientes</h1>
        <p>Gerencie a carteira, priorização e avanço da jornada. A ativação de módulos é feita no perfil do cliente.</p>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}

      <div className="stats-grid">
        <article className="mini-stat">
          <span>Total de clientes</span>
          <strong>{stats.total}</strong>
        </article>
        <article className="mini-stat">
          <span>Clientes ativos</span>
          <strong>{stats.active}</strong>
        </article>
        <article className="mini-stat">
          <span>Com alerta de pré-requisito</span>
          <strong>{stats.blocked}</strong>
        </article>
        <article className="mini-stat">
          <span>Média da jornada concluída</span>
          <strong>{stats.averageCompletion}%</strong>
        </article>
      </div>

      <Section title="Cadastro rápido de cliente">
        <div className="actions actions-stretch">
          <input
            placeholder="Nome da empresa"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <button type="button" onClick={createClient}>Adicionar cliente</button>
        </div>
      </Section>

      <Section
        title="Carteira de clientes"
        action={
          <input
            placeholder="Buscar cliente"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        }
      >
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Jornada concluída</th>
              <th>Próximo módulo</th>
              <th>Prioridade</th>
              <th>Status</th>
              <th>Alerta</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.name}</strong></td>
                <td>{row.completion_percent}%</td>
                <td>{row.next_module_name ?? row.next_module_code ?? '-'}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={row.priority ?? 0}
                    onBlur={(event) => updatePriority(row.id, Math.max(0, Math.min(100, Number(event.target.value) || 0)))}
                    disabled={savingId === row.id}
                    style={{ width: '86px' }}
                  />
                </td>
                <td><StatusChip value={row.status} /></td>
                <td>{row.alert ? <span className="chip chip-aguardando_quorum">{row.alert}</span> : '-'}</td>
                <td className="actions">
                  <Link to={`/clientes/${row.id}`}>Abrir perfil</Link>
                  <button type="button" onClick={() => deleteClient(row.id, row.name)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
