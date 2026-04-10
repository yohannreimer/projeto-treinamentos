import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { Section } from '../components/Section';
import { StatusChip } from '../components/StatusChip';
import { statusLabel } from '../utils/labels';

type ModuleEdit = {
  status: 'Nao_iniciado' | 'Planejado' | 'Em_execucao' | 'Concluido';
  notes: string;
  custom_duration_days: string;
};

type JourneyFilter = 'all' | 'Concluido' | 'Em_execucao' | 'Planejado' | 'Nao_iniciado';

const statusOptions = ['Em_treinamento', 'Finalizado', 'Ativo', 'Inativo'] as const;
const priorityOptions = ['Alta', 'Normal', 'Baixa', 'Parado', 'Aguardando_liberacao'] as const;
const modalityOptions = ['Turma_Online', 'Exclusivo_Online', 'Presencial'] as const;
const relationshipOptions = ['Nosso', 'Terceiro'] as const;
const progressStatusOptions = ['Nao_iniciado', 'Planejado', 'Em_execucao', 'Concluido'] as const;
type HistorySortKey = 'cohort_code' | 'start_date' | 'module_code' | 'entry_day' | 'status' | 'cohort_status' | 'executed_at';

export function ClientDetailPage() {
  const { id } = useParams();
  const disabledModulesPanelId = 'client-detail-disabled-modules';
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [companyNotes, setCompanyNotes] = useState('');
  const [companyStatus, setCompanyStatus] = useState<(typeof statusOptions)[number]>('Em_treinamento');
  const [companyPriority, setCompanyPriority] = useState<(typeof priorityOptions)[number]>('Normal');
  const [companyModality, setCompanyModality] = useState<(typeof modalityOptions)[number]>('Turma_Online');
  const [companyRelationshipType, setCompanyRelationshipType] = useState<(typeof relationshipOptions)[number]>('Nosso');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [portalSlug, setPortalSlug] = useState('');
  const [portalUsername, setPortalUsername] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [portalActive, setPortalActive] = useState(true);
  const [portalSupportIntroText, setPortalSupportIntroText] = useState('');
  const [portalHiddenModuleIds, setPortalHiddenModuleIds] = useState<string[]>([]);
  const [portalDateOverrides, setPortalDateOverrides] = useState<Record<string, string>>({});
  const [savingPortalAccess, setSavingPortalAccess] = useState(false);

  const [moduleEdits, setModuleEdits] = useState<Record<string, ModuleEdit>>({});
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingModuleId, setSavingModuleId] = useState<string | null>(null);
  const [historySortKey, setHistorySortKey] = useState<HistorySortKey>('start_date');
  const [historySortDirection, setHistorySortDirection] = useState<'asc' | 'desc'>('desc');
  const [journeyFilter, setJourneyFilter] = useState<JourneyFilter>('all');
  const [showDisabledModules, setShowDisabledModules] = useState(false);

  function load() {
    if (!id) return;
    Promise.all([
      api.companyById(id),
      api.portalAccessByCompany(id)
    ])
      .then(([response, portalAccess]) => {
        setData(response);
        setPortalSlug(portalAccess.slug ?? '');
        setPortalUsername(portalAccess.username ?? '');
        setPortalActive(Boolean(portalAccess.is_active));
        setPortalSupportIntroText(portalAccess.support_intro_text ?? '');
        setPortalHiddenModuleIds(portalAccess.hidden_module_ids ?? []);
        setPortalDateOverrides((portalAccess.module_date_overrides ?? []).reduce((acc, row) => {
          if (!row.module_id || !row.next_date) return acc;
          acc[row.module_id] = row.next_date;
          return acc;
        }, {} as Record<string, string>));
        setPortalPassword('');
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

  useEffect(() => {
    setJourneyFilter('all');
    setShowDisabledModules(false);
  }, [id]);

  useEffect(() => {
    if (!data?.company) return;
    setCompanyName(data.company.name ?? '');
    setCompanyNotes(data.company.notes ?? '');
    setCompanyStatus((data.company.status ?? 'Em_treinamento') as (typeof statusOptions)[number]);
    setCompanyPriority((data.company.priority_level ?? 'Normal') as (typeof priorityOptions)[number]);
    setCompanyModality((data.company.modality ?? 'Turma_Online') as (typeof modalityOptions)[number]);
    setCompanyRelationshipType((data.company.relationship_type ?? (data.company.is_third_party ? 'Terceiro' : 'Nosso')) as (typeof relationshipOptions)[number]);
    setContactName(data.company.contact_name ?? '');
    setContactPhone(data.company.contact_phone ?? '');
    setContactEmail(data.company.contact_email ?? '');

    const nextEdits: Record<string, ModuleEdit> = {};
    (data.timeline ?? []).forEach((item: any) => {
      nextEdits[item.module_id] = {
        status: (item.status ?? 'Nao_iniciado') as ModuleEdit['status'],
        notes: item.progress_notes ?? '',
        custom_duration_days: item.custom_duration_days == null ? '' : String(item.custom_duration_days)
      };
    });
    setModuleEdits(nextEdits);
  }, [data]);

  const timeline = useMemo(() => data?.timeline ?? [], [data]);
  const activeTimeline = useMemo(
    () => timeline.filter((item: any) => Boolean(item.is_enabled)),
    [timeline]
  );
  const disabledCount = useMemo(
    () => timeline.filter((item: any) => !item.is_enabled).length,
    [timeline]
  );
  const disabledTimeline = useMemo(
    () => timeline.filter((item: any) => !item.is_enabled),
    [timeline]
  );
  const journeyKpis = useMemo(() => {
    const counts = {
      Concluido: 0,
      Em_execucao: 0,
      Planejado: 0,
      Nao_iniciado: 0
    };

    activeTimeline.forEach((item: any) => {
      if (item.status === 'Concluido') counts.Concluido += 1;
      else if (item.status === 'Em_execucao') counts.Em_execucao += 1;
      else if (item.status === 'Planejado') counts.Planejado += 1;
      else if (item.status === 'Nao_iniciado') counts.Nao_iniciado += 1;
    });

    return counts;
  }, [activeTimeline]);
  const filteredTimeline = useMemo(() => {
    if (journeyFilter === 'all') return activeTimeline;
    return activeTimeline.filter((item: any) => item.status === journeyFilter);
  }, [activeTimeline, journeyFilter]);

  useEffect(() => {
    if (disabledCount === 0 && showDisabledModules) {
      setShowDisabledModules(false);
    }
  }, [disabledCount, showDisabledModules]);

  const sortedHistory = useMemo(() => {
    const rows = [...(data?.history ?? [])];
    rows.sort((a: any, b: any) => {
      const direction = historySortDirection === 'asc' ? 1 : -1;
      if (historySortKey === 'entry_day') {
        return (Number(a.entry_day ?? 0) - Number(b.entry_day ?? 0)) * direction;
      }
      const left = String(a[historySortKey] ?? '');
      const right = String(b[historySortKey] ?? '');
      return left.localeCompare(right) * direction;
    });
    return rows;
  }, [data, historySortDirection, historySortKey]);

  function toggleHistorySort(nextKey: HistorySortKey) {
    if (historySortKey === nextKey) {
      setHistorySortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setHistorySortKey(nextKey);
    setHistorySortDirection(nextKey === 'entry_day' ? 'asc' : 'desc');
  }

  function historySortIndicator(nextKey: HistorySortKey) {
    if (historySortKey !== nextKey) return '';
    return historySortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  async function saveCompanyProfile() {
    if (!id) return;
    if (!companyName.trim()) {
      setError('Nome da empresa é obrigatório.');
      return;
    }

    setSavingCompany(true);
    setError('');
    setMessage('');
    try {
      await api.updateCompany(id, {
        name: companyName.trim(),
        status: companyStatus,
        priority_level: companyPriority,
        modality: companyModality,
        notes: companyNotes.trim() || null,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null
        ,
        relationship_type: companyRelationshipType,
        is_third_party: companyRelationshipType === 'Terceiro'
      });
      setMessage('Dados do cliente atualizados.');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingCompany(false);
    }
  }

  function moduleHiddenInPortal(moduleId: string) {
    return portalHiddenModuleIds.includes(moduleId);
  }

  function toggleModuleVisibilityInPortal(moduleId: string, visible: boolean) {
    setPortalHiddenModuleIds((prev) => {
      if (visible) {
        return prev.filter((id) => id !== moduleId);
      }
      if (prev.includes(moduleId)) return prev;
      return [...prev, moduleId];
    });
  }

  function updatePortalModuleDateOverride(moduleId: string, nextDate: string) {
    setPortalDateOverrides((prev) => {
      if (!nextDate.trim()) {
        if (!(moduleId in prev)) return prev;
        const next = { ...prev };
        delete next[moduleId];
        return next;
      }
      return {
        ...prev,
        [moduleId]: nextDate
      };
    });
  }

  async function savePortalAccess() {
    if (!id) return;
    if (!portalSlug.trim()) {
      setError('Informe o slug do portal.');
      return;
    }
    if (!portalUsername.trim()) {
      setError('Informe o usuário do portal.');
      return;
    }

    setSavingPortalAccess(true);
    setError('');
    setMessage('');
    try {
      await api.upsertPortalAccessByCompany(id, {
        slug: portalSlug.trim(),
        username: portalUsername.trim(),
        password: portalPassword.trim() || undefined,
        is_active: portalActive,
        support_intro_text: portalSupportIntroText.trim() || null,
        hidden_module_ids: Array.from(new Set(portalHiddenModuleIds)),
        module_date_overrides: Object.entries(portalDateOverrides)
          .filter(([, nextDate]) => nextDate.trim().length > 0)
          .map(([module_id, next_date]) => ({ module_id, next_date }))
      });
      setPortalPassword('');
      setMessage('Acesso do portal atualizado.');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingPortalAccess(false);
    }
  }

  function updateModuleEdit(moduleId: string, patch: Partial<ModuleEdit>) {
    setModuleEdits((prev) => ({
      ...prev,
      [moduleId]: {
        ...(prev[moduleId] ?? {
          status: 'Nao_iniciado',
          notes: '',
          custom_duration_days: ''
        }),
        ...patch
      }
    }));
  }

  async function saveModuleProgress(moduleId: string) {
    if (!id) return;
    const edit = moduleEdits[moduleId];
    if (!edit) return;

    setSavingModuleId(moduleId);
    setError('');
    setMessage('');
    try {
      await api.updateCompanyProgress(id, moduleId, {
        status: edit.status,
        notes: edit.notes.trim() || null,
        custom_duration_days: edit.custom_duration_days.trim() ? Number(edit.custom_duration_days) : null
      });
      setMessage('Módulo atualizado.');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingModuleId(null);
    }
  }

  async function markDone(moduleId: string) {
    if (!id) return;
    setSavingModuleId(moduleId);
    setError('');
    setMessage('');
    try {
      await api.updateCompanyProgress(id, moduleId, { status: 'Concluido' });
      setMessage('Módulo concluído manualmente.');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingModuleId(null);
    }
  }

  async function undoDone(moduleId: string) {
    if (!id) return;
    setSavingModuleId(moduleId);
    setError('');
    setMessage('');
    try {
      await api.updateCompanyProgress(id, moduleId, { status: 'Nao_iniciado', completed_at: null });
      setMessage('Conclusão desfeita com sucesso.');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingModuleId(null);
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
    <div className="page client-detail-page">
      <header className="page-header">
        <h1>{data?.company?.name ?? 'Cliente'}</h1>
        <p>Perfil operacional do cliente, ajustes de planejamento e histórico da jornada.</p>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}

      {!data ? null : (
        <>
          <Section title="Dados do cliente">
            <div className="form form-spacious">
              <p className="form-hint">Perfil comercial e operacional do cliente para planejamento de agenda e progresso da jornada.</p>
              <div className="three-col">
                <label>
                  Empresa
                  <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
                </label>
                <label>
                  Contato responsável
                  <input value={contactName} onChange={(event) => setContactName(event.target.value)} />
                </label>
                <label>
                  Contato (telefone/WhatsApp)
                  <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
                </label>
              </div>
              <div className="three-col">
                <label>
                  E-mail
                  <input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
                </label>
                <label>
                  Modalidade
                  <select value={companyModality} onChange={(event) => setCompanyModality(event.target.value as (typeof modalityOptions)[number])}>
                    {modalityOptions.map((option) => (
                      <option key={option} value={option}>{statusLabel(option)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Prioridade
                  <select value={companyPriority} onChange={(event) => setCompanyPriority(event.target.value as (typeof priorityOptions)[number])}>
                    {priorityOptions.map((option) => (
                      <option key={option} value={option}>{statusLabel(option)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="three-col">
                <label>
                  Status
                  <select value={companyStatus} onChange={(event) => setCompanyStatus(event.target.value as (typeof statusOptions)[number])}>
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>{statusLabel(option)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Tipo de cliente
                  <select
                    value={companyRelationshipType}
                    onChange={(event) => setCompanyRelationshipType(event.target.value as (typeof relationshipOptions)[number])}
                  >
                    {relationshipOptions.map((option) => (
                      <option key={option} value={option}>{statusLabel(option)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Observações
                <textarea rows={2} value={companyNotes} onChange={(event) => setCompanyNotes(event.target.value)} />
              </label>
              <div className="actions actions-compact">
                <button type="button" onClick={saveCompanyProfile} disabled={savingCompany}>
                  {savingCompany ? 'Salvando...' : 'Salvar dados do cliente'}
                </button>
              </div>
            </div>
          </Section>

          <Section title="Acesso ao portal do cliente">
            <div className="form form-spacious">
              <p className="form-hint">
                Defina URL, usuário e status do acesso externo para o cliente acompanhar planejamento, agenda e suporte.
                As configurações abaixo são mão única: apenas seu time altera, o cliente só visualiza.
              </p>
              <div className="three-col">
                <label>
                  Slug da URL
                  <input
                    value={portalSlug}
                    onChange={(event) => setPortalSlug(event.target.value)}
                    placeholder="ex: cliente-metal-forte"
                  />
                </label>
                <label>
                  Usuário
                  <input
                    value={portalUsername}
                    onChange={(event) => setPortalUsername(event.target.value)}
                    placeholder="Usuário de acesso"
                  />
                </label>
                <label>
                  Status
                  <select value={portalActive ? 'ativo' : 'inativo'} onChange={(event) => setPortalActive(event.target.value === 'ativo')}>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </label>
              </div>
              <label>
                Nova senha
                <input
                  type="password"
                  value={portalPassword}
                  onChange={(event) => setPortalPassword(event.target.value)}
                  placeholder="Opcional: preencha somente para trocar a senha"
                />
              </label>

              <label>
                Texto de apoio da aba Suporte
                <textarea
                  rows={2}
                  value={portalSupportIntroText}
                  onChange={(event) => setPortalSupportIntroText(event.target.value)}
                  placeholder="Ex: Registre a solicitação com contexto e impacto para acelerar o atendimento."
                />
              </label>

              <div className="table-wrap portal-curation-table-wrap">
                <table className="table portal-curation-table">
                  <thead>
                    <tr>
                      <th>Módulo</th>
                      <th>Visível no portal</th>
                      <th>Data exibida (opcional)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTimeline.map((moduleItem: any) => (
                      <tr key={`portal-curation-${moduleItem.module_id}`}>
                        <td>
                          <strong>{moduleItem.code} - {moduleItem.name}</strong>
                        </td>
                        <td>
                          <label className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={!moduleHiddenInPortal(moduleItem.module_id)}
                              onChange={(event) => toggleModuleVisibilityInPortal(moduleItem.module_id, event.target.checked)}
                            />
                            {moduleHiddenInPortal(moduleItem.module_id) ? 'Oculto no portal' : 'Exibido no portal'}
                          </label>
                        </td>
                        <td>
                          <input
                            type="date"
                            value={portalDateOverrides[moduleItem.module_id] ?? ''}
                            onChange={(event) => updatePortalModuleDateOverride(moduleItem.module_id, event.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="actions actions-compact">
                <button type="button" onClick={savePortalAccess} disabled={savingPortalAccess}>
                  {savingPortalAccess ? 'Salvando acesso...' : 'Salvar acesso do portal'}
                </button>
              </div>
            </div>
          </Section>

          <div className="two-col">
            <Section title="Jornada de módulos">
              <div className="journey-kpi-strip" role="group" aria-label="Filtro da jornada de módulos">
                <button
                  type="button"
                  className={`journey-kpi-btn ${journeyFilter === 'Concluido' ? 'is-active' : ''}`}
                  aria-pressed={journeyFilter === 'Concluido'}
                  onClick={() => setJourneyFilter((prev) => (prev === 'Concluido' ? 'all' : 'Concluido'))}
                >
                  Concluído {journeyKpis.Concluido}
                </button>
                <button
                  type="button"
                  className={`journey-kpi-btn ${journeyFilter === 'Em_execucao' ? 'is-active' : ''}`}
                  aria-pressed={journeyFilter === 'Em_execucao'}
                  onClick={() => setJourneyFilter((prev) => (prev === 'Em_execucao' ? 'all' : 'Em_execucao'))}
                >
                  Em andamento {journeyKpis.Em_execucao}
                </button>
                <button
                  type="button"
                  className={`journey-kpi-btn ${journeyFilter === 'Planejado' ? 'is-active' : ''}`}
                  aria-pressed={journeyFilter === 'Planejado'}
                  onClick={() => setJourneyFilter((prev) => (prev === 'Planejado' ? 'all' : 'Planejado'))}
                >
                  Planejado {journeyKpis.Planejado}
                </button>
                <button
                  type="button"
                  className={`journey-kpi-btn ${journeyFilter === 'Nao_iniciado' ? 'is-active' : ''}`}
                  aria-pressed={journeyFilter === 'Nao_iniciado'}
                  onClick={() => setJourneyFilter((prev) => (prev === 'Nao_iniciado' ? 'all' : 'Nao_iniciado'))}
                >
                  Stand-by {journeyKpis.Nao_iniciado}
                </button>
                <button
                  type="button"
                  className={`journey-kpi-btn ${journeyFilter === 'all' ? 'is-active' : ''}`}
                  aria-pressed={journeyFilter === 'all'}
                  onClick={() => setJourneyFilter('all')}
                >
                  Todos {activeTimeline.length}
                </button>
              </div>
              <div className="journey-kpi-meta-row">
                <p className="journey-kpi-meta">
                  Exibindo {filteredTimeline.length} de {activeTimeline.length} módulos ativos.
                  {disabledCount > 0 ? ` Desativados: ${disabledCount}.` : ''}
                </p>
                {disabledCount > 0 ? (
                  <button
                    type="button"
                    className="journey-kpi-toggle"
                    aria-expanded={showDisabledModules}
                    aria-controls={disabledModulesPanelId}
                    onClick={() => setShowDisabledModules((prev) => !prev)}
                  >
                    {showDisabledModules ? 'Ocultar desativados' : 'Gerenciar desativados'}
                  </button>
                ) : null}
              </div>
              <ul className="timeline">
                {filteredTimeline.length === 0 ? (
                  <li className="timeline-item">
                    <div className="timeline-copy">
                      {activeTimeline.length === 0 ? (
                        <>
                          <strong>Não há módulos ativos nesta jornada.</strong>
                          <p>
                            {disabledCount > 0
                              ? 'Todos os módulos estão desativados para este cliente.'
                              : 'Esta jornada ainda não possui módulos carregados.'}
                          </p>
                        </>
                      ) : (
                        <>
                          <strong>Sem módulos neste filtro.</strong>
                          <p>Altere o chip para visualizar outros módulos ativos nesta jornada.</p>
                        </>
                      )}
                    </div>
                  </li>
                ) : (
                  filteredTimeline.map((moduleItem: any) => {
                    const edit = moduleEdits[moduleItem.module_id] ?? {
                      status: 'Nao_iniciado',
                      notes: '',
                      custom_duration_days: ''
                    };
                    return (
                      <li key={moduleItem.module_id} className="timeline-item">
                        <div className="timeline-copy">
                          <strong>{moduleItem.code} - {moduleItem.name}</strong>
                          <p>{moduleItem.category} | padrão: {moduleItem.duration_days} diárias</p>
                          <p>Planejado para este cliente: {moduleItem.effective_duration_days} diárias</p>
                          <p>Concluído em: {moduleItem.completed_at ?? '-'}</p>
                          <p>
                            Turma vinculada: {moduleItem.last_cohort_code
                              ? `${moduleItem.last_cohort_code} - ${moduleItem.last_cohort_name ?? ''} (${statusLabel(moduleItem.last_cohort_status ?? 'Planejada')})`
                              : '-'}
                          </p>
                          <p>Módulo para este cliente: {moduleItem.is_enabled ? 'Ativo' : 'Desativado'}</p>
                        </div>
                        <div className="actions timeline-actions">
                          {moduleItem.is_enabled ? <StatusChip value={moduleItem.status} /> : <span className="chip">Desativado</span>}
                          <select
                            value={edit.status}
                            onChange={(event) => updateModuleEdit(moduleItem.module_id, {
                              status: event.target.value as ModuleEdit['status']
                            })}
                            disabled={!moduleItem.is_enabled}
                          >
                            {progressStatusOptions.map((option) => (
                              <option key={option} value={option}>{statusLabel(option)}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={1}
                            placeholder="Diárias custom"
                            value={edit.custom_duration_days}
                            onChange={(event) => updateModuleEdit(moduleItem.module_id, { custom_duration_days: event.target.value })}
                            disabled={!moduleItem.is_enabled}
                            className="timeline-days-input"
                          />
                          <input
                            placeholder="Observação do módulo"
                            value={edit.notes}
                            onChange={(event) => updateModuleEdit(moduleItem.module_id, { notes: event.target.value })}
                            disabled={!moduleItem.is_enabled}
                            className="timeline-notes-input"
                          />
                          <button
                            type="button"
                            onClick={() => saveModuleProgress(moduleItem.module_id)}
                            disabled={!moduleItem.is_enabled || savingModuleId === moduleItem.module_id}
                          >
                            Salvar módulo
                          </button>
                          <button
                            type="button"
                            onClick={() => markDone(moduleItem.module_id)}
                            disabled={!moduleItem.is_enabled || savingModuleId === moduleItem.module_id}
                          >
                            Concluir (Admin)
                          </button>
                          <button
                            type="button"
                            onClick={() => undoDone(moduleItem.module_id)}
                            disabled={!moduleItem.is_enabled || moduleItem.status !== 'Concluido' || savingModuleId === moduleItem.module_id}
                          >
                            Desfazer conclusão
                          </button>
                          <button type="button" onClick={() => toggleModule(moduleItem.module_id, Boolean(moduleItem.is_enabled))}>
                            {moduleItem.is_enabled ? 'Desativar módulo' : 'Ativar módulo'}
                          </button>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
              {disabledCount > 0 && showDisabledModules ? (
                <div className="journey-disabled-block" id={disabledModulesPanelId}>
                  <div className="journey-disabled-list">
                    {disabledTimeline.map((moduleItem: any) => (
                      <div key={moduleItem.module_id} className="journey-disabled-item">
                        <div className="timeline-copy">
                          <strong>{moduleItem.code} - {moduleItem.name}</strong>
                          <p>{moduleItem.category} | padrão: {moduleItem.duration_days} diárias</p>
                        </div>
                        <div className="actions timeline-actions">
                          <button type="button" onClick={() => toggleModule(moduleItem.module_id, Boolean(moduleItem.is_enabled))}>
                            Ativar módulo
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </Section>

            <Section title="Opcionais">
              <div className="table-wrap">
              <table className="table table-hover table-tight">
                <thead><tr><th>Código</th><th>Nome</th><th>Status</th></tr></thead>
                <tbody>
                  {data.optionals.map((optionalItem: any) => (
                    <tr key={optionalItem.id}>
                      <td>{optionalItem.code}</td>
                      <td>{optionalItem.name}</td>
                      <td><StatusChip value={optionalItem.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Section>
          </div>

          <Section title="Histórico de turmas">
            <div className="table-wrap">
            <table className="table table-hover table-tight">
              <thead><tr>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleHistorySort('cohort_code')}>Turma{historySortIndicator('cohort_code')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleHistorySort('start_date')}>Data{historySortIndicator('start_date')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleHistorySort('module_code')}>Módulo{historySortIndicator('module_code')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleHistorySort('entry_day')}>Dia de entrada{historySortIndicator('entry_day')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleHistorySort('status')}>Status alocação{historySortIndicator('status')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleHistorySort('cohort_status')}>Status turma{historySortIndicator('cohort_status')}</button></th>
                <th><button type="button" className="table-sort-btn" onClick={() => toggleHistorySort('executed_at')}>Executado em{historySortIndicator('executed_at')}</button></th>
              </tr></thead>
              <tbody>
                {sortedHistory.map((historyItem: any) => (
                  <tr key={historyItem.allocation_id}>
                    <td>{historyItem.cohort_code} - {historyItem.cohort_name}</td>
                    <td>{historyItem.start_date}</td>
                    <td>{historyItem.module_code} - {historyItem.module_name}</td>
                    <td>{historyItem.entry_day}</td>
                    <td><StatusChip value={historyItem.status} /></td>
                    <td><StatusChip value={historyItem.cohort_status} /></td>
                    <td>{historyItem.executed_at ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
