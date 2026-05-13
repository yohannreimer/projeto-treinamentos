import type { Express } from 'express';
import { z } from 'zod';
import { db, nowDateIso, uuid } from '../db.js';
import {
  findPlanningEncounterConflicts,
  publishPlanningWorkspace,
  slotsOverlap,
  suggestPlanningWindows,
  validatePlanningEncounterPayload
} from './service.js';

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

const addWorkspaceClientsSchema = z.object({
  company_ids: z.array(z.string()).min(1)
});

const encounterInputSchema = z.object({
  day_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  status: z.enum(planningEncounterStatusValues).default('Rascunho'),
  notes: z.string().nullable().optional()
});

const updateEncounterSchema = z.object({
  technician_id: z.string().nullable().optional(),
  day_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  status: z.enum(planningEncounterStatusValues).optional(),
  notes: z.string().nullable().optional()
});

const addPlanningEncountersSchema = z.object({
  technician_id: z.string().nullable().optional(),
  encounters: z.array(encounterInputSchema).min(1)
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

const suggestionSchema = z.object({
  module_id: z.string(),
  technician_ids: z.array(z.string()).min(1),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration_minutes: z.number().int().min(30).max(600),
  max_results: z.number().int().min(1).max(30).optional()
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

type PlanningEncounterUpdateRow = {
  id: string;
  workspace_id: string;
  planning_cohort_id: string;
  technician_id: string | null;
  day_date: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  published_cohort_id: string | null;
  workspace_status: string;
};

type PlanningEncounterConflictCheckRow = {
  id: string;
  day_date: string;
  start_time: string;
  end_time: string;
  status: string;
  technician_id: string | null;
  published_cohort_id: string | null;
};

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
  app.post('/planning/suggestions', (req, res) => {
    const parsed = suggestionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    return res.json({ suggestions: suggestPlanningWindows(parsed.data) });
  });

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

  app.post('/planning/workspaces/:workspaceId/clients', (req, res) => {
    const parsed = addWorkspaceClientsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const workspace = db.prepare('select id from planning_workspace where id = ?').get(req.params.workspaceId);
    if (!workspace) return res.status(404).json({ message: 'Planejamento não encontrado.' });

    const now = nowDateIso();
    const uniqueCompanyIds = Array.from(new Set(parsed.data.company_ids));
    const missingCompany = uniqueCompanyIds.find((companyId) => !db.prepare('select id from company where id = ?').get(companyId));
    if (missingCompany) return res.status(404).json({ message: 'Cliente não encontrado.' });

    const tx = db.transaction(() => {
      const insertClient = db.prepare(`
        insert or ignore into planning_workspace_client (workspace_id, company_id, priority, created_at)
        values (?, ?, 0, ?)
      `);
      uniqueCompanyIds.forEach((companyId) => insertClient.run(req.params.workspaceId, companyId, now));
      db.prepare('update planning_workspace set updated_at = ? where id = ?').run(now, req.params.workspaceId);
    });

    try {
      tx();
      return res.json(readWorkspace(req.params.workspaceId));
    } catch (error) {
      return res.status(400).json({ message: 'Não foi possível adicionar cliente.', detail: errorMessage(error) });
    }
  });

  app.delete('/planning/workspaces/:workspaceId/clients/:companyId', (req, res) => {
    const workspace = db.prepare('select id from planning_workspace where id = ?').get(req.params.workspaceId);
    if (!workspace) return res.status(404).json({ message: 'Planejamento não encontrado.' });

    const link = db.prepare(`
      select workspace_id, company_id
      from planning_workspace_client
      where workspace_id = ? and company_id = ?
    `).get(req.params.workspaceId, req.params.companyId);
    if (!link) return res.status(404).json({ message: 'Cliente não está neste planejamento.' });

    const now = nowDateIso();
    const tx = db.transaction(() => {
      db.prepare('delete from planning_cohort where workspace_id = ? and company_id = ?')
        .run(req.params.workspaceId, req.params.companyId);
      db.prepare('delete from planning_workspace_client where workspace_id = ? and company_id = ?')
        .run(req.params.workspaceId, req.params.companyId);
      db.prepare('update planning_workspace set updated_at = ? where id = ?').run(now, req.params.workspaceId);
    });

    try {
      tx();
      return res.json(readWorkspace(req.params.workspaceId));
    } catch (error) {
      return res.status(400).json({ message: 'Não foi possível remover cliente.', detail: errorMessage(error) });
    }
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

    const internalConflicts = payload.encounters.flatMap((encounter, index) => (
      payload.encounters.slice(index + 1).flatMap((other) => {
        if (
          payload.technician_id &&
          encounter.day_date === other.day_date &&
          slotsOverlap(encounter.start_time, encounter.end_time, other.start_time, other.end_time)
        ) {
          return [{
            source_type: 'planning_encounter' as const,
            source_id: 'new-planning-encounter',
            title: 'Encontro da mesma turma planejada',
            day_date: other.day_date,
            start_time: other.start_time,
            end_time: other.end_time
          }];
        }
        return [];
      })
    ));
    if (internalConflicts.length > 0) {
      return res.status(409).json({ message: 'Turma planejada possui conflito.', conflicts: internalConflicts });
    }

    const conflicts = payload.encounters.flatMap((encounter) => findPlanningEncounterConflicts({
      technician_id: payload.technician_id,
      day_date: encounter.day_date,
      start_time: encounter.start_time,
      end_time: encounter.end_time
    }));
    if (conflicts.length > 0) {
      return res.status(409).json({ message: 'Turma planejada possui conflito.', conflicts });
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

  app.post('/planning/workspaces/:workspaceId/cohorts/:cohortId/encounters', (req, res) => {
    const parsed = addPlanningEncountersSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const cohort = db.prepare(`
      select *
      from planning_cohort
      where id = ?
        and workspace_id = ?
        and status <> 'Cancelado'
    `).get(req.params.cohortId, req.params.workspaceId) as {
      id: string;
      company_id: string;
      module_id: string;
      technician_id: string | null;
    } | undefined;
    if (!cohort) return res.status(404).json({ message: 'Turma planejada não encontrada.' });

    const payload = parsed.data;
    const technicianId = payload.technician_id ?? null;
    if (technicianId) {
      const technician = db.prepare('select id from technician where id = ?').get(technicianId);
      if (!technician) return res.status(404).json({ message: 'Técnico não encontrado.' });
    }

    for (const encounter of payload.encounters) {
      const validation = validatePlanningEncounterPayload(encounter);
      if (!validation.ok) return res.status(400).json({ message: validation.message });
    }

    const internalConflicts = payload.encounters.flatMap((encounter, index) => (
      payload.encounters.slice(index + 1).flatMap((other) => {
        if (
          technicianId &&
          encounter.day_date === other.day_date &&
          slotsOverlap(encounter.start_time, encounter.end_time, other.start_time, other.end_time)
        ) {
          return [{
            source_type: 'planning_encounter' as const,
            source_id: 'new-planning-encounter',
            title: 'Encontro da mesma turma planejada',
            day_date: other.day_date,
            start_time: other.start_time,
            end_time: other.end_time
          }];
        }
        return [];
      })
    ));
    if (internalConflicts.length > 0) {
      return res.status(409).json({ message: 'Encontro possui conflito.', conflicts: internalConflicts });
    }

    const conflicts = payload.encounters.flatMap((encounter) => findPlanningEncounterConflicts({
      technician_id: technicianId,
      day_date: encounter.day_date,
      start_time: encounter.start_time,
      end_time: encounter.end_time
    }));
    if (conflicts.length > 0) {
      return res.status(409).json({ message: 'Encontro possui conflito.', conflicts });
    }

    const now = nowDateIso();
    const maxIndex = db.prepare(`
      select coalesce(max(encounter_index), 0) as max_index
      from planning_encounter
      where workspace_id = ?
        and planning_cohort_id = ?
    `).get(req.params.workspaceId, cohort.id) as { max_index: number };

    const tx = db.transaction(() => {
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
          cohort.id,
          cohort.company_id,
          cohort.module_id,
          technicianId,
          maxIndex.max_index + index + 1,
          encounter.day_date,
          encounter.start_time,
          encounter.end_time,
          encounter.status,
          encounter.notes ?? null,
          now,
          now
        );
      });

      const activeTechnicians = db.prepare(`
        select distinct technician_id
        from planning_encounter
        where workspace_id = ?
          and planning_cohort_id = ?
          and status <> 'Cancelado'
          and technician_id is not null
      `).all(req.params.workspaceId, cohort.id) as Array<{ technician_id: string }>;
      const nextCohortTechnicianId = activeTechnicians.length === 1 ? activeTechnicians[0].technician_id : null;
      db.prepare('update planning_cohort set technician_id = ?, updated_at = ? where id = ?')
        .run(nextCohortTechnicianId, now, cohort.id);
      db.prepare('update planning_workspace set updated_at = ? where id = ?').run(now, req.params.workspaceId);
    });

    try {
      tx();
      return res.status(201).json(readWorkspace(req.params.workspaceId));
    } catch (error) {
      return res.status(400).json({ message: 'Não foi possível adicionar encontros.', detail: errorMessage(error) });
    }
  });

  app.patch('/planning/workspaces/:workspaceId/encounters/:encounterId', (req, res) => {
    const parsed = updateEncounterSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const existing = db.prepare(`
      select pe.*, pw.status as workspace_status
      from planning_encounter pe
      join planning_workspace pw on pw.id = pe.workspace_id
      where pe.id = ? and pe.workspace_id = ?
    `).get(req.params.encounterId, req.params.workspaceId) as PlanningEncounterUpdateRow | undefined;
    if (!existing) return res.status(404).json({ message: 'Encontro não encontrado.' });

    const payload = parsed.data;
    const technicianWasProvided = Object.prototype.hasOwnProperty.call(payload, 'technician_id');
    if (technicianWasProvided && payload.technician_id !== null) {
      const technician = db.prepare('select id from technician where id = ?').get(payload.technician_id);
      if (!technician) return res.status(404).json({ message: 'Técnico não encontrado.' });
    }

    const next = {
      technician_id: payload.technician_id !== undefined ? payload.technician_id : existing.technician_id,
      day_date: payload.day_date ?? existing.day_date,
      start_time: payload.start_time ?? existing.start_time,
      end_time: payload.end_time ?? existing.end_time,
      status: payload.status ?? existing.status,
      notes: payload.notes !== undefined ? payload.notes : existing.notes
    };

    const validation = validatePlanningEncounterPayload(next);
    if (!validation.ok) return res.status(400).json({ message: validation.message });

    if (next.technician_id && next.status !== 'Cancelado') {
      const siblingRows = db.prepare(`
        select id, day_date, start_time, end_time, status, technician_id, published_cohort_id
        from planning_encounter
        where workspace_id = ?
          and planning_cohort_id = ?
          and (status <> 'Cancelado' or id = ?)
      `).all(req.params.workspaceId, existing.planning_cohort_id, existing.id) as PlanningEncounterConflictCheckRow[];

      const futureEncounters = siblingRows.map((encounter) => {
        if (encounter.id === existing.id) {
          return {
            id: encounter.id,
            technician_id: next.technician_id,
            day_date: next.day_date,
            start_time: next.start_time,
            end_time: next.end_time,
            status: next.status,
            published_cohort_id: encounter.published_cohort_id
          };
        }
        return {
          id: encounter.id,
          technician_id: encounter.technician_id,
          day_date: encounter.day_date,
          start_time: encounter.start_time,
          end_time: encounter.end_time,
          status: encounter.status,
          published_cohort_id: encounter.published_cohort_id
        };
      }).filter((encounter) => encounter.status !== 'Cancelado');

      const internalConflicts = futureEncounters.flatMap((encounter, index) => (
        futureEncounters.slice(index + 1).flatMap((other) => {
          if (
            encounter.technician_id &&
            other.technician_id &&
            encounter.technician_id === other.technician_id &&
            encounter.day_date === other.day_date &&
            slotsOverlap(encounter.start_time, encounter.end_time, other.start_time, other.end_time)
          ) {
            return [{
              planning_encounter_id: encounter.id,
              source_type: 'planning_encounter' as const,
              source_id: other.id,
              title: 'Encontro da mesma turma planejada',
              day_date: other.day_date,
              start_time: other.start_time,
              end_time: other.end_time
            }];
          }
          return [];
        })
      ));
      if (internalConflicts.length > 0) {
        return res.status(409).json({ message: 'Encontro possui conflito.', conflicts: internalConflicts });
      }

      const conflicts = futureEncounters.flatMap((encounter) => {
        return findPlanningEncounterConflicts({
          technician_id: encounter.technician_id,
          day_date: encounter.day_date,
          start_time: encounter.start_time,
          end_time: encounter.end_time,
          exclude_planning_encounter_id: encounter.id,
          exclude_published_cohort_id: encounter.published_cohort_id ?? undefined
        }).map((conflict) => ({ planning_encounter_id: encounter.id, ...conflict }));
      });
      if (conflicts.length > 0) {
        return res.status(409).json({ message: 'Encontro possui conflito.', conflicts });
      }
    } else if (next.status !== 'Cancelado') {
      const conflicts = findPlanningEncounterConflicts({
        technician_id: next.technician_id,
        day_date: next.day_date,
        start_time: next.start_time,
        end_time: next.end_time,
        exclude_planning_encounter_id: existing.id,
        exclude_published_cohort_id: existing.published_cohort_id ?? undefined
      });
      if (conflicts.length > 0) {
        return res.status(409).json({ message: 'Encontro possui conflito.', conflicts });
      }
    }

    const now = nowDateIso();
    const nextWorkspaceStatus = existing.workspace_status === 'Publicado'
      ? 'Alteracao_pendente'
      : existing.workspace_status;
    const tx = db.transaction(() => {
      db.prepare(`
        update planning_encounter
        set technician_id = ?,
            day_date = ?,
            start_time = ?,
            end_time = ?,
            status = ?,
            notes = ?,
            updated_at = ?
        where id = ?
      `).run(
        next.technician_id,
        next.day_date,
        next.start_time,
        next.end_time,
        next.status,
        next.notes,
        now,
        existing.id
      );
      db.prepare('update planning_workspace set status = ?, updated_at = ? where id = ?')
        .run(nextWorkspaceStatus, now, req.params.workspaceId);
      const activeTechnicians = db.prepare(`
        select distinct technician_id
        from planning_encounter
        where workspace_id = ?
          and planning_cohort_id = ?
          and status <> 'Cancelado'
          and technician_id is not null
      `).all(req.params.workspaceId, existing.planning_cohort_id) as Array<{ technician_id: string }>;
      const nextCohortTechnicianId = activeTechnicians.length === 1 ? activeTechnicians[0].technician_id : null;
      db.prepare(`
        update planning_cohort
        set technician_id = ?,
            updated_at = ?
        where id = ?
          and workspace_id = ?
      `).run(nextCohortTechnicianId, now, existing.planning_cohort_id, req.params.workspaceId);
    });

    try {
      tx();
      return res.json(readWorkspace(req.params.workspaceId));
    } catch (error) {
      return res.status(400).json({ message: 'Não foi possível atualizar encontro.', detail: errorMessage(error) });
    }
  });

  app.post('/planning/workspaces/:workspaceId/validate', (req, res) => {
    const detail = readWorkspace(req.params.workspaceId);
    if (!detail) return res.status(404).json({ message: 'Planejamento não encontrado.' });
    const unallocated = detail.cohorts.filter((cohort) => cohort.status !== 'Cancelado').flatMap((cohort) => (
      cohort.encounters
        .filter((encounter) => encounter.status !== 'Cancelado' && !encounter.technician_id)
        .map((encounter) => ({ planning_encounter_id: encounter.id, reason: 'sem_tecnico' }))
    ));
    const conflicts = detail.cohorts.filter((cohort) => cohort.status !== 'Cancelado').flatMap((cohort) => (
      cohort.encounters.filter((encounter) => encounter.status !== 'Cancelado').flatMap((encounter) => findPlanningEncounterConflicts({
        technician_id: encounter.technician_id,
        day_date: encounter.day_date,
        start_time: encounter.start_time,
        end_time: encounter.end_time,
        exclude_planning_encounter_id: encounter.id,
        exclude_published_cohort_id: encounter.published_cohort_id ?? undefined
      }).map((conflict) => ({ planning_encounter_id: encounter.id, ...conflict })))
    ));
    return res.json({ ok: conflicts.length === 0 && unallocated.length === 0, conflicts, unallocated });
  });

  app.post('/planning/workspaces/:workspaceId/publish', (req, res) => {
    const detail = readWorkspace(req.params.workspaceId);
    if (!detail) return res.status(404).json({ message: 'Planejamento não encontrado.' });

    const unallocated = detail.cohorts.filter((cohort) => cohort.status !== 'Cancelado').flatMap((cohort) => (
      cohort.encounters
        .filter((encounter) => encounter.status !== 'Cancelado' && !encounter.technician_id)
        .map((encounter) => ({ planning_encounter_id: encounter.id, reason: 'sem_tecnico' }))
    ));
    if (unallocated.length > 0) {
      return res.status(409).json({ message: 'Planejamento possui encontros sem técnico.', unallocated });
    }

    const conflicts = detail.cohorts.filter((cohort) => cohort.status !== 'Cancelado').flatMap((cohort) => (
      cohort.encounters.filter((encounter) => encounter.status !== 'Cancelado').flatMap((encounter) => findPlanningEncounterConflicts({
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
