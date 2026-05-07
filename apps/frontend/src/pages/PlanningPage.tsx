import { useEffect, useMemo, useState } from 'react';

import { api } from '../services/api';
import type { PlanningCohort, PlanningEncounter, PlanningWorkspaceDetail } from '../types';

type WorkspaceSummary = {
  id: string;
  name: string;
  status: string;
  client_count: number;
  encounter_count: number;
};

export function PlanningPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [planningDetail, setPlanningDetail] = useState<PlanningWorkspaceDetail | null>(null);
  const [selectedEncounter, setSelectedEncounter] = useState<PlanningEncounter | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let isCurrent = true;

    async function loadWorkspaces() {
      try {
        setError('');
        const payload = await api.planningWorkspaces();
        if (!isCurrent) return;
        setWorkspaces(payload.workspaces);
        setSelectedWorkspaceId((currentId) => currentId || payload.workspaces[0]?.id || '');
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
      setSelectedEncounter(null);
      return;
    }

    let isCurrent = true;

    async function loadWorkspace() {
      try {
        setError('');
        const payload = await api.planningWorkspace(selectedWorkspaceId);
        if (!isCurrent) return;
        setPlanningDetail(payload);
        setSelectedEncounter(payload.cohorts[0]?.encounters[0] ?? null);
      } catch (requestError) {
        if (!isCurrent) return;
        setPlanningDetail(null);
        setSelectedEncounter(null);
        setError((requestError as Error).message);
      }
    }

    loadWorkspace();

    return () => {
      isCurrent = false;
    };
  }, [selectedWorkspaceId]);

  const selectedCohort = useMemo(() => {
    if (!planningDetail || !selectedEncounter) return null;
    return planningDetail.cohorts.find((cohort) => cohort.id === selectedEncounter.planning_cohort_id) ?? null;
  }, [planningDetail, selectedEncounter]);

  const selectedWorkspace = planningDetail?.workspace ?? null;
  const clients = planningDetail?.clients ?? [];
  const cohorts = planningDetail?.cohorts ?? [];

  function renderEncounter(cohort: PlanningCohort, encounter: PlanningEncounter) {
    const isSelected = selectedEncounter?.id === encounter.id;

    return (
      <button
        className={`planning-encounter ${isSelected ? 'is-selected' : ''}`.trim()}
        key={encounter.id}
        onClick={() => setSelectedEncounter(encounter)}
        type="button"
      >
        <strong>{encounter.day_date}</strong>
        <span>{encounter.start_time} - {encounter.end_time}</span>
        <small>{cohort.company_name} · {cohort.module_code}</small>
      </button>
    );
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
            <select value={selectedWorkspaceId} onChange={(event) => setSelectedWorkspaceId(event.target.value)}>
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

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

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
            {clients.map((client) => {
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

        <main className="planning-calendar">
          <div className="planning-panel-header">
            <div>
              <h2>Agenda por horário</h2>
              <p>{selectedWorkspace ? `${selectedWorkspace.horizon_days} dias de horizonte` : 'Carregando grade'}</p>
            </div>
            <button type="button" onClick={() => setMessage('Validação será executada antes da publicação.')}>
              Validar e publicar
            </button>
          </div>

          <div className="planning-zoom-tabs" aria-label="Escala da agenda">
            <button className="is-selected" type="button">Semana</button>
            <button type="button">Mês</button>
            <button type="button">Lista</button>
          </div>

          <div className="planning-time-grid">
            {cohorts.length === 0 ? <p>Nenhum encontro planejado para este workspace.</p> : null}
            {cohorts.map((cohort) => (
              <section key={cohort.id}>
                <div className="planning-client-title">
                  <strong>{cohort.name}</strong>
                  <small>{cohort.delivery_mode} · {cohort.period}</small>
                </div>
                {cohort.encounters.map((encounter) => renderEncounter(cohort, encounter))}
              </section>
            ))}
          </div>
        </main>

        <aside className="planning-context-panel">
          <div className="planning-panel-header">
            <div>
              <h2>Painel contextual</h2>
              <p>Resumo somente leitura do item selecionado</p>
            </div>
          </div>

          <div className="planning-editor-summary">
            {selectedEncounter && selectedCohort ? (
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
                {selectedEncounter.notes ? <p>{selectedEncounter.notes}</p> : null}
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
