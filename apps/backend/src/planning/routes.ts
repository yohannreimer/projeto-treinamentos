import type { Express } from 'express';
import { z } from 'zod';
import { db, nowDateIso, uuid } from '../db.js';
import { findPlanningEncounterConflicts, publishPlanningWorkspace, validatePlanningEncounterPayload } from './service.js';

const planningModeValues = ['Manual', 'Assistido', 'Automatico'] as const;
const planningCohortStatusValues = ['Rascunho', 'Pronto', 'Publicado', 'Cancelado'] as const;
const planningEncounterStatusValues = ['Rascunho', 'Confirmacao_cliente', 'Confirmado', 'Publicado', 'Cancelado'] as const;

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(3),
  mode: z.enum(planningModeValues).default('Manual'),
  horizon_days: z.number().int().min(7).max(120).default(60),
  notes: z.string().nullable().optional(),
  company_ids: z.array(z.string()).default([])
});

const encounterInputSchema = z.object({
  day_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  status: z.enum(planningEncounterStatusValues).default('Rascunho'),
  notes: z.string().nullable().optional()
});

const createPlanningCohortSchema = z.object({
  company_id: z.string(),
  module_id: z.string(),
  technician_id: z.string().nullable().optional(),
  name: z.string().trim().min(3),
  status: z.enum(planningCohortStatusValues).default('Rascunho'),
  delivery_mode: z.enum(['Online', 'Presencial', 'Hibrida']).default('Online'),
  period: z.enum(['Integral', 'Meio_periodo']).default('Meio_periodo'),
  notes: z.string().nullable().optional(),
  encounters: z.array(encounterInputSchema).default([])
});

type WorkspaceReadModel = {
  workspace: unknown;
  clients: unknown[];
  cohorts: Array<{ id: string; encounters: PlanningEncounterReadRow[] } & Record<string, unknown>>;
};

type PlanningEncounterReadRow = {
  planning_cohort_id: string;
  technician_id: string | null;
  day_date: string;
  start_time: string;
  end_time: string;
  id: string;
  published_cohort_id: string | null;
} & Record<string, unknown>;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function readWorkspace(workspaceId: string): WorkspaceReadModel | null {
  const workspace = db.prepare('select * from planning_workspace where id = ?').get(workspaceId);
  if (!workspace) return null;

  const clients = db.prepare(`
    select pwc.company_id, c.name as company_name, pwc.priority
    from planning_workspace_client pwc
    join company c on c.id = pwc.company_id
    where pwc.workspace_id = ?
    order by pwc.priority desc, c.name asc
  `).all(workspaceId);

  const cohorts = db.prepare(`
    select pc.*, c.name as company_name, mt.code as module_code, mt.name as module_name, t.name as technician_name
    from planning_cohort pc
    join company c on c.id = pc.company_id
    join module_template mt on mt.id = pc.module_id
    left join technician t on t.id = pc.technician_id
    where pc.workspace_id = ?
    order by c.name asc, mt.code asc, pc.created_at asc
  `).all(workspaceId) as Array<{ id: string } & Record<string, unknown>>;

  const encounterRows = db.prepare(`
    select pe.*, t.name as technician_name
    from planning_encounter pe
    left join technician t on t.id = pe.technician_id
    where pe.workspace_id = ?
    order by pe.day_date asc, pe.start_time asc, pe.encounter_index asc
  `).all(workspaceId) as PlanningEncounterReadRow[];

  return {
    workspace,
    clients,
    cohorts: cohorts.map((cohort) => ({
      ...cohort,
      encounters: encounterRows.filter((encounter) => encounter.planning_cohort_id === cohort.id)
    }))
  };
}

