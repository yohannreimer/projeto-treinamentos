import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../services/api';
import type { PlanningCohort, PlanningEncounter, PlanningEncounterStatus, PlanningWorkspaceDetail } from '../types';

type WorkspaceSummary = {
  id: string;
  name: string;
  status: string;
  client_count: number;
  encounter_count: number;
};

type PlanningPageProps = {
  detailReloadKey?: number;
};

type SavingEncounterState = {
  workspaceId: string;
  encounterId: string;
} | null;

const emptyEncounterDraft = {
  day_date: '',
  start_time: '',
  end_time: '',
  status: 'Rascunho' as PlanningEncounterStatus,
  notes: ''
};

const encounterStatuses: PlanningEncounterStatus[] = ['Rascunho', 'Confirmacao_cliente', 'Confirmado', 'Publicado', 'Cancelado'];

export function PlanningPage({ detailReloadKey = 0 }: PlanningPageProps = {}) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [planningDetail, setPlanningDetail] = useState<PlanningWorkspaceDetail | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [encounterDraft, setEncounterDraft] = useState(emptyEncounterDraft);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [savingEncounter, setSavingEncounter] = useState<SavingEncounterState>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const selectedEncounterIdRef = useRef<string | null>(null);
  const selectedWorkspaceIdRef = useRef('');
  const detailWorkspaceIdRef = useRef('');

  useEffect(() => {
    selectedEncounterIdRef.current = selectedEncounterId;
  }, [selectedEncounterId]);

  useEffect(() => {
    selectedWorkspaceIdRef.current = selectedWorkspaceId;
  }, [selectedWorkspaceId]);

  useEffect(() => {
    let isCurrent = true;

    async function loadWorkspaces() {
      try {
        setError('');
        const payload = await api.planningWorkspaces();
        if (!isCurrent) return;
        setWorkspaces(payload.workspaces);
        setSelectedWorkspaceId((currentId) => {
          const nextWorkspaceId = currentId || payload.workspaces[0]?.id || '';
          selectedWorkspaceIdRef.current = nextWorkspaceId;
          return nextWorkspaceId;
        });
      } catch (requestError) {
        if (!isCurrent) return;
        setError((requestError as Error).message);
      }
    }

    loadWorkspaces();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setPlanningDetail(null);
      setSelectedEncounterId(null);
      setIsLoadingDetail(false);
      return;
    }

    let isCurrent = true;
    const isSameWorkspaceReload = detailWorkspaceIdRef.current === selectedWorkspaceId;
    const encounterIdToPreserve = isSameWorkspaceReload ? selectedEncounterIdRef.current : null;
    detailWorkspaceIdRef.current = selectedWorkspaceId;
    setPlanningDetail(null);
    setIsLoadingDetail(true);
    if (!isSameWorkspaceReload) {
      setSelectedEncounterId(null);
      selectedEncounterIdRef.current = null;
    }

    async function loadWorkspace() {
      try {
        setError('');
        const payload = await api.planningWorkspace(selectedWorkspaceId);
        if (!isCurrent) return;
        const encounters = payload.cohorts.flatMap((cohort) => cohort.encounters);
        const nextSelectedEncounter = encounters.find((encounter) => encounter.id === encounterIdToPreserve) ?? encounters[0] ?? null;
        setPlanningDetail(payload);
        setSelectedEncounterId(nextSelectedEncounter?.id ?? null);
      } catch (requestError) {
        if (!isCurrent) return;
        setPlanningDetail(null);
        setSelectedEncounterId(null);
        setError((requestError as Error).message);
      } finally {
        if (isCurrent) {
          setIsLoadingDetail(false);
        }
      }
    }

    loadWorkspace();

    return () => {
      isCurrent = false;
    };
  }, [selectedWorkspaceId, detailReloadKey]);

  const selectedEncounter = useMemo(() => {
    if (!planningDetail || !selectedEncounterId) return null;
    return planningDetail.cohorts.flatMap((cohort) => cohort.encounters).find((encounter) => encounter.id === selectedEncounterId) ?? null;
  }, [planningDetail, selectedEncounterId]);

  useEffect(() => {
    if (!selectedEncounter) {
      setEncounterDraft(emptyEncounterDraft);
      return;
    }

    setEncounterDraft({
      day_date: selectedEncounter.day_date,
      start_time: selectedEncounter.start_time,
      end_time: selectedEncounter.end_time,
      status: selectedEncounter.status,
      notes: selectedEncounter.notes ?? ''
    });
  }, [selectedEncounter]);

  const selectedCohort = useMemo(() => {
    if (!planningDetail || !selectedEncounter) return null;
    return planningDetail.cohorts.find((cohort) => cohort.id === selectedEncounter.planning_cohort_id) ?? null;
  }, [planningDetail, selectedEncounter]);

  const selectedWorkspace = planningDetail?.workspace ?? null;
  const clients = planningDetail?.clients ?? [];
  const cohorts = planningDetail?.cohorts ?? [];
  const isSavingSelectedEncounter = Boolean(
    savingEncounter &&
      planningDetail &&
      selectedEncounter &&
      savingEncounter.workspaceId === planningDetail.workspace.id &&
      savingEncounter.encounterId === selectedEncounter.id
  );

  async function saveSelectedEncounter() {
    if (isSavingSelectedEncounter || !planningDetail || !selectedEncounter) return;

    const savingWorkspaceId = planningDetail.workspace.id;
    const savingEncounterId = selectedEncounter.id;
    try {
      setSavingEncounter({ workspaceId: savingWorkspaceId, encounterId: savingEncounterId });
      setError('');
      setMessage('');
      const updatedDetail = await api.updatePlanningEncounter(planningDetail.workspace.id, selectedEncounter.id, {
        day_date: encounterDraft.day_date,
        start_time: encounterDraft.start_time,
        end_time: encounterDraft.end_time,
        status: encounterDraft.status,
        notes: encounterDraft.notes || null
      });
      const updatedEncounter = updatedDetail.cohorts
        .flatMap((cohort) => cohort.encounters)
        .find((encounter) => encounter.id === savingEncounterId);

      if (selectedWorkspaceIdRef.current !== savingWorkspaceId || selectedEncounterIdRef.current !== savingEncounterId) return;
      setPlanningDetail(updatedDetail);
      setSelectedEncounterId(updatedEncounter?.id ?? null);
      setMessage('Encontro atualizado. Publique para sincronizar turmas e calendário.');
    } catch (requestError) {
      if (selectedWorkspaceIdRef.current !== savingWorkspaceId || selectedEncounterIdRef.current !== savingEncounterId) return;
      setMessage('');
      setError((requestError as Error).message || 'Falha ao atualizar encontro.');
    } finally {
      setSavingEncounter((currentSavingEncounter) => {
        if (
          currentSavingEncounter?.workspaceId === savingWorkspaceId &&
          currentSavingEncounter.encounterId === savingEncounterId
        ) {
          return null;
        }
        return currentSavingEncounter;
      });
    }
  }

  function renderEncounter(cohort: PlanningCohort, encounter: PlanningEncounter) {
    const isSelected = selectedEncounter?.id === encounter.id;

    return (
      <button
        className={`planning-encounter ${isSelected ? 'is-selected' : ''}`.trim()}
        key={encounter.id}
        onClick={() => setSelectedEncounterId(encounter.id)}
        type="button"
      >
        <strong>{encounter.day_date}</strong>
        <span>{encounter.start_time} - {encounter.end_time}</span>
        <small>{cohort.company_name} · {cohort.module_code}</small>
      </button>
    );
  }

  function selectWorkspace(workspaceId: string) {
    selectedWorkspaceIdRef.current = workspaceId;
    setSelectedWorkspaceId(workspaceId);
  }

  return (
    <div className="page planning-page">
      <header className="page-header planning-page-header">
        <div>
          <h1>Planejar</h1>
          <p>Rascunhe turmas por cliente e módulo, valide técnicos e publique encontros na agenda real.</p>
        </div>

        <div className="planning-workspace-switcher">
          <label>
            Workspace
            <select value={selectedWorkspaceId} onChange={(event) => selectWorkspace(event.target.value)}>
              {workspaces.length === 0 ? <option value="">Nenhum workspace</option> : null}
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {message ? <p className="success" role="status" aria-live="polite">{message}</p> : null}
      {error ? <p className="error" role="alert" aria-live="assertive">{error}</p> : null}

      <div className="planning-workbench">
        <aside className="planning-queue">
          <div className="planning-panel-header">
            <div>
              <h2>Fila de planejamento</h2>
              <p>{selectedWorkspace ? `${selectedWorkspace.status} · ${selectedWorkspace.mode}` : 'Selecione um workspace'}</p>
            </div>
          </div>

          <div className="planning-filter-row">
            <span>{clients.length} clientes</span>
            <span>{cohorts.length} turmas</span>
          </div>

          <div className="planning-client-list">
            {isLoadingDetail ? <p>Carregando carteira de planejamento.</p> : null}
            {!isLoadingDetail && clients.length === 0 ? <p>Nenhum cliente neste planejamento.</p> : null}
            {!isLoadingDetail && clients.map((client) => {
              const clientCohorts = cohorts.filter((cohort) => cohort.company_id === client.company_id);

              return (
                <section className="planning-client-block" key={client.company_id}>
                  <div className="planning-client-title">
                    <strong>{client.company_name}</strong>
                    <small>Prioridade {client.priority + 1}</small>
                  </div>

                  {clientCohorts.length === 0 ? <p>Nenhuma turma rascunhada.</p> : null}
                  {clientCohorts.map((cohort) => (
                    <div className="planning-module-row" key={cohort.id}>
                      <strong>{cohort.module_code}</strong>
                      <span>{cohort.module_name}</span>
                      <small>{cohort.encounters.length} encontros</small>
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        </aside>

        <section className="planning-calendar" aria-labelledby="planning-calendar-title">
          <div className="planning-panel-header">
            <div>
              <h2 id="planning-calendar-title">Agenda por horário</h2>
              <p>{isLoadingDetail ? 'Carregando grade' : selectedWorkspace ? `${selectedWorkspace.horizon_days} dias de horizonte` : 'Selecione um workspace'}</p>
            </div>
            <button type="button" onClick={() => setMessage('Validação será executada antes da publicação.')}>
              Validar e publicar
            </button>
          </div>

          <div className="planning-zoom-tabs" role="group" aria-label="Escala da agenda">
            <button className="is-selected" type="button" aria-pressed="true">Semana</button>
            <button type="button" aria-pressed="false">Mês</button>
            <button type="button" aria-pressed="false">Lista</button>
          </div>

          <div className="planning-time-grid">
            {isLoadingDetail ? <p>Carregando encontros do planejamento.</p> : null}
            {!isLoadingDetail && cohorts.length === 0 ? <p>Nenhum encontro planejado para este workspace.</p> : null}
            {!isLoadingDetail && cohorts.map((cohort) => (
              <section key={cohort.id}>
                <div className="planning-client-title">
                  <strong>{cohort.name}</strong>
                  <small>{cohort.delivery_mode} · {cohort.period}</small>
                </div>
                {cohort.encounters.map((encounter) => renderEncounter(cohort, encounter))}
              </section>
            ))}
          </div>
        </section>

        <aside className="planning-context-panel">
          <div className="planning-panel-header">
            <div>
              <h2>Painel contextual</h2>
              <p>Resumo e edição do item selecionado</p>
            </div>
          </div>

          <div className="planning-editor-summary">
            {isLoadingDetail ? (
              <p>Carregando painel contextual.</p>
            ) : selectedEncounter && selectedCohort ? (
              <>
                <dl>
                  <div>
                    <dt>Cliente</dt>
                    <dd>{selectedCohort.company_name}</dd>
                  </div>
                  <div>
                    <dt>Módulo</dt>
                    <dd>{selectedCohort.module_code} · {selectedCohort.module_name}</dd>
                  </div>
                  <div>
                    <dt>Agenda</dt>
                    <dd>{selectedEncounter.day_date}, {selectedEncounter.start_time} - {selectedEncounter.end_time}</dd>
                  </div>
                  <div>
                    <dt>Técnico</dt>
                    <dd>{selectedEncounter.technician_name || 'Não definido'}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{selectedEncounter.status}</dd>
                  </div>
                </dl>
                <div className="planning-editor-grid">
                  <label>
                    Data
                    <input
                      type="date"
                      value={encounterDraft.day_date}
                      onChange={(event) => setEncounterDraft((draft) => ({ ...draft, day_date: event.target.value }))}
                    />
                  </label>
                  <label>
                    Início
                    <input
                      type="time"
                      value={encounterDraft.start_time}
                      onChange={(event) => setEncounterDraft((draft) => ({ ...draft, start_time: event.target.value }))}
                    />
                  </label>
                  <label>
                    Fim
                    <input
                      type="time"
                      value={encounterDraft.end_time}
                      onChange={(event) => setEncounterDraft((draft) => ({ ...draft, end_time: event.target.value }))}
                    />
                  </label>
                  <label>
                    Status
                    <select
                      value={encounterDraft.status}
                      onChange={(event) => setEncounterDraft((draft) => ({ ...draft, status: event.target.value as PlanningEncounterStatus }))}
                    >
                      {encounterStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Observações
                    <textarea
                      value={encounterDraft.notes}
                      onChange={(event) => setEncounterDraft((draft) => ({ ...draft, notes: event.target.value }))}
                    />
                  </label>
                </div>
                <button type="button" disabled={isSavingSelectedEncounter} onClick={saveSelectedEncounter}>
                  {isSavingSelectedEncounter ? 'Salvando...' : 'Salvar encontro'}
                </button>
              </>
            ) : (
              <p>Selecione um encontro para revisar cliente, módulo, técnico e horário antes da publicação.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
