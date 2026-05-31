import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import type { LicenseImportPreviewGroup, LicenseImportPreviewResponse, LicenseProgram, LicenseRow } from '../types';
import { Section } from '../components/Section';
import { askDestructiveConfirmation } from '../utils/destructive';

type RenewalCycle = 'Mensal' | 'Bimestral' | 'Trimestral' | 'Semestral' | 'Anual';
type LicenseSortKey = 'company_name' | 'user_name' | 'license_identifier' | 'renewal_cycle' | 'expires_at' | 'alert_level';

type LicenseAlertsResponse = {
  rows: LicenseRow[];
  alerts: {
    expired: LicenseRow[];
    due_soon?: LicenseRow[];
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
  return cycle;
}

function renewalActionLabel(cycle: RenewalCycle): string {
  if (cycle === 'Anual') return 'Renovar +1 ano';
  if (cycle === 'Semestral') return 'Renovar +180 dias';
  if (cycle === 'Trimestral') return 'Renovar +90 dias';
  if (cycle === 'Bimestral') return 'Renovar +60 dias';
  return 'Renovar +30 dias';
}

function alertRank(level: string): number {
  if (level === 'Expirada') return 3;
  if (level === 'Atenção') return 2;
  return 1;
}

function extractTopSolidCodes(value: string): string[] {
  return Array.from(value.matchAll(/\((\d+)\)|(?:Module|Group):(\d+)/g))
    .map((match) => match[1] ?? match[2])
    .filter(Boolean);
}

function programTopSolidCode(program: LicenseProgram): string | null {
  return program.topsolid_code?.trim() || extractTopSolidCodes(program.name)[0] || null;
}

function selectedProgramNamesFromLicense(row: LicenseRow, programs: LicenseProgram[]): string[] {
  const selected = new Set<string>();
  const savedNames = row.module_list
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);

  savedNames.forEach((name) => {
    if (programs.some((program) => program.name === name)) {
      selected.add(name);
    }
  });

  const savedCodes = new Set(extractTopSolidCodes(row.module_list));
  if (savedCodes.size > 0) {
    programs.forEach((program) => {
      const code = programTopSolidCode(program);
      if (code && savedCodes.has(code)) {
        selected.add(program.name);
      }
    });
  }

  if (selected.size === 0 && programs.some((program) => program.name === row.program_name)) {
    selected.add(row.program_name);
  }

  return Array.from(selected);
}

