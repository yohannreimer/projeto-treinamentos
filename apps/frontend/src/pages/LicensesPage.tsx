import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import type { LicenseProgram, LicenseRow } from '../types';
import { Section } from '../components/Section';
import { askDestructiveConfirmation } from '../utils/destructive';

type RenewalCycle = 'Mensal' | 'Anual';

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

  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [programId, setProgramId] = useState('');
  const [userName, setUserName] = useState('');
  const [moduleList, setModuleList] = useState('');
  const [licenseIdentifier, setLicenseIdentifier] = useState('');
  const [renewalCycle, setRenewalCycle] = useState<RenewalCycle>('Mensal');
  const [expiresAt, setExpiresAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  async function load() {
    const [licensesResponse, companiesResponse, programsResponse] = await Promise.all([
      api.licenses(),
      api.companies(),
      api.licensePrograms()
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

    setRows(payload.rows ?? []);
    setAlerts(payload.alerts ?? {
      expired: [],
      monthly_due_soon: [],
      annual_due_soon: [],
      total_attention: 0
    });
    setCompanies(companyRows);
    setPrograms(programRows);

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

  function resetForm() {
    setEditingId(null);
    setUserName('');
    setModuleList('');
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
    setModuleList(row.module_list);
    setLicenseIdentifier(row.license_identifier);
    setRenewalCycle(row.renewal_cycle);
    setExpiresAt(row.expires_at);
    setNotes(row.notes ?? '');
  }

  async function submitLicense() {
    if (!companyId || !programId || !userName.trim() || !moduleList.trim() || !licenseIdentifier.trim() || !expiresAt) {
      setError('Preencha os campos obrigatórios: Cliente, Programa, Usuário, Módulos, ID e Vencimento.');
      return;
    }

    setError('');
    setMessage('');

    const payload = {
      company_id: companyId,
      program_id: programId,
      user_name: userName.trim(),
      module_list: moduleList.trim(),
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

          <div className="three-col">
            <label>
              Módulos
              <input
                value={moduleList}
                onChange={(event) => setModuleList(event.target.value)}
                placeholder="Ex.: Design + CAM 2D"
              />
            </label>
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
                <th>Cliente</th>
                <th>Programa</th>
                <th>Usuário</th>
                <th>ID</th>
                <th>Vencimento</th>
                <th>Aviso</th>
              </tr>
            </thead>
            <tbody>
              {attentionRows.map((row) => (
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
                    <div className="muted" style={{ marginTop: 4 }}>{row.warning_message}</div>
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
              <th>Cliente</th>
              <th>Programa</th>
              <th>Usuário</th>
              <th>Módulos</th>
              <th>ID</th>
              <th>Tipo</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
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
