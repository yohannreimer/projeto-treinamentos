import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { Section } from '../components/Section';
import { askDestructiveConfirmation } from '../utils/destructive';
import { statusLabel } from '../utils/labels';

const statusOptions = ['Em_treinamento', 'Finalizado', 'Ativo', 'Inativo'] as const;
const priorityOptions = ['Alta', 'Normal', 'Baixa', 'Parado', 'Aguardando_liberacao'] as const;
const modalityOptions = ['Turma_Online', 'Exclusivo_Online', 'Presencial'] as const;
type SortKey =
  | 'name'
  | 'contact_name'
  | 'contact_email'
  | 'modality'
  | 'completion_percent'
  | 'next_module_name'
  | 'priority_level'
  | 'status'
  | 'alert';
type SortDirection = 'asc' | 'desc';

function priorityRank(level?: string | null): number {
  switch (level) {
    case 'Alta':
      return 5;
    case 'Normal':
      return 4;
    case 'Baixa':
      return 3;
    case 'Parado':
      return 2;
    case 'Aguardando_liberacao':
      return 1;
    default:
      return 0;
  }
}

export function ClientsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [modalityFilter, setModalityFilter] = useState('');

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newModality, setNewModality] = useState<(typeof modalityOptions)[number]>('Turma_Online');
  const [newPriorityLevel, setNewPriorityLevel] = useState<(typeof priorityOptions)[number]>('Normal');
  const [newStatus, setNewStatus] = useState<(typeof statusOptions)[number]>('Em_treinamento');
  const [sortKey, setSortKey] = useState<SortKey>('priority_level');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  function load() {
    api.companies().then(setRows).catch(() => setRows([]));
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (priorityFilter && row.priority_level !== priorityFilter) return false;
      if (modalityFilter && row.modality !== modalityFilter) return false;
      if (!normalizedQuery) return true;

      return `${row.name} ${row.contact_name ?? ''} ${row.contact_email ?? ''} ${row.contact_phone ?? ''}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [rows, query, statusFilter, priorityFilter, modalityFilter]);

  const ordered = useMemo(() => {
    const list = [...filtered];
    const direction = sortDirection === 'asc' ? 1 : -1;

    list.sort((a, b) => {
      switch (sortKey) {
        case 'completion_percent': {
          const left = Number(a.completion_percent ?? 0);
          const right = Number(b.completion_percent ?? 0);
          if (left !== right) return (left - right) * direction;
          break;
        }
        case 'priority_level': {
          const left = priorityRank(a.priority_level);
          const right = priorityRank(b.priority_level);
          if (left !== right) return (left - right) * direction;
          break;
        }
        case 'name':
        case 'contact_name':
        case 'contact_email':
        case 'modality':
        case 'status':
        case 'alert': {
          const left = String(a[sortKey] ?? '');
          const right = String(b[sortKey] ?? '');
          const textCompare = left.localeCompare(right);
          if (textCompare !== 0) return textCompare * direction;
          break;
        }
        case 'next_module_name': {
          const left = String(a.next_module_name ?? a.next_module_code ?? '');
          const right = String(b.next_module_name ?? b.next_module_code ?? '');
          const textCompare = left.localeCompare(right);
          if (textCompare !== 0) return textCompare * direction;
          break;
        }
        default:
          break;
      }

      return String(a.name ?? '').localeCompare(String(b.name ?? ''));
    });
    return list;
  }, [filtered, sortKey, sortDirection]);

  const stats = useMemo(() => {
    const total = rows.length;
    const inTraining = rows.filter((row) => row.status === 'Em_treinamento' || row.status === 'Ativo').length;
    const finalized = rows.filter((row) => row.status === 'Finalizado').length;
    const blocked = rows.filter((row) => row.alert).length;
    const averageCompletion = total > 0
      ? Number((rows.reduce((sum, row) => sum + Number(row.completion_percent ?? 0), 0) / total).toFixed(1))
      : 0;

    return { total, inTraining, finalized, blocked, averageCompletion };
  }, [rows]);

  async function createClient() {
    if (!newName.trim()) {
      setError('Informe o nome do cliente.');
      return;
    }

    setError('');
    setMessage('');

    try {
      await api.createCompany({
        name: newName.trim(),
        status: newStatus,
        priority_level: newPriorityLevel,
        contact_name: newContactName.trim() || null,
        contact_phone: newContactPhone.trim() || null,
        contact_email: newContactEmail.trim() || null,
        modality: newModality
      });
      setNewName('');
      setNewContactName('');
      setNewContactPhone('');
      setNewContactEmail('');
      setNewModality('Turma_Online');
      setNewPriorityLevel('Normal');
      setNewStatus('Em_treinamento');
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

  async function patchCompany(id: string, payload: Record<string, unknown>, successMessage: string) {
    setSavingId(id);
    setError('');
    setMessage('');
    try {
      await api.updateCompany(id, payload);
      setMessage(successMessage);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'priority_level' ? 'desc' : 'asc');
  }

  function sortIndicator(nextKey: SortKey) {
    if (sortKey !== nextKey) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  return (
    <div className="page clients-page">
      <header className="page-header">
        <h1>Clientes</h1>
        <p>Carteira comercial com contato responsável, modalidade de entrega e priorização operacional para agenda.</p>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}

      <div className="stats-grid">
        <article className="mini-stat">
          <span>Total de clientes</span>
          <strong>{stats.total}</strong>
        </article>
        <article className="mini-stat">
          <span>Em treinamento</span>
          <strong>{stats.inTraining}</strong>
        </article>
        <article className="mini-stat">
          <span>Finalizados</span>
          <strong>{stats.finalized}</strong>
        </article>
        <article className="mini-stat">
          <span>Média da jornada concluída</span>
          <strong>{stats.averageCompletion}%</strong>
        </article>
        <article className="mini-stat">
          <span>Clientes com alerta</span>
          <strong>{stats.blocked}</strong>
        </article>
      </div>

      <div className="clients-tools-grid">
        <Section title="Cadastro de cliente" className="clients-create-panel">
          <div className="form form-spacious">
            <div className="three-col">
              <label>
                Empresa
                <input
                  placeholder="Nome da empresa"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
              </label>
              <label>
                Contato responsável
                <input
                  placeholder="Nome do contato"
                  value={newContactName}
                  onChange={(event) => setNewContactName(event.target.value)}
                />
              </label>
              <label>
                Contato (telefone/WhatsApp)
                <input
                  placeholder="(00) 00000-0000"
                  value={newContactPhone}
                  onChange={(event) => setNewContactPhone(event.target.value)}
                />
              </label>
            </div>
            <div className="three-col">
              <label>
                E-mail
                <input
                  type="email"
                  placeholder="contato@empresa.com"
                  value={newContactEmail}
                  onChange={(event) => setNewContactEmail(event.target.value)}
                />
              </label>
              <label>
                Formato / Modalidade
                <select value={newModality} onChange={(event) => setNewModality(event.target.value as (typeof modalityOptions)[number])}>
                  {modalityOptions.map((option) => (
                    <option key={option} value={option}>{statusLabel(option)}</option>
                  ))}
                </select>
              </label>
              <label>
                Prioridade
                <select value={newPriorityLevel} onChange={(event) => setNewPriorityLevel(event.target.value as (typeof priorityOptions)[number])}>
                  {priorityOptions.map((option) => (
                    <option key={option} value={option}>{statusLabel(option)}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="three-col">
              <label>
                Status
                <select value={newStatus} onChange={(event) => setNewStatus(event.target.value as (typeof statusOptions)[number])}>
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>{statusLabel(option)}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="actions">
              <button type="button" onClick={createClient}>Adicionar cliente</button>
            </div>
          </div>
        </Section>

        <Section title="Filtros" className="clients-filter-panel">
          <div className="form form-spacious">
            <label>
              Busca rápida
              <input
                placeholder="Empresa, contato ou e-mail"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className="three-col">
              <label>
                Status
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">Todos os status</option>
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>{statusLabel(option)}</option>
                  ))}
                </select>
              </label>
              <label>
                Prioridade
                <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                  <option value="">Todas as prioridades</option>
                  {priorityOptions.map((option) => (
                    <option key={option} value={option}>{statusLabel(option)}</option>
                  ))}
                </select>
              </label>
              <label>
                Modalidade
                <select value={modalityFilter} onChange={(event) => setModalityFilter(event.target.value)}>
                  <option value="">Todas as modalidades</option>
                  {modalityOptions.map((option) => (
                    <option key={option} value={option}>{statusLabel(option)}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="actions">
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setStatusFilter('');
                  setPriorityFilter('');
                  setModalityFilter('');
                }}
              >
                Limpar filtros
              </button>
            </div>
          </div>
        </Section>
      </div>

      <Section title="Carteira de clientes" className="clients-table-panel">
        <table className="table table-hover table-tight">
          <thead>
            <tr>
              <th>
                <button type="button" className="table-sort-btn" onClick={() => toggleSort('name')}>
                  Empresa{sortIndicator('name')}
                </button>
              </th>
              <th className="clients-ops-only">
                <button type="button" className="table-sort-btn" onClick={() => toggleSort('contact_name')}>
                  Contato{sortIndicator('contact_name')}
                </button>
              </th>
              <th className="clients-ops-only">
                <button type="button" className="table-sort-btn" onClick={() => toggleSort('contact_email')}>
                  E-mail{sortIndicator('contact_email')}
                </button>
              </th>
              <th className="clients-ops-only">
                <button type="button" className="table-sort-btn" onClick={() => toggleSort('modality')}>
                  Modalidade{sortIndicator('modality')}
                </button>
              </th>
              <th>
                <button type="button" className="table-sort-btn" onClick={() => toggleSort('completion_percent')}>
                  Jornada concluída{sortIndicator('completion_percent')}
                </button>
              </th>
              <th>
                <button type="button" className="table-sort-btn" onClick={() => toggleSort('next_module_name')}>
                  Próximo módulo{sortIndicator('next_module_name')}
                </button>
              </th>
              <th>
                <button type="button" className="table-sort-btn" onClick={() => toggleSort('priority_level')}>
                  Prioridade{sortIndicator('priority_level')}
                </button>
              </th>
              <th>
                <button type="button" className="table-sort-btn" onClick={() => toggleSort('status')}>
                  Status{sortIndicator('status')}
                </button>
              </th>
              <th className="clients-ops-only">
                <button type="button" className="table-sort-btn" onClick={() => toggleSort('alert')}>
                  Alerta{sortIndicator('alert')}
                </button>
              </th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  {row.contact_phone ? <div className="muted">{row.contact_phone}</div> : null}
                </td>
                <td className="clients-ops-only">{row.contact_name ?? '-'}</td>
                <td className="clients-ops-only">{row.contact_email ?? '-'}</td>
                <td className="clients-ops-only">
                  <select
                    value={row.modality ?? 'Turma_Online'}
                    onChange={(event) => patchCompany(row.id, { modality: event.target.value }, 'Modalidade atualizada.')}
                    disabled={savingId === row.id}
                  >
                    {modalityOptions.map((option) => (
                      <option key={option} value={option}>{statusLabel(option)}</option>
                    ))}
                  </select>
                </td>
                <td>{row.completion_percent}%</td>
                <td>{row.next_module_name ?? row.next_module_code ?? '-'}</td>
                <td>
                  <select
                    value={row.priority_level ?? 'Normal'}
                    onChange={(event) => patchCompany(row.id, { priority_level: event.target.value }, 'Prioridade atualizada.')}
                    disabled={savingId === row.id}
                  >
                    {priorityOptions.map((option) => (
                      <option key={option} value={option}>{statusLabel(option)}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={row.status}
                    onChange={(event) => patchCompany(row.id, { status: event.target.value }, 'Status atualizado.')}
                    disabled={savingId === row.id}
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>{statusLabel(option)}</option>
                    ))}
                  </select>
                </td>
                <td className="clients-ops-only">{row.alert ? <span className="chip chip-aguardando_quorum">{row.alert}</span> : '-'}</td>
                <td className="actions">
                  <Link to={`/clientes/${row.id}`} className="action-link-button">Abrir perfil</Link>
                  <button type="button" onClick={() => deleteClient(row.id, row.name)}>Excluir</button>
                </td>
              </tr>
            ))}
            {ordered.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <p className="muted">Nenhum cliente encontrado com os filtros atuais.</p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
