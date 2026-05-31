export type PlanningWorkspaceStatus = 'Rascunho' | 'Publicado' | 'Alteracao_pendente' | 'Arquivado';
export type PlanningMode = 'Manual' | 'Assistido' | 'Automatico';
export type PlanningCohortStatus = 'Rascunho' | 'Pronto' | 'Publicado' | 'Cancelado';
export type PlanningEncounterStatus = 'Rascunho' | 'Confirmacao_cliente' | 'Confirmado' | 'Publicado' | 'Cancelado';

export type PlanningEncounterPayload = {
  day_date: string;
  start_time: string;
  end_time: string;
};

export type PlanningConflict = {
  source_type: 'cohort' | 'calendar_activity' | 'planning_encounter';
  source_id: string;
  title: string;
  day_date: string;
  start_time: string | null;
  end_time: string | null;
};

export type PlanningEncounterRow = {
  id: string;
  workspace_id: string;
  planning_cohort_id: string;
  company_id: string;
  module_id: string;
  technician_id: string | null;
  encounter_index: number;
  day_date: string;
  start_time: string;
  end_time: string;
  status: PlanningEncounterStatus;
  notes: string | null;
  published_cohort_id: string | null;
  created_at: string;
  updated_at: string;
};