export function LicensesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<LicenseRow[]>([]);
  const [alerts, setAlerts] = useState<LicenseAlertsResponse['alerts']>({
    expired: [],
    due_soon: [],
    monthly_due_soon: [],
    annual_due_soon: [],
    total_attention: 0
  });
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [programs, setPrograms] = useState<LicenseProgram[]>([]);

  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<LicenseSortKey>('expires_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [attentionSortKey, setAttentionSortKey] = useState<LicenseSortKey>('expires_at');
  const [attentionSortDirection, setAttentionSortDirection] = useState<'asc' | 'desc'>('asc');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showLicenseFormSection, setShowLicenseFormSection] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [userName, setUserName] = useState('');
  const [selectedProgramNames, setSelectedProgramNames] = useState<string[]>([]);
  const [licenseIdentifier, setLicenseIdentifier] = useState('');
  const [renewalCycle, setRenewalCycle] = useState<RenewalCycle>('Mensal');
  const [expiresAt, setExpiresAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [detailRow, setDetailRow] = useState<LicenseRow | null>(null);
  const [importRawText, setImportRawText] = useState('');
  const [importPreview, setImportPreview] = useState<LicenseImportPreviewResponse | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [appliedImportGroupExpiresAt, setAppliedImportGroupExpiresAt] = useState<string | null>(null);

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
      due_soon: [],
      monthly_due_soon: [],
      annual_due_soon: [],
      total_attention: 0
    });
    setCompanies(companyRows);
    setPrograms(programRows);

    if (!companyId && companyRows.length > 0) {
      setCompanyId(companyRows[0].id);
    }
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!detailRow) return undefined;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDetailRow(null);
      }
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [detailRow]);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const normalized = query.toLowerCase();
    return rows.filter((row) =>
      `${row.company_name} ${row.user_name} ${row.module_list} ${row.license_identifier} ${row.renewal_cycle}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [rows, query]);

  const dueSoonRows = useMemo(
    () => alerts.due_soon ?? [...alerts.monthly_due_soon, ...alerts.annual_due_soon],
    [alerts]
  );
  const attentionRows = useMemo(
    () => [...alerts.expired, ...dueSoonRows],
    [alerts.expired, dueSoonRows]
  );

  const sortedAttentionRows = useMemo(() => {
    const list = [...attentionRows];
    list.sort((a, b) => {
      const direction = attentionSortDirection === 'asc' ? 1 : -1;
      if (attentionSortKey === 'expires_at') {
        return String(a.expires_at).localeCompare(String(b.expires_at)) * direction;
      }
      if (attentionSortKey === 'alert_level') {
        return (alertRank(b.alert_level) - alertRank(a.alert_level)) * direction;
      }
      const left = String((a as any)[attentionSortKey] ?? '');
      const right = String((b as any)[attentionSortKey] ?? '');
      return left.localeCompare(right) * direction;
    });
    return list;
  }, [attentionRows, attentionSortKey, attentionSortDirection]);

  const expiredCount = alerts.expired.length;
  const dueSoonCount = dueSoonRows.length;
  const nextAttentionRow = useMemo(() => {
    if (dueSoonRows.length > 0) {
      return [...dueSoonRows].sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)))[0] ?? null;
    }
    return [...alerts.expired].sort((a, b) => String(b.expires_at).localeCompare(String(a.expires_at)))[0] ?? null;
  }, [alerts.expired, dueSoonRows]);

  const sortedFiltered = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      if (sortKey === 'expires_at') {
        return String(a.expires_at).localeCompare(String(b.expires_at)) * direction;
      }
      if (sortKey === 'alert_level') {
        return (alertRank(b.alert_level) - alertRank(a.alert_level)) * direction;
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
    setSortDirection(nextKey === 'expires_at' || nextKey === 'alert_level' ? 'asc' : 'desc');
  }

  function toggleAttentionSort(nextKey: LicenseSortKey) {
    if (attentionSortKey === nextKey) {
      setAttentionSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setAttentionSortKey(nextKey);
    setAttentionSortDirection(nextKey === 'expires_at' || nextKey === 'alert_level' ? 'asc' : 'desc');
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
    setSelectedProgramNames([]);
    setLicenseIdentifier('');
    setRenewalCycle('Mensal');
    setExpiresAt(new Date().toISOString().slice(0, 10));
    setNotes('');
    setImportRawText('');
    setImportPreview(null);
    setAppliedImportGroupExpiresAt(null);
  }

  function editLicense(row: LicenseRow) {
    setShowLicenseFormSection(true);
    setEditingId(row.id);
    setCompanyId(row.company_id);
    setUserName(row.user_name);
    setSelectedProgramNames(selectedProgramNamesFromLicense(row, programs));
    setLicenseIdentifier(row.license_identifier);
    setRenewalCycle(row.renewal_cycle);
    setExpiresAt(row.expires_at);
    setNotes(row.notes ?? '');
    setImportPreview(null);
    setAppliedImportGroupExpiresAt(null);
  }

  function applyImportGroup(group: LicenseImportPreviewGroup) {
    const importedProgramNames = group.matched_programs.map((program) => program.name);
    setSelectedProgramNames((prev) => Array.from(new Set([...prev, ...importedProgramNames])));
    setExpiresAt(group.expires_at);
    setAppliedImportGroupExpiresAt(group.expires_at);
    setMessage(`Grupo de ${formatDate(group.expires_at)} aplicado ao cadastro.`);
  }

  async function analyzeTopSolidText() {
    if (!importRawText.trim()) {
      setError('Cole o texto TopSolid antes de analisar.');
      return;
    }

    setError('');
    setMessage('');
    setImportLoading(true);
    setAppliedImportGroupExpiresAt(null);

    try {
      const response = await api.licenseImportPreview({ raw_text: importRawText }) as LicenseImportPreviewResponse;
      setImportPreview(response);
      if (response.groups.length === 1) {
        applyImportGroup(response.groups[0]);
      } else if (response.groups.length === 0) {
        setMessage('Nenhum módulo ou grupo TopSolid válido encontrado no texto.');
      } else {
        setMessage(`${response.groups.length} vencimentos encontrados. Escolha qual grupo aplicar.`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImportLoading(false);
    }
  }

  async function submitLicense() {
    if (!companyId || !userName.trim() || selectedProgramNames.length === 0 || !licenseIdentifier.trim() || !expiresAt) {
      setError('Preencha os campos obrigatórios: Cliente, Usuário, Programas da licença, ID e Vencimento.');
      return;
    }

    setError('');
    setMessage('');

    const normalizedProgramNames = Array.from(new Set(selectedProgramNames.map((name) => name.trim()).filter(Boolean)));
    const selectedProgramRows = normalizedProgramNames
      .map((name) => programs.find((program) => program.name === name))
      .filter((program): program is LicenseProgram => Boolean(program));
    if (selectedProgramRows.length === 0) {
      setError('Selecione ao menos um programa válido da lista.');
      return;
    }
    const primaryProgramId = selectedProgramRows[0].id;

    const payload = {
      company_id: companyId,
      program_id: primaryProgramId,
      user_name: userName.trim(),
      module_list: selectedProgramRows.map((program) => program.name).join(' | '),
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
      setMessage(`Licença ${renewalLabel(response.renewal_cycle).toLowerCase()} renovada. Novo vencimento: ${formatDate(response.expires_at)}.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteLicense(row: LicenseRow) {
    const confirmationPhrase = askDestructiveConfirmation(
      `Excluir licença ID ${row.license_identifier} de ${row.company_name}`
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

  function toggleLicenseProgram(programName: string) {
    setSelectedProgramNames((prev) => (
      prev.includes(programName)
        ? prev.filter((name) => name !== programName)
        : [...prev, programName]
    ));
  }

  function openLicenseDetail(row: LicenseRow) {
    setDetailRow(row);
  }

  return (
    <div className="page licenses-page">
      <header className="page-header">
        <h1>Licenças</h1>
        <p>Gestão por cliente com dados completos de usuário, programas da licença, ID da licença e vencimento.</p>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}

      {programs.length === 0 ? (
        <p className="warn-text">
          Nenhum programa cadastrado. Cadastre primeiro na aba Programas de Licença para evitar erro de digitação.
        </p>
      ) : null}

      <div className="stats-grid licenses-alert-summary">
        <article className={`mini-stat ${expiredCount > 0 ? 'mini-stat-danger' : ''}`}>
          <span>Vencidas</span>
          <strong>{expiredCount}</strong>
        </article>
        <article className={`mini-stat ${dueSoonCount > 0 ? 'mini-stat-warning' : ''}`}>
          <span>Vencem em até 15 dias</span>
          <strong>{dueSoonCount}</strong>
        </article>
        <article className={`mini-stat ${alerts.total_attention > 0 ? 'mini-stat-warning' : ''}`}>
          <span>Total em atenção</span>
          <strong>{alerts.total_attention}</strong>
        </article>
        <article className="mini-stat">
          <span>Próximo vencimento</span>
          <strong>{nextAttentionRow ? formatDate(nextAttentionRow.expires_at) : 'Sem alertas'}</strong>
        </article>
      </div>

      <Section
        title={editingId ? 'Editar licença' : 'Cadastrar licença'}
        action={(
          <div className="actions actions-compact">
            <button
              type="button"
              className="section-collapse-btn"
              onClick={() => setShowLicenseFormSection((prev) => !prev)}
              aria-expanded={showLicenseFormSection}
              aria-label={showLicenseFormSection ? 'Minimizar cadastro de licença' : 'Expandir cadastro de licença'}
            >
              {showLicenseFormSection ? '−' : '+'}
            </button>
            <button type="button" onClick={() => navigate('/licencas/programas')}>
              Abrir Programas de Licença
            </button>
          </div>
        )}
      >
        {showLicenseFormSection ? (
          <div className="form form-spacious">
          <p className="form-hint">Preencha cliente e usuário, depois revise os programas do pacote, ID, renovação e vencimento.</p>
          <div className="two-col">
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
              Usuário
              <input value={userName} onChange={(event) => setUserName(event.target.value)} placeholder="Nome do usuário" />
            </label>
          </div>

          <label className="licenses-modules-field">
            Importar texto TopSolid
            <div className="licenses-import-panel">
              <textarea
                value={importRawText}
                onChange={(event) => setImportRawText(event.target.value)}
                placeholder="Cole aqui o conteúdo do arquivo TopSolid..."
                rows={6}
              />
              <div className="actions actions-compact">
                <button type="button" onClick={analyzeTopSolidText} disabled={importLoading}>
                  {importLoading ? 'Analisando...' : 'Analisar'}
                </button>
                {importPreview ? (
                  <button
                    type="button"
                    onClick={() => {
                      setImportPreview(null);
                      setAppliedImportGroupExpiresAt(null);
                    }}
                  >
                    Limpar prévia
                  </button>
                ) : null}
              </div>
              {importPreview ? (
                <div className="licenses-import-preview">
                  <div className="licenses-import-summary">
                    <span>{importPreview.summary.parsed_lines} itens lidos</span>
                    <span>{importPreview.summary.group_count} vencimento(s)</span>
                    <span>{importPreview.summary.matched_programs} programa(s) encontrados</span>
                    <span>{importPreview.summary.unmatched_items} pendência(s)</span>
                    {importPreview.summary.ignored_lines > 0 ? <span>{importPreview.summary.ignored_lines} linha(s) ignorada(s)</span> : null}
                  </div>
                  {importPreview.groups.map((group) => (
                    <div
                      key={group.expires_at}
                      className={`licenses-import-group${appliedImportGroupExpiresAt === group.expires_at ? ' is-applied' : ''}`}
                    >
                      <div>
                        <strong>{formatDate(group.expires_at)}</strong>
                        <p>
                          {group.matched_count} encontrado(s) de {group.item_count} item(ns)
                          {group.unmatched_count > 0 ? ` - ${group.unmatched_count} pendência(s)` : ''}
                        </p>
                      </div>
                      <button type="button" onClick={() => applyImportGroup(group)}>
                        {appliedImportGroupExpiresAt === group.expires_at ? 'Aplicado' : 'Aplicar este grupo'}
                      </button>
                      {group.unmatched_items.length > 0 ? (
                        <div className="licenses-import-unmatched">
                          {group.unmatched_items.map((item) => (
                            <span key={`${group.expires_at}-${item.kind}-${item.code}-${item.name}`}>
                              {item.kind}:{item.code} - {item.name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </label>

          <label className="licenses-modules-field">
            Programas da licença
            <div className="check-grid licenses-modules-grid">
              {programs.map((program) => (
                <label key={program.id} className="licenses-program-option">
                  <input
                    type="checkbox"
                    checked={selectedProgramNames.includes(program.name)}
                    onChange={() => toggleLicenseProgram(program.name)}
                  />
                  {program.name}
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
                <option value="Mensal">Mensal (alerta 15 dias antes)</option>
                <option value="Bimestral">Bimestral (alerta 15 dias antes)</option>
                <option value="Trimestral">Trimestral (alerta 15 dias antes)</option>
                <option value="Semestral">Semestral (alerta 15 dias antes)</option>
                <option value="Anual">Anual (alerta 15 dias antes)</option>
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
        ) : null}
      </Section>

      <Section title="Avisos de renovação">
        {alerts.total_attention === 0 ? <p>Nenhum aviso pendente no momento.</p> : (
          <div className="table-wrap table-wrap-wide">
          <table className="table table-hover table-tight">
            <thead>
              <tr>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleAttentionSort('company_name')}>Cliente{attentionSortIndicator('company_name')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleAttentionSort('user_name')}>Usuário{attentionSortIndicator('user_name')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleAttentionSort('license_identifier')}>ID{attentionSortIndicator('license_identifier')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleAttentionSort('expires_at')}>Vencimento{attentionSortIndicator('expires_at')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleAttentionSort('alert_level')}>Aviso{attentionSortIndicator('alert_level')}</button></th>
              </tr>
            </thead>
            <tbody>
              {sortedAttentionRows.map((row) => (
                <tr key={`alert-${row.id}`} className="row-openable" onDoubleClick={() => openLicenseDetail(row)}>
                  <td><div className="table-cell-clamp table-cell-clamp-compact">{row.company_name}</div></td>
                  <td><div className="table-cell-clamp table-cell-clamp-compact">{row.user_name}</div></td>
                  <td><div className="table-cell-clamp table-cell-clamp-compact">{row.license_identifier}</div></td>
                  <td>{formatDate(row.expires_at)}</td>
                  <td>
                    {row.alert_level === 'Expirada'
                      ? <span className="chip chip-cancelada">Expirada</span>
                      : <span className="chip chip-aguardando-quorum">Atenção</span>}
                    <div className="muted warning-copy table-cell-clamp table-cell-clamp-compact">{row.warning_message}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Section>

      <Section
        title="Base de licenças"
        action={
          <input
            placeholder="Buscar por cliente, usuário, programas, ID..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        }
      >
        <div className="table-wrap table-wrap-wide">
        <table className="table table-hover table-tight table-readable-grid">
          <colgroup>
            <col className="licenses-col-client" />
            <col className="licenses-col-user" />
            <col className="licenses-col-modules" />
            <col className="licenses-col-id" />
            <col className="licenses-col-type" />
            <col className="licenses-col-date" />
            <col className="licenses-col-status" />
            <col className="licenses-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('company_name')}>Cliente{sortIndicator('company_name')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('user_name')}>Usuário{sortIndicator('user_name')}</button></th>
              <th>Programas</th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('license_identifier')}>ID{sortIndicator('license_identifier')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('renewal_cycle')}>Tipo{sortIndicator('renewal_cycle')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('expires_at')}>Vencimento{sortIndicator('expires_at')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('alert_level')}>Status{sortIndicator('alert_level')}</button></th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sortedFiltered.map((row) => (
              <tr key={row.id} className="row-openable" onDoubleClick={() => openLicenseDetail(row)}>
                <td><div className="table-cell-clamp">{row.company_name}</div></td>
                <td><div className="table-cell-clamp">{row.user_name}</div></td>
                <td title={row.module_list}>
                  <div className="table-cell-clamp table-cell-clamp-tall">{row.module_list}</div>
                </td>
                <td><div className="table-cell-clamp">{row.license_identifier}</div></td>
                <td>{renewalLabel(row.renewal_cycle)}</td>
                <td>{formatDate(row.expires_at)}</td>
                <td>
                  {row.alert_level === 'Ok' ? <span className="chip chip-confirmada">OK</span> : null}
                  {row.alert_level === 'Atenção' ? <span className="chip chip-aguardando-quorum">Atenção</span> : null}
                  {row.alert_level === 'Expirada' ? <span className="chip chip-cancelada">Expirada</span> : null}
                </td>
                <td className="actions actions-compact" onDoubleClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={() => renewLicense(row)}>
                    {renewalActionLabel(row.renewal_cycle)}
                  </button>
                  <button type="button" onClick={() => editLicense(row)}>Editar</button>
                  <button type="button" onClick={() => deleteLicense(row)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Section>

      {detailRow ? (
        <div className="read-detail-overlay" role="dialog" aria-modal="true" aria-label="Detalhes da licença">
          <button type="button" className="read-detail-backdrop" onClick={() => setDetailRow(null)} aria-label="Fechar detalhes da licença" />
          <section className="read-detail-panel">
            <header className="read-detail-header">
              <div>
                <p>Licença</p>
                <h2>{detailRow.company_name}</h2>
              </div>
              <button type="button" className="read-detail-close" onClick={() => setDetailRow(null)} aria-label="Fechar">✕</button>
            </header>
            <div className="read-detail-body">
              <article className="read-detail-block">
                <span>Usuário</span>
                <p>{detailRow.user_name}</p>
              </article>
              <article className="read-detail-block read-detail-block-wide">
                <span>Programas da licença</span>
                <p>{detailRow.module_list}</p>
              </article>
              <article className="read-detail-block">
                <span>ID da licença</span>
                <p>{detailRow.license_identifier}</p>
              </article>
              <article className="read-detail-block">
                <span>Renovação</span>
                <p>{renewalLabel(detailRow.renewal_cycle)} · vence em {formatDate(detailRow.expires_at)}</p>
              </article>
              <article className="read-detail-block">
                <span>Status</span>
                <p>{detailRow.alert_level}</p>
              </article>
              {detailRow.warning_message ? (
                <article className="read-detail-block read-detail-block-wide">
                  <span>Aviso</span>
                  <p>{detailRow.warning_message}</p>
                </article>
              ) : null}
              {detailRow.notes ? (
                <article className="read-detail-block read-detail-block-wide">
                  <span>Observações</span>
                  <p>{detailRow.notes}</p>
                </article>
              ) : null}
            </div>
            <footer className="read-detail-actions">
              <button
                type="button"
                onClick={() => {
                  editLicense(detailRow);
                  setDetailRow(null);
                }}
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetailRow(null);
                  void renewLicense(detailRow);
                }}
              >
                {renewalActionLabel(detailRow.renewal_cycle)}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetailRow(null);
                  void deleteLicense(detailRow);
                }}
              >
                Excluir
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