export function registerPlanningRoutes(app: Express) {
  app.get('/planning/workspaces', (_req, res) => {
    const rows = db.prepare(`
      select pw.*,
        (select count(*) from planning_workspace_client pwc where pwc.workspace_id = pw.id) as client_count,
        (select count(*) from planning_encounter pe where pe.workspace_id = pw.id and pe.status <> 'Cancelado') as encounter_count
      from planning_workspace pw
      where pw.status <> 'Arquivado'
      order by pw.updated_at desc
    `).all();
    return res.json({ workspaces: rows });
  });

  app.post('/planning/workspaces', (req, res) => {
    const parsed = createWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const payload = parsed.data;
    const now = nowDateIso();
    const workspaceId = uuid('pln');
    const uniqueCompanyIds = Array.from(new Set(payload.company_ids));

    const tx = db.transaction(() => {
      db.prepare(`
        insert into planning_workspace (id, name, status, mode, horizon_days, notes, created_at, updated_at)
        values (?, ?, 'Rascunho', ?, ?, ?, ?, ?)
      `).run(workspaceId, payload.name.trim(), payload.mode, payload.horizon_days, payload.notes ?? null, now, now);

      const insertClient = db.prepare(`
        insert or ignore into planning_workspace_client (workspace_id, company_id, priority, created_at)
        values (?, ?, 0, ?)
      `);
      uniqueCompanyIds.forEach((companyId) => insertClient.run(workspaceId, companyId, now));
    });

    try {
      tx();
      return res.status(201).json(readWorkspace(workspaceId));
    } catch (error) {
      return res.status(400).json({ message: 'Não foi possível criar planejamento.', detail: errorMessage(error) });
    }
  });

  app.get('/planning/workspaces/:workspaceId', (req, res) => {
    const result = readWorkspace(req.params.workspaceId);
    if (!result) return res.status(404).json({ message: 'Planejamento não encontrado.' });
    return res.json(result);
  });

  app.post('/planning/workspaces/:workspaceId/cohorts', (req, res) => {
    const parsed = createPlanningCohortSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const workspace = db.prepare('select id from planning_workspace where id = ?').get(req.params.workspaceId);
    if (!workspace) return res.status(404).json({ message: 'Planejamento não encontrado.' });

    const payload = parsed.data;
    const now = nowDateIso();
    const planningCohortId = uuid('plc');

    for (const encounter of payload.encounters) {
      const validation = validatePlanningEncounterPayload(encounter);
      if (!validation.ok) return res.status(400).json({ message: validation.message });
    }

    const tx = db.transaction(() => {
      db.prepare(`
        insert or ignore into planning_workspace_client (workspace_id, company_id, priority, created_at)
        values (?, ?, 0, ?)
      `).run(req.params.workspaceId, payload.company_id, now);

      db.prepare(`
        insert into planning_cohort (
          id, workspace_id, company_id, module_id, technician_id, name, status,
          delivery_mode, period, notes, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        planningCohortId,
        req.params.workspaceId,
        payload.company_id,
        payload.module_id,
        payload.technician_id ?? null,
        payload.name.trim(),
        payload.status,
        payload.delivery_mode,
        payload.period,
        payload.notes ?? null,
        now,
        now
      );

      const insertEncounter = db.prepare(`
        insert into planning_encounter (
          id, workspace_id, planning_cohort_id, company_id, module_id, technician_id,
          encounter_index, day_date, start_time, end_time, status, notes, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      payload.encounters.forEach((encounter, index) => {
        insertEncounter.run(
          uuid('ple'),
          req.params.workspaceId,
          planningCohortId,
          payload.company_id,
          payload.module_id,
          payload.technician_id ?? null,
          index + 1,
          encounter.day_date,
          encounter.start_time,
          encounter.end_time,
          encounter.status,
          encounter.notes ?? null,
          now,
          now
        );
      });
      db.prepare('update planning_workspace set updated_at = ? where id = ?').run(now, req.params.workspaceId);
    });

    try {
      tx();
      const detail = readWorkspace(req.params.workspaceId);
      const cohort = detail?.cohorts.find((item) => item.id === planningCohortId);
      return res.status(201).json({ cohort, encounters: cohort?.encounters ?? [] });
    } catch (error) {
      return res.status(400).json({ message: 'Não foi possível criar turma planejada.', detail: errorMessage(error) });
    }
  });

  app.post('/planning/workspaces/:workspaceId/validate', (req, res) => {
    const detail = readWorkspace(req.params.workspaceId);
    if (!detail) return res.status(404).json({ message: 'Planejamento não encontrado.' });
    const conflicts = detail.cohorts.flatMap((cohort) => (
      cohort.encounters.flatMap((encounter) => findPlanningEncounterConflicts({
        technician_id: encounter.technician_id,
        day_date: encounter.day_date,
        start_time: encounter.start_time,
        end_time: encounter.end_time,
        exclude_planning_encounter_id: encounter.id,
        exclude_published_cohort_id: encounter.published_cohort_id ?? undefined
      }).map((conflict) => ({ planning_encounter_id: encounter.id, ...conflict })))
    ));
    return res.json({ ok: conflicts.length === 0, conflicts });
  });

  app.post('/planning/workspaces/:workspaceId/publish', (req, res) => {
    const detail = readWorkspace(req.params.workspaceId);
    if (!detail) return res.status(404).json({ message: 'Planejamento não encontrado.' });

    const conflicts = detail.cohorts.flatMap((cohort) => (
      cohort.encounters.flatMap((encounter) => findPlanningEncounterConflicts({
        technician_id: encounter.technician_id,
        day_date: encounter.day_date,
        start_time: encounter.start_time,
        end_time: encounter.end_time,
        exclude_planning_encounter_id: encounter.id,
        exclude_published_cohort_id: encounter.published_cohort_id ?? undefined
      }).map((conflict) => ({ planning_encounter_id: encounter.id, ...conflict })))
    ));
    if (conflicts.length > 0) {
      return res.status(409).json({ message: 'Planejamento possui conflitos.', conflicts });
    }

    try {
      return res.json(publishPlanningWorkspace(req.params.workspaceId));
    } catch (error) {
      return res.status(400).json({
        message: 'Não foi possível publicar planejamento.',
        detail: errorMessage(error)
      });
    }
  });
}
