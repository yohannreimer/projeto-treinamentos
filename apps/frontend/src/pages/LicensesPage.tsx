import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import type { LicenseProgram, LicenseRow } from '../types';
import { Section } from '../components/Section';
import { askDestructiveConfirmation } from '../utils/destructive';

type RenewalCycle = 'Mensal' | 'Anual';
type LicenseSortKey = 'company_name' | 'program_name' | 'user_name' | 'license_identifier' | 'renewal_cycle' | 'expires_at' | 'alert_level';

type LicenseAlertsResponse = {
  rows: LicenseRow[];
  alerts: {
    expired: LicenseRow[];
    monthly_due_soon: LicenseRow[];
    annual_due_soon: LicenseRow[];
    total_attention: number;
  };
};

function formatDate(dateIso: string): string {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function renewalLabel(cycle: RenewalCycle): string {
  return cycle === 'Anual' ? 'Anual' : 'Mensal';
}

function alertRank(level: string): number {
  if (level === 'Expirada') return 3;
  if (level === 'Atenção') return 2;
  return 1;
}

export function LicensesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<LicenseRow[]>([]);
  const [alerts, setAlerts] = useState<LicenseAlertsResponse['alerts']>({
    expired: [],
    monthly_due_soon: [],
    annual_due_soon: [],
    total_attention: 0
  });
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [programs, setPrograms] = useState<LicenseProgram[]>([]);
  const [modules, setModules] = useState<Array<{ id: string; code: string; name: string }>>([]);

  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<LicenseSortKey>('expires_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [attentionSortKey, setAttentionSortKey] = useState<LicenseSortKey>('expires_at');
  const [attentionSortDirection, setAttentionSortDirection] = useState<'asc' | 'desc'>('asc');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [programId, setProgramId] = useState('');
  const [userName, setUserName] = useState('');
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [licenseIdentifier, setLicenseIdentifier] = useState('');
  const [renewalCycle, setRenewalCycle] = useState<RenewalCycle>('Mensal');
  const [expiresAt, setExpiresAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  async function load() {
    const [licensesResponse, companiesResponse, programsResponse, modulesResponse] = await Promise.all([
      api.licenses(),
      api.companies(),
      api.licensePrograms(),
      api.modules()
    ]);

    const payload = licensesResponse as LicenseAlertsResponse;
    const companyRows = (companiesResponse as Array<{ id: string; name: string }>).map((company) => ({
      id: company.id,
      name: company.name
    }));
    const programRows = (programsResponse as LicenseProgram[]).map((program) => ({
      ...program,
      usage_count: Number(program.usage_count ?? 0)
    }));
    const moduleRows = (modulesResponse as Array<{ id: string; code: string; name: string }>).map((module) => ({
      id: module.id,
      code: module.code,
      name: module.name
    }));

    setRows(payload.rows ?? []);
    setAlerts(payload.alerts ?? {
      expired: [],
      monthly_due_soon: [],
      annual_due_soon: [],
      total_attention: 0
    });
    setCompanies(companyRows);
    setPrograms(programRows);
    setModules(moduleRows);

    if (!companyId && companyRows.length > 0) {
      setCompanyId(companyRows[0].id);
    }
    if (!programId && programRows.length > 0) {
      setProgramId(programRows[0].id);
    }
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const normalized = query.toLowerCase();
    return rows.filter((row) =>
      `${row.company_name} ${row.program_name} ${row.user_name} ${row.module_list} ${row.license_identifier} ${row.renewal_cycle}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [rows, query]);

  const attentionRows = useMemo(
    () => [...alerts.expired, ...alerts.monthly_due_soon, ...alerts.annual_due_soon],
    [alerts]
  );

  const sortedAttentionRows = useMemo(() => {
    const list = [...attentionRows];
    list.sort((a, b) => {
      const direction = attentionSortDirection === 'asc' ? 1 : -1;
      if (attentionSortKey === 'expires_at') {
        return String(a.expires_at).localeCompare(String(b.expires_at)) * direction;
      }
      if (attentionSortKey === 'alert_level') {
        return (alertRank(a.alert_level) - alertRank(b.alert_level)) * direction;
      }
      const left = String((a as any)[attentionSortKey] ?? '');
      const right = String((b as any)[attentionSortKey] ?? '');
      return left.localeCompare(right) * direction;
    });
    return list;
  }, [attentionRows, attentionSortKey, attentionSortDirection]);

  const sortedFiltered = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      if (sortKey === 'expires_at') {
        return String(a.expires_at).localeCompare(String(b.expires_at)) * direction;
      }
      if (sortKey === 'alert_level') {
        return (alertRank(a.alert_level) - alertRank(b.alert_level)) * direction;
      }
      const left = String((a as any)[sortKey] ?? '');
      const right = String((b as any)[sortKey] ?? '');
      return left.localeCompare(right) * direction;
    });
    return list;
  }, [filtered, sortKey, sortDirection]);

  function toggleSort(nextKey: LicenseSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'expires_at' ? 'asc' : 'desc');
  }

  function toggleAttentionSort(nextKey: LicenseSortKey) {
    if (attentionSortKey === nextKey) {
      setAttentionSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setAttentionSortKey(nextKey);
    setAttentionSortDirection(nextKey === 'expires_at' ? 'asc' : 'desc');
  }

  function sortIndicator(nextKey: LicenseSortKey) {
    if (sortKey !== nextKey) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  function attentionSortIndicator(nextKey: LicenseSortKey) {
    if (attentionSortKey !== nextKey) return '';
    return attentionSortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  function resetForm() {
    setEditingId(null);
    setUserName('');
    setSelectedModuleIds([]);
    setLicenseIdentifier('');
    setRenewalCycle('Mensal');
    setExpiresAt(new Date().toISOString().slice(0, 10));
    setNotes('');
  }

  function editLicense(row: LicenseRow) {
    setEditingId(row.id);
    setCompanyId(row.company_id);
    setProgramId(row.program_id ?? '');
    setUserName(row.user_name);
    setSelectedModuleIds(row.module_ids ?? []);
    setLicenseIdentifier(row.license_identifier);
    setRenewalCycle(row.renewal_cycle);
    setExpiresAt(row.expires_at);
    setNotes(row.notes ?? '');
  }

  async function submitLicense() {
    if (!companyId || !programId || !userName.trim() || selectedModuleIds.length === 0 || !licenseIdentifier.trim() || !expiresAt) {
      setError('Preencha os campos obrigatórios: Cliente, Programa, Usuário, Módulos, ID e Vencimento.');
      return;
    }

    setError('');
    setMessage('');

    const payload = {
      company_id: companyId,
      program_id: programId,
      user_name: userName.trim(),
      module_ids: selectedModuleIds,
      license_identifier: licenseIdentifier.trim(),
      renewal_cycle: renewalCycle,
      expires_at: expiresAt,
      notes: notes.trim() || null
    };

    try {
      if (editingId) {
        await api.updateLicense(editingId, payload);
        setMessage('Licença atualizada com sucesso.');
      } else {
        await api.createLicense(payload);
        setMessage('Licença cadastrada com sucesso.');
      }
      resetForm();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function renewLicense(row: LicenseRow) {
    setError('');
    setMessage('');
    try {
      const response = await api.renewLicense(row.id) as { expires_at: string; renewal_cycle: RenewalCycle };
      setMessage(
        response.renewal_cycle === 'Anual'
          ? `Licença anual renovada. Novo vencimento: ${formatDate(response.expires_at)}.`
          : `Licença mensal renovada por 30 dias. Novo vencimento: ${formatDate(response.expires_at)}.`
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteLicense(row: LicenseRow) {
    const confirmationPhrase = askDestructiveConfirmation(
      `Excluir licença "${row.program_name}" (ID ${row.license_identifier}) de ${row.company_name}`
    );
    if (!confirmationPhrase) {
      setMessage('Ação cancelada.');
      return;
    }

    setError('');
    setMessage('');

    try {
      await api.deleteLicense(row.id, confirmationPhrase);
      setMessage('Licença excluída.');
      if (editingId === row.id) {
        resetForm();
      }
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function toggleLicenseModule(moduleId: string) {
    setSelectedModuleIds((prev) => (
      prev.includes(moduleId)
        ? prev.filter((id) => id !== moduleId)
        : [...prev, moduleId]
    ));
  }

  return (
    <div className="page licenses-page">
      <header className="page-header">
        <h1>Licenças</h1>
        <p>Gestão por cliente com dados completos de usuário, módulos, ID da licença e vencimento.</p>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}

      {programs.length === 0 ? (
        <p className="warn-text">
          Nenhum programa cadastrado. Cadastre primeiro na aba Programas de Licença para evitar erro de digitação.
        </p>
      ) : null}

      <div className="stats-grid">
        <article className="mini-stat">
          <span>Expiradas</span>
          <strong>{alerts.expired.length}</strong>
        </article>
        <article className="mini-stat">
          <span>Mensais (até 7 dias)</span>
          <strong>{alerts.monthly_due_soon.length}</strong>
        </article>
        <article className="mini-stat">
          <span>Anuais (até 30 dias)</span>
          <strong>{alerts.annual_due_soon.length}</strong>
        </article>
        <article className="mini-stat">
          <span>Total em atenção</span>
          <strong>{alerts.total_attention}</strong>
        </article>
      </div>

      <Section
        title={editingId ? 'Editar licença' : 'Cadastrar licença'}
        action={(
          <button type="button" onClick={() => navigate('/licencas/programas')}>
            Abrir Programas de Licença
          </button>
        )}
      >
        <div className="form form-spacious">
          <div className="three-col">
            <label>
              Cliente
              <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
                <option value="">Selecione</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </label>
            <label>
              Programa
              <select value={programId} onChange={(event) => setProgramId(event.target.value)}>
                <option value="">Selecione</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>{program.name}</option>
                ))}
              </select>
            </label>
            <label>
              Usuário
              <input value={userName} onChange={(event) => setUserName(event.target.value)} placeholder="Nome do usuário" />
            </label>
          </div>

          <label className="licenses-modules-field">
            Módulos da licença
            <div className="check-grid licenses-modules-grid">
              {modules.map((module) => (
                <label key={module.id}>
                  <input
                    type="checkbox"
                    checked={selectedModuleIds.includes(module.id)}
                    onChange={() => toggleLicenseModule(module.id)}
                  />
                  {module.name}
                </label>
              ))}
            </div>
          </label>

          <div className="licenses-meta-grid">
            <label>
              ID da licença
              <input
                value={licenseIdentifier}
                onChange={(event) => setLicenseIdentifier(event.target.value)}
                placeholder="Ex.: TS-CAM-001928"
              />
            </label>
            <label>
              Tipo de renovação
              <select value={renewalCycle} onChange={(event) => setRenewalCycle(event.target.value as RenewalCycle)}>
                <option value="Mensal">Mensal (alerta 7 dias antes)</option>
                <option value="Anual">Anual (alerta 30 dias antes)</option>
              </select>
            </label>
          </div>

          <div className="two-col">
            <label>
              Vencimento
              <input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            </label>
            <label>
              Observações
              <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" />
            </label>
          </div>

          <div className="actions">
            <button type="button" onClick={submitLicense} disabled={programs.length === 0}>
              {editingId ? 'Salvar alterações' : 'Cadastrar licença'}
            </button>
            {editingId ? (
              <button type="button" onClick={resetForm}>Cancelar edição</button>
            ) : null}
          </div>
        </div>
      </Section>

      <Section title="Avisos de renovação">
        {alerts.total_attention === 0 ? <p>Nenhum aviso pendente no momento.</p> : (
          <table className="table table-hover">
            <thead>
              <tr>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleAttentionSort('company_name')}>Cliente{attentionSortIndicator('company_name')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleAttentionSort('program_name')}>Programa{attentionSortIndicator('program_name')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleAttentionSort('user_name')}>Usuário{attentionSortIndicator('user_name')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleAttentionSort('license_identifier')}>ID{attentionSortIndicator('license_identifier')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleAttentionSort('expires_at')}>Vencimento{attentionSortIndicator('expires_at')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleAttentionSort('alert_level')}>Aviso{attentionSortIndicator('alert_level')}</button></th>
              </tr>
            </thead>
            <tbody>
              {sortedAttentionRows.map((row) => (
                <tr key={`alert-${row.id}`}>
                  <td>{row.company_name}</td>
                  <td>{row.program_name}</td>
                  <td>{row.user_name}</td>
                  <td>{row.license_identifier}</td>
                  <td>{formatDate(row.expires_at)}</td>
                  <td>
                    {row.alert_level === 'Expirada'
                      ? <span className="chip chip-cancelada">Expirada</span>
                      : <span className="chip chip-aguardando-quorum">Atenção</span>}
                    <div className="muted warning-copy">{row.warning_message}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="Base de licenças"
        action={
          <input
            placeholder="Buscar por cliente, programa, usuário, módulos, ID..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        }
      >
        <table className="table table-hover table-tight">
          <thead>
            <tr>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('company_name')}>Cliente{sortIndicator('company_name')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('program_name')}>Programa{sortIndicator('program_name')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('user_name')}>Usuário{sortIndicator('user_name')}</button></th>
              <th>Módulos</th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('license_identifier')}>ID{sortIndicator('license_identifier')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('renewal_cycle')}>Tipo{sortIndicator('renewal_cycle')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('expires_at')}>Vencimento{sortIndicator('expires_at')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('alert_level')}>Status{sortIndicator('alert_level')}</button></th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sortedFiltered.map((row) => (
              <tr key={row.id}>
                <td>{row.company_name}</td>
                <td>{row.program_name}</td>
                <td>{row.user_name}</td>
                <td title={row.module_list}>{row.module_list}</td>
                <td>{row.license_identifier}</td>
                <td>{renewalLabel(row.renewal_cycle)}</td>
                <td>{formatDate(row.expires_at)}</td>
                <td>
                  {row.alert_level === 'Ok' ? <span className="chip chip-confirmada">OK</span> : null}
                  {row.alert_level === 'Atenção' ? <span className="chip chip-aguardando-quorum">Atenção</span> : null}
                  {row.alert_level === 'Expirada' ? <span className="chip chip-cancelada">Expirada</span> : null}
                </td>
                <td className="actions">
                  <button type="button" onClick={() => renewLicense(row)}>
                    {row.renewal_cycle === 'Anual' ? 'Renovar +1 ano' : 'Renovar +30 dias'}
                  </button>
                  <button type="button" onClick={() => editLicense(row)}>Editar</button>
                  <button type="button" onClick={() => deleteLicense(row)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
