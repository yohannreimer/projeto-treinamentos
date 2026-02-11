import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { clearAllData, db, initDb, nowDateIso, seedDb, uuid } from './db.js';
import { importWorkbook } from './workbookImport.js';
import type { AllocationStatus, ModuleProgressStatus } from './types.js';

initDb();
seedDb();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT ?? 4000);
const INSTALLATION_CODES = ['960001010', 'MOD-01'] as const;
const DEFAULT_WORKBOOK_PATH = '/Users/yohannreimer/Downloads/Planejamento_Jornada_Treinamentos_v3.xlsx';

const cohortBlockSchema = z.object({
  module_id: z.string(),
  order_in_cohort: z.number().int().positive(),
  start_day_offset: z.number().int().positive(),
  duration_days: z.number().int().positive()
});

const createCohortSchema = z.object({
  code: z.string().min(3),
  name: z.string().min(3),
  start_date: z.string().min(10),
  technician_id: z.string().optional().nullable(),
  status: z.enum(['Planejada', 'Aguardando_quorum', 'Confirmada', 'Concluida', 'Cancelada']).default('Planejada'),
  capacity_companies: z.number().int().positive(),
  notes: z.string().optional().nullable(),
  blocks: z.array(cohortBlockSchema).min(1)
});

const updateCohortSchema = z.object({
  code: z.string().min(3).optional(),
  name: z.string().min(3).optional(),
  start_date: z.string().min(10).optional(),
  technician_id: z.string().nullable().optional(),
  status: z.enum(['Planejada', 'Aguardando_quorum', 'Confirmada', 'Concluida', 'Cancelada']).optional(),
  capacity_companies: z.number().int().positive().optional(),
  notes: z.string().nullable().optional(),
  blocks: z.array(cohortBlockSchema).min(1).optional()
});

const createAllocationSchema = z.object({
  cohort_id: z.string(),
  company_id: z.string(),
  module_id: z.string(),
  entry_day: z.number().int().positive(),
  notes: z.string().optional().nullable()
});

const guidedAllocationSchema = z.object({
  company_id: z.string(),
  entry_module_id: z.string(),
  module_ids: z.array(z.string()).min(1),
  notes: z.string().optional().nullable()
});

const technicianConflictCheckSchema = z.object({
  technician_id: z.string(),
  start_date: z.string().min(10),
  status: z.enum(['Planejada', 'Aguardando_quorum', 'Confirmada', 'Concluida', 'Cancelada']).default('Planejada'),
  blocks: z.array(cohortBlockSchema).min(1),
  exclude_cohort_id: z.string().optional()
});

const licenseCreateSchema = z.object({
  company_id: z.string(),
  program_id: z.string(),
  user_name: z.string().min(1),
  module_list: z.string().min(1),
  license_identifier: z.string().min(1),
  renewal_cycle: z.enum(['Mensal', 'Anual']).default('Mensal'),
  expires_at: z.string().min(10),
  notes: z.string().nullable().optional()
});

const licenseUpdateSchema = z.object({
  company_id: z.string().optional(),
  program_id: z.string().optional(),
  user_name: z.string().min(1).optional(),
  module_list: z.string().min(1).optional(),
  license_identifier: z.string().min(1).optional(),
  renewal_cycle: z.enum(['Mensal', 'Anual']).optional(),
  expires_at: z.string().min(10).optional(),
  notes: z.string().nullable().optional()
});

function getInstallationModule(): { id: string; code: string } | null {
  const row = db.prepare(`
    select id, code
    from module_template
    where code in (?, ?)
    order by case code
      when ? then 0
      when ? then 1
      else 2
    end
    limit 1
  `).get(
    INSTALLATION_CODES[0],
    INSTALLATION_CODES[1],
    INSTALLATION_CODES[0],
    INSTALLATION_CODES[1]
  ) as { id: string; code: string } | undefined;

  return row ?? null;
}

function getInstallationModuleId(): string | null {
  return getInstallationModule()?.id ?? null;
}

function getInstallationModuleCode(): string | null {
  return getInstallationModule()?.code ?? null;
}

function hasModuleEnabled(companyId: string, moduleId: string): boolean {
  const row = db.prepare(`
    select coalesce(is_enabled, 1) as is_enabled
    from company_module_activation
    where company_id = ? and module_id = ?
  `).get(companyId, moduleId) as { is_enabled: number } | undefined;

  return typeof row === 'undefined' ? true : row.is_enabled === 1;
}

function ensureCompanyDefaultRows(companyId: string) {
  const moduleRows = db.prepare('select id from module_template').all() as Array<{ id: string }>;
  const insertProgress = db.prepare(`
    insert or ignore into company_module_progress (id, company_id, module_id, status, notes, completed_at)
    values (?, ?, ?, 'Nao_iniciado', null, null)
  `);
  const insertActivation = db.prepare(`
    insert or ignore into company_module_activation (company_id, module_id, is_enabled)
    values (?, ?, 1)
  `);

  moduleRows.forEach((module) => {
    insertProgress.run(uuid('prog'), companyId, module.id);
    insertActivation.run(companyId, module.id);
  });
}

function hasModuleCompleted(companyId: string, moduleId: string): boolean {
  const row = db.prepare(`
    select 1 as ok
    from company_module_progress
    where company_id = ? and module_id = ? and status = 'Concluido'
    limit 1
  `).get(companyId, moduleId) as { ok: number } | undefined;

  return Boolean(row?.ok);
}

function moduleExistsInCohort(cohortId: string, moduleId: string): boolean {
  const row = db.prepare(`
    select 1 as ok
    from cohort_module_block
    where cohort_id = ? and module_id = ?
    limit 1
  `).get(cohortId, moduleId) as { ok: number } | undefined;

  return Boolean(row?.ok);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'item';
}

function validateBlocks(blocks: Array<{
  module_id: string;
  order_in_cohort: number;
  start_day_offset: number;
  duration_days: number;
}>) {
  if (blocks.length === 0) {
    throw new Error('Turma precisa ter ao menos um bloco');
  }

  const seenOrders = new Set<number>();
  const seenModules = new Set<string>();
  for (const block of blocks) {
    if (seenOrders.has(block.order_in_cohort)) {
      throw new Error('Cada bloco precisa ter ordem unica na turma');
    }
    if (seenModules.has(block.module_id)) {
      throw new Error('Modulo repetido na turma nao e permitido no MVP');
    }
    seenOrders.add(block.order_in_cohort);
    seenModules.add(block.module_id);
  }

  const sorted = [...blocks].sort((a, b) => a.order_in_cohort - b.order_in_cohort);
  let expectedStart = 1;
  sorted.forEach((block, index) => {
    const expectedOrder = index + 1;
    if (block.order_in_cohort !== expectedOrder) {
      throw new Error('A ordem dos blocos deve ser sequencial (1..N)');
    }
    if (block.start_day_offset !== expectedStart) {
      throw new Error('Blocos devem ser sequenciais sem gaps. Ajuste os dias de inicio.');
    }
    expectedStart += block.duration_days;
  });
}

function parseIsoDate(dateIso: string): Date {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function normalizeBusinessStart(dateIso: string): string {
  const date = parseIsoDate(dateIso);
  while (isWeekend(date)) {
    date.setDate(date.getDate() + 1);
  }
  return isoDate(date);
}

function addBusinessDays(dateIso: string, offset: number): string {
  const date = parseIsoDate(normalizeBusinessStart(dateIso));
  let moved = 0;
  while (moved < offset) {
    date.setDate(date.getDate() + 1);
    if (!isWeekend(date)) {
      moved += 1;
    }
  }
  return isoDate(date);
}

function cohortBusinessDates(
  startDate: string,
  blocks: Array<{ start_day_offset: number; duration_days: number }>
): string[] {
  const totalDays = blocks.length === 0
    ? 1
    : Math.max(
      1,
      ...blocks.map((block) => block.start_day_offset + block.duration_days - 1)
    );

  const dates: string[] = [];
  for (let day = 0; day < totalDays; day += 1) {
    dates.push(addBusinessDays(startDate, day));
  }
  return dates;
}

function formatDatePtBr(dateIso: string): string {
  return parseIsoDate(dateIso).toLocaleDateString('pt-BR');
}

function dayDiff(fromIsoDate: string, toIsoDate: string): number {
  const from = parseIsoDate(fromIsoDate).getTime();
  const to = parseIsoDate(toIsoDate).getTime();
  return Math.round((to - from) / 86400000);
}

function renewalAlertWindowDays(renewalCycle: 'Mensal' | 'Anual'): number {
  return renewalCycle === 'Anual' ? 30 : 7;
}

function nextRenewalDate(currentExpiresAt: string, renewalCycle: 'Mensal' | 'Anual'): string {
  const today = parseIsoDate(nowDateIso());
  const current = parseIsoDate(currentExpiresAt);
  const base = current.getTime() < today.getTime() ? today : current;
  const next = new Date(base);
  if (renewalCycle === 'Anual') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setDate(next.getDate() + 30);
  }
  return isoDate(next);
}

function findTechnicianConflict(params: {
  technicianId: string;
  startDate: string;
  blocks: Array<{ start_day_offset: number; duration_days: number }>;
  excludeCohortId?: string;
}): { id: string; code: string; name: string; conflictDate: string } | null {
  const rows = params.excludeCohortId
    ? db.prepare(`
      select id, code, name, start_date
      from cohort
      where technician_id = ?
        and status <> 'Cancelada'
        and id <> ?
      order by date(start_date) asc
    `).all(params.technicianId, params.excludeCohortId)
    : db.prepare(`
      select id, code, name, start_date
      from cohort
      where technician_id = ?
        and status <> 'Cancelada'
      order by date(start_date) asc
    `).all(params.technicianId);

  const candidateCohorts = rows as Array<{ id: string; code: string; name: string; start_date: string }>;
  const newDateSet = new Set(cohortBusinessDates(params.startDate, params.blocks));
  const selectBlocks = db.prepare(`
    select start_day_offset, duration_days
    from cohort_module_block
    where cohort_id = ?
    order by order_in_cohort asc
  `);

  for (const cohort of candidateCohorts) {
    const existingBlocks = selectBlocks.all(cohort.id) as Array<{ start_day_offset: number; duration_days: number }>;
    const existingDates = cohortBusinessDates(cohort.start_date, existingBlocks);
    const overlap = existingDates.find((dateIso) => newDateSet.has(dateIso));
    if (overlap) {
      return {
        id: cohort.id,
        code: cohort.code,
        name: cohort.name,
        conflictDate: overlap
      };
    }
  }

  return null;
}

function getAdminCatalog() {
  const modules = db.prepare('select * from module_template order by code asc').all() as Array<{
    id: string;
    code: string;
    category: string;
    name: string;
    description: string | null;
    duration_days: number;
    profile: string | null;
    is_mandatory: number;
  }>;

  const prereqRows = db.prepare(`
    select mp.module_id,
      mt.id as prerequisite_module_id,
      mt.code as prerequisite_code,
      mt.name as prerequisite_name
    from module_prerequisite mp
    join module_template mt on mt.id = mp.prerequisite_module_id
    order by mt.code asc
  `).all() as Array<{
    module_id: string;
    prerequisite_module_id: string;
    prerequisite_code: string;
    prerequisite_name: string;
  }>;

  const prereqsByModule = new Map<string, Array<{ id: string; code: string; name: string }>>();
  for (const row of prereqRows) {
    const list = prereqsByModule.get(row.module_id) ?? [];
    list.push({
      id: row.prerequisite_module_id,
      code: row.prerequisite_code,
      name: row.prerequisite_name
    });
    prereqsByModule.set(row.module_id, list);
  }

  const optionalModules = db.prepare('select * from optional_module order by code asc').all();
  const installationCode = getInstallationModuleCode();
  const installationModule = installationCode
    ? modules.find((module) => module.code === installationCode)
    : undefined;
  return {
    modules: modules.map((module) => ({
      ...module,
      prerequisites: (() => {
        const explicit = prereqsByModule.get(module.id) ?? [];
        if (!installationModule) return [];
        if (module.id === installationModule.id) return [];
        if (explicit.some((item) => item.id === installationModule.id)) return explicit;
        return [{ id: installationModule.id, code: installationModule.code, name: installationModule.name }, ...explicit];
      })()
    })),
    optional_modules: optionalModules,
    global_rules: { installation_prerequisite: installationModule?.code ?? INSTALLATION_CODES[0] }
  };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/modules', (_req, res) => {
  const modules = db.prepare(`
    select * from module_template order by code asc
  `).all();
  res.json(modules);
});

app.get('/dashboard', (_req, res) => {
  const installationCode = getInstallationModuleCode();
  const openCohorts = db.prepare(`
    select count(*) as count
    from cohort
    where status in ('Planejada', 'Aguardando_quorum', 'Confirmada')
  `).get() as { count: number };

  const withoutQuorum = db.prepare(`
    select count(*) as count
    from cohort c
    where c.status in ('Planejada', 'Aguardando_quorum')
      and (
        select count(distinct a.company_id)
        from cohort_allocation a
        where a.cohort_id = c.id
          and a.status <> 'Cancelado'
      ) < c.capacity_companies
  `).get() as { count: number };

  const next7Days = db.prepare(`
    select count(*) as count
    from cohort
    where date(start_date) between date('now') and date('now', '+7 day')
  `).get() as { count: number };

  const blockedByInstall = installationCode ? db.prepare(`
    select count(distinct c.id) as count
    from company c
    join company_module_progress cmp on cmp.company_id = c.id
    join module_template mt on mt.id = cmp.module_id
    where mt.code <> ?
      and cmp.status in ('Planejado','Em_execucao')
      and not exists (
        select 1 from company_module_progress cmp2
        join module_template mt2 on mt2.id = cmp2.module_id
        where cmp2.company_id = c.id
          and mt2.code = ?
          and cmp2.status = 'Concluido'
      )
  `).get(installationCode, installationCode) as { count: number } : { count: 0 };

  const pendingByModule = db.prepare(`
    select mt.code, mt.name,
      sum(
        case
          when coalesce(cma.is_enabled, 1) = 1
            and coalesce(cmp.status, 'Nao_iniciado') <> 'Concluido'
          then 1
          else 0
        end
      ) as pending,
      sum(
        case
          when coalesce(cma.is_enabled, 1) = 1
            and coalesce(cmp.status, 'Nao_iniciado') <> 'Concluido'
            and (
              ? is null
              or mt.code = ?
              or exists (
                select 1
                from company_module_progress cmp2
                join module_template mt2 on mt2.id = cmp2.module_id
                where cmp2.company_id = c.id
                  and mt2.code = ?
                  and cmp2.status = 'Concluido'
              )
            )
          then 1
          else 0
        end
      ) as ready
    from module_template mt
    join company c on c.status = 'Ativo'
    left join company_module_progress cmp on cmp.company_id = c.id and cmp.module_id = mt.id
    left join company_module_activation cma on cma.company_id = c.id and cma.module_id = mt.id
    group by mt.id
    order by pending desc, mt.code asc
    limit 10
  `).all(installationCode, installationCode, installationCode);

  const loadByTech = db.prepare(`
    select t.id, t.name, count(c.id) as cohorts_in_month
    from technician t
    left join cohort c on c.technician_id = t.id
      and strftime('%Y-%m', c.start_date) = strftime('%Y-%m', 'now')
      and c.status in ('Planejada','Aguardando_quorum','Confirmada')
    group by t.id
    order by cohorts_in_month desc, t.name asc
  `).all();

  res.json({
    cards: {
      open_cohorts: openCohorts.count,
      cohorts_without_quorum: withoutQuorum.count,
      next_7_days: next7Days.count,
      blocked_by_installation: blockedByInstall.count
    },
    pending_by_module: pendingByModule,
    load_by_technician: loadByTech
  });
});

app.get('/calendar/cohorts', (_req, res) => {
  const rows = db.prepare(`
    select c.*, t.name as technician_name,
      (
        select count(distinct a.company_id)
        from cohort_allocation a
        where a.cohort_id = c.id and a.status in ('Previsto','Confirmado','Executado')
      ) as occupancy,
      coalesce((
        select group_concat(company_name, ' | ')
        from (
          select distinct comp.name as company_name
          from cohort_allocation a2
          join company comp on comp.id = a2.company_id
          where a2.cohort_id = c.id
            and a2.status in ('Previsto','Confirmado','Executado')
          order by comp.name asc
        )
      ), '') as participant_names,
      coalesce((
        select group_concat(module_code, ' | ')
        from (
          select mt.code as module_code
          from cohort_module_block cmb
          join module_template mt on mt.id = cmb.module_id
          where cmb.cohort_id = c.id
          order by cmb.order_in_cohort asc
        )
      ), '') as module_codes,
      coalesce((
        select group_concat(module_name, ' | ')
        from (
          select mt.name as module_name
          from cohort_module_block cmb
          join module_template mt on mt.id = cmb.module_id
          where cmb.cohort_id = c.id
          order by cmb.order_in_cohort asc
        )
      ), '') as module_names,
      coalesce((
        select sum(cmb2.duration_days)
        from cohort_module_block cmb2
        where cmb2.cohort_id = c.id
      ), 1) as total_duration_days
    from cohort c
    left join technician t on t.id = c.technician_id
    order by date(c.start_date) asc
  `).all();

  res.json(rows);
});

app.get('/cohorts', (_req, res) => {
  const rows = db.prepare(`
    select c.*, t.name as technician_name
    from cohort c
    left join technician t on t.id = c.technician_id
    order by date(c.start_date) asc
  `).all();

  res.json(rows);
});

app.get('/cohorts/:id', (req, res) => {
  const cohort = db.prepare(`
    select c.*, t.name as technician_name
    from cohort c
    left join technician t on t.id = c.technician_id
    where c.id = ?
  `).get(req.params.id);

  if (!cohort) {
    return res.status(404).json({ message: 'Turma nao encontrada' });
  }

  const blocks = db.prepare(`
    select cmb.*, mt.code as module_code, mt.name as module_name, mt.category
    from cohort_module_block cmb
    join module_template mt on mt.id = cmb.module_id
    where cmb.cohort_id = ?
    order by cmb.order_in_cohort asc
  `).all(req.params.id);

  const allocations = db.prepare(`
    select a.*, c.name as company_name, mt.code as module_code, mt.name as module_name
    from cohort_allocation a
    join company c on c.id = a.company_id
    join module_template mt on mt.id = a.module_id
    where a.cohort_id = ?
    order by a.entry_day asc, c.name asc
  `).all(req.params.id);

  return res.json({ ...cohort, blocks, allocations });
});

app.post('/cohorts/check-technician-conflict', (req, res) => {
  const parsed = technicianConflictCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const payload = parsed.data;
  try {
    validateBlocks(payload.blocks);
  } catch (error) {
    return res.status(400).json({ message: errorMessage(error) });
  }

  if (payload.status === 'Cancelada') {
    return res.json({ has_conflict: false });
  }

  const technician = db.prepare('select id, name from technician where id = ?').get(payload.technician_id) as {
    id: string;
    name: string;
  } | undefined;
  if (!technician) {
    return res.status(404).json({ message: 'Técnico não encontrado' });
  }

  const conflict = findTechnicianConflict({
    technicianId: payload.technician_id,
    startDate: payload.start_date,
    blocks: payload.blocks,
    excludeCohortId: payload.exclude_cohort_id
  });

  if (!conflict) {
    return res.json({ has_conflict: false });
  }

  const message = `Técnico já está alocado na turma ${conflict.code} - ${conflict.name} em ${formatDatePtBr(conflict.conflictDate)}.`;
  return res.json({
    has_conflict: true,
    message,
    conflict: {
      cohort_id: conflict.id,
      code: conflict.code,
      name: conflict.name,
      date: conflict.conflictDate
    }
  });
});

app.post('/cohorts', (req, res) => {
  const parsed = createCohortSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const payload = parsed.data;
  try {
    validateBlocks(payload.blocks);
  } catch (error) {
    return res.status(400).json({ message: errorMessage(error) });
  }

  if (payload.technician_id && payload.status !== 'Cancelada') {
    const conflict = findTechnicianConflict({
      technicianId: payload.technician_id,
      startDate: payload.start_date,
      blocks: payload.blocks
    });
    if (conflict) {
      return res.status(400).json({
        message: `Técnico já está alocado na turma ${conflict.code} - ${conflict.name} em ${formatDatePtBr(conflict.conflictDate)}.`
      });
    }
  }

  const cohortId = uuid('coh');

  const tx = db.transaction(() => {
    db.prepare(`
      insert into cohort (id, code, name, start_date, technician_id, status, capacity_companies, notes)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cohortId,
      payload.code.toUpperCase(),
      payload.name,
      payload.start_date,
      payload.technician_id ?? null,
      payload.status,
      payload.capacity_companies,
      payload.notes ?? null
    );

    const insertBlock = db.prepare(`
      insert into cohort_module_block (id, cohort_id, module_id, order_in_cohort, start_day_offset, duration_days)
      values (?, ?, ?, ?, ?, ?)
    `);

    payload.blocks.forEach((block) => {
      insertBlock.run(
        uuid('blk'),
        cohortId,
        block.module_id,
        block.order_in_cohort,
        block.start_day_offset,
        block.duration_days
      );
    });
  });

  try {
    tx();
    return res.status(201).json({ id: cohortId });
  } catch (err) {
    return res.status(400).json({ message: 'Erro ao criar turma', detail: errorMessage(err) });
  }
});

app.patch('/cohorts/:id', (req, res) => {
  const parsed = updateCohortSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const existing = db.prepare(`
    select id, technician_id, start_date, status
    from cohort
    where id = ?
  `).get(req.params.id) as {
    id: string;
    technician_id: string | null;
    start_date: string;
    status: string;
  } | undefined;
  if (!existing) {
    return res.status(404).json({ message: 'Turma nao encontrada' });
  }

  const payload = parsed.data;
  if (payload.blocks) {
    try {
      validateBlocks(payload.blocks);
    } catch (error) {
      return res.status(400).json({ message: errorMessage(error) });
    }

    const newModuleIds = new Set(payload.blocks.map((block) => block.module_id));
    const newStartByModule = new Map(payload.blocks.map((block) => [block.module_id, block.start_day_offset]));
    const activeAllocations = db.prepare(`
      select id, module_id, entry_day
      from cohort_allocation
      where cohort_id = ? and status <> 'Cancelado'
    `).all(req.params.id) as Array<{ id: string; module_id: string; entry_day: number }>;

    const invalidModuleAllocations = activeAllocations.filter((allocation) => !newModuleIds.has(allocation.module_id));
    if (invalidModuleAllocations.length > 0) {
      return res.status(400).json({
        message: 'Nao e possivel remover bloco com alocacoes ativas. Cancele/realoque as alocacoes primeiro.'
      });
    }

    const invalidEntryDayAllocations = activeAllocations.filter((allocation) => {
      const nextStart = newStartByModule.get(allocation.module_id);
      return typeof nextStart === 'number' && allocation.entry_day < nextStart;
    });
    if (invalidEntryDayAllocations.length > 0) {
      return res.status(400).json({
        message: 'Nova sequencia de blocos invalida para alocacoes existentes (entry_day menor que inicio do bloco).'
      });
    }
  }

  const nextTechnicianId = payload.technician_id === undefined ? existing.technician_id : payload.technician_id;
  const nextStartDate = payload.start_date ?? existing.start_date;
  const nextStatus = payload.status ?? existing.status;
  const nextBlocks = payload.blocks ?? db.prepare(`
    select start_day_offset, duration_days
    from cohort_module_block
    where cohort_id = ?
    order by order_in_cohort asc
  `).all(req.params.id) as Array<{ start_day_offset: number; duration_days: number }>;

  if (nextTechnicianId && nextStatus !== 'Cancelada') {
    const conflict = findTechnicianConflict({
      technicianId: nextTechnicianId,
      startDate: nextStartDate,
      blocks: nextBlocks,
      excludeCohortId: req.params.id
    });
    if (conflict) {
      return res.status(400).json({
        message: `Técnico já está alocado na turma ${conflict.code} - ${conflict.name} em ${formatDatePtBr(conflict.conflictDate)}.`
      });
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  Object.entries(payload).forEach(([key, value]) => {
    if (key === 'blocks') return;
    fields.push(`${key} = ?`);
    values.push(key === 'code' && typeof value === 'string' ? value.toUpperCase() : value);
  });

  if (fields.length === 0 && !payload.blocks) {
    return res.status(200).json({ message: 'Sem alteracoes' });
  }

  const tx = db.transaction(() => {
    if (fields.length > 0) {
      values.push(req.params.id);
      db.prepare(`update cohort set ${fields.join(', ')} where id = ?`).run(...values);
    }

    if (payload.blocks) {
      db.prepare('delete from cohort_module_block where cohort_id = ?').run(req.params.id);
      const insertBlock = db.prepare(`
        insert into cohort_module_block (id, cohort_id, module_id, order_in_cohort, start_day_offset, duration_days)
        values (?, ?, ?, ?, ?, ?)
      `);
      payload.blocks.forEach((block) => {
        insertBlock.run(
          uuid('blk'),
          req.params.id,
          block.module_id,
          block.order_in_cohort,
          block.start_day_offset,
          block.duration_days
        );
      });
    }
  });

  try {
    tx();
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ message: 'Erro ao atualizar turma', detail: errorMessage(error) });
  }
});

app.delete('/cohorts/:id', (req, res) => {
  const exists = db.prepare('select id from cohort where id = ?').get(req.params.id) as { id: string } | undefined;
  if (!exists) {
    return res.status(404).json({ message: 'Turma não encontrada' });
  }

  db.prepare('delete from cohort where id = ?').run(req.params.id);
  return res.json({ ok: true });
});

app.post('/allocations', (req, res) => {
  const parsed = createAllocationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const payload = parsed.data;

  if (!moduleExistsInCohort(payload.cohort_id, payload.module_id)) {
    return res.status(400).json({ message: 'Modulo nao pertence aos blocos da turma' });
  }

  const block = db.prepare(`
    select start_day_offset
    from cohort_module_block
    where cohort_id = ? and module_id = ?
  `).get(payload.cohort_id, payload.module_id) as { start_day_offset: number } | undefined;

  if (!block) {
    return res.status(400).json({ message: 'Bloco nao encontrado' });
  }

  if (payload.entry_day < block.start_day_offset) {
    return res.status(400).json({ message: 'entry_day nao pode ser menor que o inicio do bloco' });
  }

  if (!hasModuleEnabled(payload.company_id, payload.module_id)) {
    return res.status(400).json({ message: 'Módulo está desativado para esta empresa.' });
  }

  const cohort = db.prepare('select capacity_companies from cohort where id = ?').get(payload.cohort_id) as { capacity_companies: number } | undefined;
  if (!cohort) {
    return res.status(404).json({ message: 'Turma nao encontrada' });
  }

  const occupied = db.prepare(`
    select count(distinct company_id) as count
    from cohort_allocation
    where cohort_id = ? and status <> 'Cancelado'
  `).get(payload.cohort_id) as { count: number };
  const alreadyInCohort = db.prepare(`
    select 1 as ok
    from cohort_allocation
    where cohort_id = ? and company_id = ? and status <> 'Cancelado'
    limit 1
  `).get(payload.cohort_id, payload.company_id) as { ok: number } | undefined;

  if (occupied.count >= cohort.capacity_companies && !alreadyInCohort) {
    return res.status(400).json({ message: 'Capacidade da turma atingida' });
  }

  try {
    db.prepare(`
      insert into cohort_allocation (id, cohort_id, company_id, module_id, entry_day, status, notes)
      values (?, ?, ?, ?, ?, 'Previsto', ?)
    `).run(uuid('all'), payload.cohort_id, payload.company_id, payload.module_id, payload.entry_day, payload.notes ?? null);

    return res.status(201).json({ ok: true });
  } catch (err) {
    return res.status(400).json({ message: 'Nao foi possivel criar alocacao', detail: errorMessage(err) });
  }
});

app.post('/cohorts/:id/allocate-company', (req, res) => {
  const parsed = guidedAllocationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const cohortId = req.params.id;
  const payload = parsed.data;

  const cohort = db.prepare(`
    select id, capacity_companies
    from cohort
    where id = ?
  `).get(cohortId) as { id: string; capacity_companies: number } | undefined;

  if (!cohort) {
    return res.status(404).json({ message: 'Turma nao encontrada' });
  }

  const blocks = db.prepare(`
    select module_id, order_in_cohort, start_day_offset, duration_days
    from cohort_module_block
    where cohort_id = ?
    order by order_in_cohort asc
  `).all(cohortId) as Array<{
    module_id: string;
    order_in_cohort: number;
    start_day_offset: number;
    duration_days: number;
  }>;

  if (blocks.length === 0) {
    return res.status(400).json({ message: 'Turma sem blocos cadastrados' });
  }

  const blockByModule = new Map(blocks.map((block) => [block.module_id, block]));
  const entryBlock = blockByModule.get(payload.entry_module_id);
  if (!entryBlock) {
    return res.status(400).json({ message: 'Modulo de entrada nao pertence a turma' });
  }

  const normalizedModuleIds = Array.from(new Set(payload.module_ids.map((item) => item.trim()).filter(Boolean)));
  const moduleSet = new Set(normalizedModuleIds);
  moduleSet.add(payload.entry_module_id);

  const selectedBlocks = Array.from(moduleSet)
    .map((moduleId) => blockByModule.get(moduleId))
    .filter((block): block is {
      module_id: string;
      order_in_cohort: number;
      start_day_offset: number;
      duration_days: number;
    } => Boolean(block))
    .sort((a, b) => a.order_in_cohort - b.order_in_cohort);

  if (selectedBlocks.length !== moduleSet.size) {
    return res.status(400).json({ message: 'Um ou mais modulos selecionados nao pertencem a turma' });
  }

  const hasBlockBeforeEntry = selectedBlocks.some((block) => block.order_in_cohort < entryBlock.order_in_cohort);
  if (hasBlockBeforeEntry) {
    return res.status(400).json({
      message: 'Nao e permitido selecionar modulo anterior ao modulo de entrada'
    });
  }

  const company = db.prepare('select id from company where id = ?').get(payload.company_id) as { id: string } | undefined;
  if (!company) {
    return res.status(404).json({ message: 'Empresa nao encontrada' });
  }

  const disabledModule = selectedBlocks.find((block) => !hasModuleEnabled(payload.company_id, block.module_id));
  if (disabledModule) {
    return res.status(400).json({ message: 'Existe módulo desativado para esta empresa na seleção.' });
  }

  const occupied = db.prepare(`
    select count(distinct company_id) as count
    from cohort_allocation
    where cohort_id = ? and status <> 'Cancelado'
  `).get(cohortId) as { count: number };
  const alreadyInCohort = db.prepare(`
    select 1 as ok
    from cohort_allocation
    where cohort_id = ? and company_id = ? and status <> 'Cancelado'
    limit 1
  `).get(cohortId, payload.company_id) as { ok: number } | undefined;

  if (occupied.count >= cohort.capacity_companies && !alreadyInCohort) {
    return res.status(400).json({ message: 'Capacidade da turma atingida' });
  }

  const saveAllocation = db.prepare(`
    insert into cohort_allocation (id, cohort_id, company_id, module_id, entry_day, status, notes)
    values (?, ?, ?, ?, ?, 'Previsto', ?)
    on conflict(cohort_id, company_id, module_id)
    do update set
      entry_day = excluded.entry_day,
      notes = coalesce(excluded.notes, cohort_allocation.notes),
      status = case
        when cohort_allocation.status = 'Cancelado' then 'Previsto'
        else cohort_allocation.status
      end
  `);

  const tx = db.transaction(() => {
    selectedBlocks.forEach((block) => {
      saveAllocation.run(
        uuid('all'),
        cohortId,
        payload.company_id,
        block.module_id,
        block.start_day_offset,
        payload.notes ?? null
      );
    });
  });

  try {
    tx();
  } catch (error) {
    return res.status(400).json({ message: 'Nao foi possivel salvar alocacoes', detail: errorMessage(error) });
  }

  const moduleNames = db.prepare(`
    select mt.id, mt.name
    from module_template mt
    where mt.id in (${selectedBlocks.map(() => '?').join(',')})
  `).all(...selectedBlocks.map((block) => block.module_id)) as Array<{ id: string; name: string }>;
  const moduleNameById = new Map(moduleNames.map((item) => [item.id, item.name]));

  return res.status(201).json({
    ok: true,
    company_id: payload.company_id,
    entry_module_id: payload.entry_module_id,
    allocations_created: selectedBlocks.map((block) => ({
      module_id: block.module_id,
      module_name: moduleNameById.get(block.module_id) ?? block.module_id,
      entry_day: block.start_day_offset
    }))
  });
});

app.patch('/allocations/:id/status', (req, res) => {
  const schema = z.object({
    status: z.enum(['Previsto', 'Confirmado', 'Executado', 'Cancelado']),
    notes: z.string().nullable().optional(),
    override_installation_prereq: z.boolean().optional(),
    override_reason: z.string().nullable().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const allocation = db.prepare(`
    select * from cohort_allocation where id = ?
  `).get(req.params.id) as {
    id: string;
    company_id: string;
    module_id: string;
  } | undefined;

  if (!allocation) {
    return res.status(404).json({ message: 'Alocacao nao encontrada' });
  }

  const nextStatus = parsed.data.status as AllocationStatus;
  let usedInstallationOverride = 0;
  let overrideReason: string | null = null;

  if (nextStatus === 'Executado') {
    const installationModule = getInstallationModule();
    const installationModuleId = installationModule?.id ?? null;
    const installationCode = installationModule?.code ?? INSTALLATION_CODES[0];
    if (installationModuleId && allocation.module_id !== installationModuleId) {
      if (!hasModuleCompleted(allocation.company_id, installationModuleId)) {
        const requestedOverride = parsed.data.override_installation_prereq === true;
        const trimmedReason = parsed.data.override_reason?.trim();
        if (!requestedOverride || !trimmedReason) {
          return res.status(400).json({
            message: `Empresa precisa concluir ${installationCode} (Instalação) antes da execução. Use override manual com justificativa.`
          });
        }
        usedInstallationOverride = 1;
        overrideReason = trimmedReason;
      }
    }
  }

  db.prepare(`
    update cohort_allocation
    set status = ?,
      notes = coalesce(?, notes),
      override_installation_prereq = ?,
      override_reason = ?,
      executed_at = case when ? = 'Executado' then ? else executed_at end
    where id = ?
  `).run(
    nextStatus,
    parsed.data.notes ?? null,
    usedInstallationOverride,
    overrideReason,
    nextStatus,
    nextStatus === 'Executado' ? nowDateIso() : null,
    req.params.id
  );

  if (nextStatus === 'Executado') {
    const progressId = uuid('prog');
    db.prepare(`
      insert into company_module_progress (id, company_id, module_id, status, completed_at)
      values (?, ?, ?, 'Concluido', ?)
      on conflict(company_id, module_id) do update set
        status = 'Concluido',
        completed_at = excluded.completed_at
    `).run(progressId, allocation.company_id, allocation.module_id, nowDateIso());
  }

  return res.json({ ok: true, override_used: Boolean(usedInstallationOverride) });
});

app.get('/cohorts/:id/suggestions/:moduleId', (req, res) => {
  const moduleId = req.params.moduleId;
  const cohortId = req.params.id;

  if (!moduleExistsInCohort(cohortId, moduleId)) {
    return res.status(400).json({ message: 'Modulo nao pertence a turma' });
  }

  const block = db.prepare(`
    select start_day_offset from cohort_module_block where cohort_id = ? and module_id = ?
  `).get(cohortId, moduleId) as { start_day_offset: number } | undefined;

  const installationModule = getInstallationModule();
  const installationModuleId = installationModule?.id ?? null;
  const installationLabel = installationModule?.code ?? INSTALLATION_CODES[0];

  const rows = db.prepare(`
    select c.id, c.name, c.priority,
      coalesce(cmp.status, 'Nao_iniciado') as module_status,
      (
        select max(completed_at)
        from company_module_progress p
        where p.company_id = c.id
          and p.completed_at is not null
      ) as last_completed_at,
      case
        when ? is null then 1
        when ? = ? then 1
        when exists (
          select 1 from company_module_progress x
          where x.company_id = c.id and x.module_id = ? and x.status = 'Concluido'
        ) then 1
        else 0
      end as can_execute,
      case
        when ? is not null
          and ? <> ?
          and not exists (
            select 1
            from company_module_progress x2
            where x2.company_id = c.id and x2.module_id = ? and x2.status = 'Concluido'
          )
        then ?
        else null
      end as block_reason
    from company c
    left join company_module_progress cmp on cmp.company_id = c.id and cmp.module_id = ?
    left join company_module_activation cma on cma.company_id = c.id and cma.module_id = ?
    where c.status = 'Ativo'
      and coalesce(cma.is_enabled, 1) = 1
      and coalesce(cmp.status, 'Nao_iniciado') <> 'Concluido'
      and not exists (
        select 1
        from cohort_allocation a
        where a.cohort_id = ?
          and a.company_id = c.id
          and a.module_id = ?
          and a.status <> 'Cancelado'
      )
    order by
      can_execute desc,
      c.priority desc,
      case when last_completed_at is null then 0 else 1 end asc,
      date(last_completed_at) asc,
      c.name asc
  `).all(
    installationModuleId,
    moduleId,
    installationModuleId,
    installationModuleId,
    installationModuleId,
    moduleId,
    installationModuleId,
    installationModuleId,
    `Falta ${installationLabel}`,
    moduleId,
    moduleId,
    cohortId,
    moduleId
  );

  return res.json({ entry_day_suggested: block?.start_day_offset ?? 1, companies: rows });
});

app.get('/companies', (_req, res) => {
  const rows = db.prepare(`
    select c.id, c.name, c.status, c.priority, c.notes,
      sum(case when coalesce(cma.is_enabled, 1) = 1 then 1 else 0 end) as total_modules,
      sum(
        case
          when coalesce(cma.is_enabled, 1) = 1 and cmp.status = 'Concluido'
          then 1
          else 0
        end
      ) as modules_completed,
      min(
        case
          when coalesce(cma.is_enabled, 1) = 1
            and coalesce(cmp.status, 'Nao_iniciado') <> 'Concluido'
          then mt.code
        end
      ) as next_module_code,
      min(
        case
          when coalesce(cma.is_enabled, 1) = 1
            and coalesce(cmp.status, 'Nao_iniciado') <> 'Concluido'
          then mt.code || '|' || mt.name
        end
      ) as next_module_ref
    from company c
    cross join module_template mt
    left join company_module_progress cmp on cmp.company_id = c.id and cmp.module_id = mt.id
    left join company_module_activation cma on cma.company_id = c.id and cma.module_id = mt.id
    group by c.id
    order by c.name asc
  `).all() as Array<{
    id: string;
    name: string;
    status: string;
    priority: number;
    notes: string | null;
    total_modules: number;
    modules_completed: number;
    next_module_code: string | null;
    next_module_ref: string | null;
  }>;

  const installationModule = getInstallationModule();
  const installationId = installationModule?.id ?? null;
  const installationCode = installationModule?.code ?? INSTALLATION_CODES[0];

  const withAlerts = rows.map((row) => {
    const installationEnabled = installationId ? hasModuleEnabled(row.id, installationId) : true;
    const hasInstallation = installationId ? (!installationEnabled || hasModuleCompleted(row.id, installationId)) : true;
    return {
      ...row,
      completion_percent: row.total_modules === 0 ? 0 : Number(((row.modules_completed / row.total_modules) * 100).toFixed(1)),
      next_module_name: row.next_module_ref?.split('|').slice(1).join('|') ?? null,
      alert: hasInstallation ? null : `Falta ${installationCode}`
    };
  });

  res.json(withAlerts);
});

app.post('/companies', (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    status: z.enum(['Ativo', 'Inativo']).default('Ativo'),
    notes: z.string().nullable().optional(),
    priority: z.number().int().min(0).max(100).default(0)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const companyId = uuid('comp');
  try {
    db.prepare(`
      insert into company (id, name, status, notes, priority)
      values (?, ?, ?, ?, ?)
    `).run(companyId, parsed.data.name.trim(), parsed.data.status, parsed.data.notes ?? null, parsed.data.priority);

    ensureCompanyDefaultRows(companyId);
    return res.status(201).json({ id: companyId });
  } catch (error) {
    return res.status(400).json({ message: 'Não foi possível criar cliente', detail: errorMessage(error) });
  }
});

app.delete('/companies/:id', (req, res) => {
  const exists = db.prepare('select id from company where id = ?').get(req.params.id) as { id: string } | undefined;
  if (!exists) {
    return res.status(404).json({ message: 'Cliente não encontrado' });
  }

  db.prepare('delete from company where id = ?').run(req.params.id);
  return res.json({ ok: true });
});

app.patch('/companies/:id/priority', (req, res) => {
  const schema = z.object({
    priority: z.number().int().min(0).max(100)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const result = db.prepare('update company set priority = ? where id = ?').run(parsed.data.priority, req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'Empresa nao encontrada' });
  }

  return res.json({ ok: true });
});

app.patch('/companies/:id/modules/:moduleId', (req, res) => {
  const schema = z.object({
    is_enabled: z.boolean()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const company = db.prepare('select id from company where id = ?').get(req.params.id) as { id: string } | undefined;
  if (!company) {
    return res.status(404).json({ message: 'Cliente não encontrado' });
  }
  const module = db.prepare('select id from module_template where id = ?').get(req.params.moduleId) as { id: string } | undefined;
  if (!module) {
    return res.status(404).json({ message: 'Módulo não encontrado' });
  }

  db.prepare(`
    insert into company_module_activation (company_id, module_id, is_enabled)
    values (?, ?, ?)
    on conflict(company_id, module_id) do update set
      is_enabled = excluded.is_enabled
  `).run(req.params.id, req.params.moduleId, parsed.data.is_enabled ? 1 : 0);

  if (parsed.data.is_enabled) {
    db.prepare(`
      insert or ignore into company_module_progress (id, company_id, module_id, status, notes, completed_at)
      values (?, ?, ?, 'Nao_iniciado', null, null)
    `).run(uuid('prog'), req.params.id, req.params.moduleId);
  }

  return res.json({ ok: true });
});

app.get('/companies/:id', (req, res) => {
  const company = db.prepare('select * from company where id = ?').get(req.params.id);
  if (!company) {
    return res.status(404).json({ message: 'Empresa nao encontrada' });
  }

  const timeline = db.prepare(`
    select mt.id as module_id, mt.code, mt.name, mt.category, mt.duration_days,
      coalesce(cmp.status, 'Nao_iniciado') as status,
      cmp.completed_at,
      coalesce(cma.is_enabled, 1) as is_enabled
    from module_template mt
    left join company_module_progress cmp on cmp.module_id = mt.id and cmp.company_id = ?
    left join company_module_activation cma on cma.module_id = mt.id and cma.company_id = ?
    order by mt.code asc
  `).all(req.params.id, req.params.id);

  const optionals = db.prepare(`
    select om.id, om.code, om.name, om.category, om.duration_days,
      coalesce(cop.status, 'Planejado') as status
    from optional_module om
    left join company_optional_progress cop
      on cop.optional_module_id = om.id and cop.company_id = ?
    order by om.code asc
  `).all(req.params.id);

  const history = db.prepare(`
    select a.id, a.status, a.entry_day, c.name as cohort_name, c.start_date, mt.code as module_code, mt.name as module_name
    from cohort_allocation a
    join cohort c on c.id = a.cohort_id
    join module_template mt on mt.id = a.module_id
    where a.company_id = ?
    order by date(c.start_date) desc
  `).all(req.params.id);

  res.json({ company, timeline, optionals, history });
});

app.patch('/companies/:companyId/progress/:moduleId', (req, res) => {
  const schema = z.object({
    status: z.enum(['Nao_iniciado', 'Planejado', 'Em_execucao', 'Concluido']),
    completed_at: z.string().nullable().optional(),
    notes: z.string().nullable().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const status = parsed.data.status as ModuleProgressStatus;
  const completedAt = status === 'Concluido' ? (parsed.data.completed_at ?? nowDateIso()) : null;

  if (!hasModuleEnabled(req.params.companyId, req.params.moduleId)) {
    return res.status(400).json({ message: 'Módulo está desativado para esta empresa.' });
  }

  db.prepare(`
    insert into company_module_progress (id, company_id, module_id, status, completed_at, notes)
    values (?, ?, ?, ?, ?, ?)
    on conflict(company_id, module_id)
    do update set status = excluded.status, completed_at = excluded.completed_at, notes = excluded.notes
  `).run(uuid('prog'), req.params.companyId, req.params.moduleId, status, completedAt, parsed.data.notes ?? null);

  res.json({ ok: true });
});

app.get('/license-programs', (_req, res) => {
  const rows = db.prepare(`
    select lp.id, lp.name, lp.notes, lp.created_at, lp.updated_at,
      (
        select count(*)
        from company_license l
        where l.program_id = lp.id
      ) as usage_count
    from license_program lp
    order by lp.name asc
  `).all();
  return res.json(rows);
});

app.post('/license-programs', (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    notes: z.string().nullable().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const payload = parsed.data;
  const existing = db.prepare('select id from license_program where lower(name) = lower(?)').get(payload.name.trim()) as { id: string } | undefined;
  if (existing) {
    return res.status(400).json({ message: 'Já existe um programa com este nome.' });
  }

  const nowIso = nowDateIso();
  const id = uuid('lpr');
  try {
    db.prepare(`
      insert into license_program (id, name, notes, created_at, updated_at)
      values (?, ?, ?, ?, ?)
    `).run(id, payload.name.trim(), payload.notes ?? null, nowIso, nowIso);
    return res.status(201).json({ id });
  } catch (error) {
    return res.status(400).json({ message: 'Não foi possível criar programa', detail: errorMessage(error) });
  }
});

app.patch('/license-programs/:id', (req, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    notes: z.string().nullable().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const exists = db.prepare('select id from license_program where id = ?').get(req.params.id) as { id: string } | undefined;
  if (!exists) {
    return res.status(404).json({ message: 'Programa não encontrado' });
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (typeof parsed.data.name !== 'undefined') {
    const duplicate = db.prepare('select id from license_program where lower(name) = lower(?) and id <> ?').get(parsed.data.name.trim(), req.params.id) as { id: string } | undefined;
    if (duplicate) {
      return res.status(400).json({ message: 'Já existe outro programa com este nome.' });
    }
    fields.push('name = ?');
    values.push(parsed.data.name.trim());
  }
  if (typeof parsed.data.notes !== 'undefined') {
    fields.push('notes = ?');
    values.push(parsed.data.notes ?? null);
  }

  if (fields.length === 0) {
    return res.json({ ok: true });
  }

  fields.push('updated_at = ?');
  values.push(nowDateIso());
  values.push(req.params.id);

  try {
    db.prepare(`update license_program set ${fields.join(', ')} where id = ?`).run(...values);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ message: 'Não foi possível atualizar programa', detail: errorMessage(error) });
  }
});

app.delete('/license-programs/:id', (req, res) => {
  const exists = db.prepare('select id from license_program where id = ?').get(req.params.id) as { id: string } | undefined;
  if (!exists) {
    return res.status(404).json({ message: 'Programa não encontrado' });
  }

  const usage = db.prepare('select count(*) as count from company_license where program_id = ?').get(req.params.id) as { count: number };
  if (usage.count > 0) {
    return res.status(400).json({ message: 'Programa em uso por licenças. Realoque ou exclua as licenças antes.' });
  }

  db.prepare('delete from license_program where id = ?').run(req.params.id);
  return res.json({ ok: true });
});

app.get('/licenses', (_req, res) => {
  const rows = db.prepare(`
    select l.id, l.company_id, c.name as company_name,
      l.program_id, coalesce(lp.name, l.name) as program_name,
      l.user_name, l.module_list, l.license_identifier,
      l.renewal_cycle, l.expires_at, l.notes, l.last_renewed_at, l.created_at, l.updated_at
    from company_license l
    join company c on c.id = l.company_id
    left join license_program lp on lp.id = l.program_id
    order by date(l.expires_at) asc, c.name asc, coalesce(lp.name, l.name) asc
  `).all() as Array<{
    id: string;
    company_id: string;
    company_name: string;
    program_id: string | null;
    program_name: string;
    user_name: string | null;
    module_list: string | null;
    license_identifier: string | null;
    renewal_cycle: 'Mensal' | 'Anual';
    expires_at: string;
    notes: string | null;
    last_renewed_at: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const today = nowDateIso();
  const normalized = rows.map((row) => {
    const alertWindowDays = renewalAlertWindowDays(row.renewal_cycle);
    const daysUntilExpiration = dayDiff(today, row.expires_at);
    const alertLevel = daysUntilExpiration < 0
      ? 'Expirada'
      : daysUntilExpiration <= alertWindowDays
        ? 'Atenção'
        : 'Ok';
    const warningMessage = alertLevel === 'Expirada'
      ? `Licença expirada há ${Math.abs(daysUntilExpiration)} dia(s).`
      : alertLevel === 'Atenção'
        ? row.renewal_cycle === 'Anual'
          ? `Renovação anual em ${daysUntilExpiration} dia(s).`
          : `Renovação mensal em ${daysUntilExpiration} dia(s).`
        : null;

    return {
      ...row,
      user_name: row.user_name ?? '',
      module_list: row.module_list ?? '',
      license_identifier: row.license_identifier ?? '',
      alert_window_days: alertWindowDays,
      days_until_expiration: daysUntilExpiration,
      alert_level: alertLevel,
      warning_message: warningMessage
    };
  });

  const expired = normalized.filter((row) => row.alert_level === 'Expirada');
  const monthlyDueSoon = normalized.filter((row) => row.alert_level === 'Atenção' && row.renewal_cycle === 'Mensal');
  const annualDueSoon = normalized.filter((row) => row.alert_level === 'Atenção' && row.renewal_cycle === 'Anual');

  return res.json({
    rows: normalized,
    alerts: {
      expired,
      monthly_due_soon: monthlyDueSoon,
      annual_due_soon: annualDueSoon,
      total_attention: expired.length + monthlyDueSoon.length + annualDueSoon.length
    }
  });
});

app.post('/licenses', (req, res) => {
  const parsed = licenseCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const payload = parsed.data;
  const company = db.prepare('select id from company where id = ?').get(payload.company_id) as { id: string } | undefined;
  if (!company) {
    return res.status(404).json({ message: 'Cliente não encontrado' });
  }
  const program = db.prepare('select id, name from license_program where id = ?').get(payload.program_id) as { id: string; name: string } | undefined;
  if (!program) {
    return res.status(404).json({ message: 'Programa não encontrado' });
  }

  const nowIso = nowDateIso();
  const id = uuid('lic');
  try {
    db.prepare(`
      insert into company_license (
        id, company_id, name, program_id, user_name, module_list, license_identifier,
        renewal_cycle, expires_at, notes, last_renewed_at, created_at, updated_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, ?)
    `).run(
      id,
      payload.company_id,
      program.name,
      payload.program_id,
      payload.user_name.trim(),
      payload.module_list.trim(),
      payload.license_identifier.trim(),
      payload.renewal_cycle,
      payload.expires_at,
      payload.notes ?? null,
      nowIso,
      nowIso
    );
    return res.status(201).json({ id });
  } catch (error) {
    return res.status(400).json({ message: 'Não foi possível cadastrar licença', detail: errorMessage(error) });
  }
});

app.patch('/licenses/:id', (req, res) => {
  const parsed = licenseUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const exists = db.prepare('select id from company_license where id = ?').get(req.params.id) as { id: string } | undefined;
  if (!exists) {
    return res.status(404).json({ message: 'Licença não encontrada' });
  }

  if (parsed.data.company_id) {
    const company = db.prepare('select id from company where id = ?').get(parsed.data.company_id) as { id: string } | undefined;
    if (!company) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (typeof parsed.data.program_id !== 'undefined') {
    const program = db.prepare('select id, name from license_program where id = ?').get(parsed.data.program_id) as { id: string; name: string } | undefined;
    if (!program) {
      return res.status(404).json({ message: 'Programa não encontrado' });
    }
    fields.push('program_id = ?');
    values.push(parsed.data.program_id);
    fields.push('name = ?');
    values.push(program.name);
  }
  if (typeof parsed.data.company_id !== 'undefined') {
    fields.push('company_id = ?');
    values.push(parsed.data.company_id);
  }
  if (typeof parsed.data.user_name !== 'undefined') {
    fields.push('user_name = ?');
    values.push(parsed.data.user_name.trim());
  }
  if (typeof parsed.data.module_list !== 'undefined') {
    fields.push('module_list = ?');
    values.push(parsed.data.module_list.trim());
  }
  if (typeof parsed.data.license_identifier !== 'undefined') {
    fields.push('license_identifier = ?');
    values.push(parsed.data.license_identifier.trim());
  }
  if (typeof parsed.data.renewal_cycle !== 'undefined') {
    fields.push('renewal_cycle = ?');
    values.push(parsed.data.renewal_cycle);
  }
  if (typeof parsed.data.expires_at !== 'undefined') {
    fields.push('expires_at = ?');
    values.push(parsed.data.expires_at);
  }
  if (typeof parsed.data.notes !== 'undefined') {
    fields.push('notes = ?');
    values.push(parsed.data.notes ?? null);
  }

  if (fields.length === 0) {
    return res.json({ ok: true });
  }

  fields.push('updated_at = ?');
  values.push(nowDateIso());
  values.push(req.params.id);

  try {
    db.prepare(`update company_license set ${fields.join(', ')} where id = ?`).run(...values);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ message: 'Não foi possível atualizar licença', detail: errorMessage(error) });
  }
});

app.delete('/licenses/:id', (req, res) => {
  const exists = db.prepare('select id from company_license where id = ?').get(req.params.id) as { id: string } | undefined;
  if (!exists) {
    return res.status(404).json({ message: 'Licença não encontrada' });
  }
  db.prepare('delete from company_license where id = ?').run(req.params.id);
  return res.json({ ok: true });
});

app.post('/licenses/:id/renew', (req, res) => {
  const row = db.prepare(`
    select id, renewal_cycle, expires_at
    from company_license
    where id = ?
  `).get(req.params.id) as {
    id: string;
    renewal_cycle: 'Mensal' | 'Anual';
    expires_at: string;
  } | undefined;

  if (!row) {
    return res.status(404).json({ message: 'Licença não encontrada' });
  }

  const renewedExpiresAt = nextRenewalDate(row.expires_at, row.renewal_cycle);
  const nowIso = nowDateIso();
  db.prepare(`
    update company_license
    set expires_at = ?,
      last_renewed_at = ?,
      updated_at = ?
    where id = ?
  `).run(renewedExpiresAt, nowIso, nowIso, req.params.id);

  return res.json({ ok: true, expires_at: renewedExpiresAt, renewal_cycle: row.renewal_cycle });
});

app.get('/technicians', (_req, res) => {
  const rows = db.prepare(`
    select t.id, t.name, t.availability_notes,
      count(c.id) as monthly_load
    from technician t
    left join cohort c on c.technician_id = t.id
      and strftime('%Y-%m', c.start_date) = strftime('%Y-%m', 'now')
      and c.status in ('Planejada','Aguardando_quorum','Confirmada')
    group by t.id
    order by t.name asc
  `).all();

  const skillRows = db.prepare(`
    select ts.technician_id, mt.code, mt.name
    from technician_skill ts
    join module_template mt on mt.id = ts.module_id
    order by mt.code asc
  `).all() as Array<{ technician_id: string; code: string; name: string }>;

  const skillsByTech = new Map<string, Array<{ code: string; name: string }>>();
  skillRows.forEach((row) => {
    const list = skillsByTech.get(row.technician_id) ?? [];
    list.push({ code: row.code, name: row.name });
    skillsByTech.set(row.technician_id, list);
  });

  res.json(rows.map((t: any) => ({ ...t, skills: skillsByTech.get(t.id) ?? [] })));
});

app.post('/technicians', (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    availability_notes: z.string().nullable().optional(),
    module_ids: z.array(z.string()).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const technicianId = uuid('tech');
  const tx = db.transaction(() => {
    db.prepare(`
      insert into technician (id, name, availability_notes)
      values (?, ?, ?)
    `).run(technicianId, parsed.data.name.trim(), parsed.data.availability_notes ?? null);

    const insertSkill = db.prepare('insert into technician_skill (technician_id, module_id) values (?, ?)');
    (parsed.data.module_ids ?? []).forEach((moduleId) => {
      insertSkill.run(technicianId, moduleId);
    });
  });

  try {
    tx();
    return res.status(201).json({ id: technicianId });
  } catch (error) {
    return res.status(400).json({ message: 'Não foi possível criar técnico', detail: errorMessage(error) });
  }
});

app.patch('/technicians/:id', (req, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    availability_notes: z.string().nullable().optional(),
    module_ids: z.array(z.string()).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const exists = db.prepare('select id from technician where id = ?').get(req.params.id) as { id: string } | undefined;
  if (!exists) {
    return res.status(404).json({ message: 'Técnico não encontrado' });
  }

  const payload = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];
  if (typeof payload.name === 'string') {
    fields.push('name = ?');
    values.push(payload.name.trim());
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'availability_notes')) {
    fields.push('availability_notes = ?');
    values.push(payload.availability_notes ?? null);
  }

  const tx = db.transaction(() => {
    if (fields.length > 0) {
      db.prepare(`update technician set ${fields.join(', ')} where id = ?`).run(...values, req.params.id);
    }
    if (payload.module_ids) {
      db.prepare('delete from technician_skill where technician_id = ?').run(req.params.id);
      const insertSkill = db.prepare('insert into technician_skill (technician_id, module_id) values (?, ?)');
      payload.module_ids.forEach((moduleId) => insertSkill.run(req.params.id, moduleId));
    }
  });

  tx();
  return res.json({ ok: true });
});

app.delete('/technicians/:id', (req, res) => {
  const exists = db.prepare('select id from technician where id = ?').get(req.params.id) as { id: string } | undefined;
  if (!exists) {
    return res.status(404).json({ message: 'Técnico não encontrado' });
  }

  db.prepare('delete from technician where id = ?').run(req.params.id);
  return res.json({ ok: true });
});

app.get('/technicians/:id/calendar', (req, res) => {
  const dateFrom = typeof req.query.date_from === 'string' ? req.query.date_from : '';
  const dateTo = typeof req.query.date_to === 'string' ? req.query.date_to : '';

  const technician = db.prepare('select id, name from technician where id = ?').get(req.params.id);
  if (!technician) {
    return res.status(404).json({ message: 'Tecnico nao encontrado' });
  }

  const cohorts = db.prepare(`
    select c.id, c.code, c.name, c.start_date, c.status, c.capacity_companies,
      (
        select count(*)
        from cohort_allocation a
        where a.cohort_id = c.id and a.status in ('Previsto', 'Confirmado', 'Executado')
      ) as occupancy
    from cohort c
    where c.technician_id = ?
      and (? = '' or date(c.start_date) >= date(?))
      and (? = '' or date(c.start_date) <= date(?))
    order by date(c.start_date) asc
  `).all(req.params.id, dateFrom, dateFrom, dateTo, dateTo) as Array<{
    id: string;
    code: string;
    name: string;
    start_date: string;
    status: string;
    capacity_companies: number;
    occupancy: number;
  }>;

  const blocks = db.prepare(`
    select cmb.cohort_id, mt.code as module_code, mt.name as module_name, cmb.order_in_cohort, cmb.start_day_offset, cmb.duration_days
    from cohort_module_block cmb
    join module_template mt on mt.id = cmb.module_id
    where cmb.cohort_id in (
      select c.id from cohort c where c.technician_id = ?
    )
    order by cmb.order_in_cohort asc
  `).all(req.params.id) as Array<{
    cohort_id: string;
    module_code: string;
    module_name: string;
    order_in_cohort: number;
    start_day_offset: number;
    duration_days: number;
  }>;

  const blocksByCohort = new Map<string, Array<{
    module_code: string;
    module_name: string;
    order_in_cohort: number;
    start_day_offset: number;
    duration_days: number;
  }>>();
  for (const block of blocks) {
    const list = blocksByCohort.get(block.cohort_id) ?? [];
    list.push({
      module_code: block.module_code,
      module_name: block.module_name,
      order_in_cohort: block.order_in_cohort,
      start_day_offset: block.start_day_offset,
      duration_days: block.duration_days
    });
    blocksByCohort.set(block.cohort_id, list);
  }

  return res.json({
    technician,
    cohorts: cohorts.map((cohort) => ({
      ...cohort,
      blocks: blocksByCohort.get(cohort.id) ?? []
    }))
  });
});

app.patch('/technicians/:id/skills', (req, res) => {
  const schema = z.object({ module_ids: z.array(z.string()) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const exists = db.prepare('select id from technician where id = ?').get(req.params.id) as { id: string } | undefined;
  if (!exists) {
    return res.status(404).json({ message: 'Técnico não encontrado' });
  }

  const tx = db.transaction(() => {
    db.prepare('delete from technician_skill where technician_id = ?').run(req.params.id);
    const stmt = db.prepare('insert into technician_skill (technician_id, module_id) values (?, ?)');
    parsed.data.module_ids.forEach((moduleId) => stmt.run(req.params.id, moduleId));
  });

  tx();
  res.json({ ok: true });
});

app.get('/admin/catalog', (_req, res) => {
  res.json(getAdminCatalog());
});

app.post('/admin/modules', (req, res) => {
  const schema = z.object({
    code: z.string().min(3),
    category: z.string().min(1),
    name: z.string().min(2),
    description: z.string().nullable().optional(),
    duration_days: z.number().int().positive(),
    profile: z.string().nullable().optional(),
    is_mandatory: z.number().int().min(0).max(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  try {
    const id = uuid('mod');
    const tx = db.transaction(() => {
      db.prepare(`
      insert into module_template (id, code, category, name, description, duration_days, profile, is_mandatory)
      values (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        parsed.data.code.toUpperCase(),
        parsed.data.category,
        parsed.data.name,
        parsed.data.description ?? null,
        parsed.data.duration_days,
        parsed.data.profile ?? null,
        parsed.data.is_mandatory
      );

      const companies = db.prepare('select id from company').all() as Array<{ id: string }>;
      const insertProgress = db.prepare(`
        insert or ignore into company_module_progress (id, company_id, module_id, status, notes, completed_at)
        values (?, ?, ?, 'Nao_iniciado', null, null)
      `);
      const insertActivation = db.prepare(`
        insert or ignore into company_module_activation (company_id, module_id, is_enabled)
        values (?, ?, 1)
      `);
      companies.forEach((company) => {
        insertProgress.run(uuid('prog'), company.id, id);
        insertActivation.run(company.id, id);
      });
    });
    tx();

    return res.status(201).json({ id });
  } catch (error) {
    return res.status(400).json({ message: 'Nao foi possivel criar modulo', detail: errorMessage(error) });
  }
});

app.patch('/admin/modules/:id', (req, res) => {
  const schema = z.object({
    code: z.string().min(3).optional(),
    category: z.string().min(1).optional(),
    name: z.string().min(2).optional(),
    description: z.string().nullable().optional(),
    duration_days: z.number().int().positive().optional(),
    profile: z.string().nullable().optional(),
    is_mandatory: z.number().int().min(0).max(1).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const payload = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];
  Object.entries(payload).forEach(([key, value]) => {
    fields.push(`${key} = ?`);
    values.push(key === 'code' && typeof value === 'string' ? value.toUpperCase() : value);
  });

  if (fields.length === 0) {
    return res.status(200).json({ message: 'Sem alteracoes' });
  }

  values.push(req.params.id);
  try {
    const result = db.prepare(`update module_template set ${fields.join(', ')} where id = ?`).run(...values);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'Modulo nao encontrado' });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ message: 'Nao foi possivel atualizar modulo', detail: errorMessage(error) });
  }
});

app.put('/admin/modules/:id/prerequisites', (req, res) => {
  const schema = z.object({
    prerequisite_module_ids: z.array(z.string())
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const moduleId = req.params.id;
  const exists = db.prepare('select id from module_template where id = ?').get(moduleId);
  if (!exists) {
    return res.status(404).json({ message: 'Modulo nao encontrado' });
  }

  if (parsed.data.prerequisite_module_ids.includes(moduleId)) {
    return res.status(400).json({ message: 'Modulo nao pode ter pre-requisito dele mesmo' });
  }

  const tx = db.transaction(() => {
    db.prepare('delete from module_prerequisite where module_id = ?').run(moduleId);
    const insert = db.prepare(`
      insert into module_prerequisite (module_id, prerequisite_module_id)
      values (?, ?)
    `);
    parsed.data.prerequisite_module_ids.forEach((prereqId) => {
      insert.run(moduleId, prereqId);
    });
  });

  try {
    tx();
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ message: 'Nao foi possivel atualizar pre-requisitos', detail: errorMessage(error) });
  }
});

app.delete('/admin/modules/:id', (req, res) => {
  const module = db.prepare('select id, code, name from module_template where id = ?').get(req.params.id) as
    | { id: string; code: string; name: string }
    | undefined;

  if (!module) {
    return res.status(404).json({ message: 'Modulo nao encontrado' });
  }

  const installationCode = getInstallationModuleCode();
  if (installationCode && module.code === installationCode) {
    return res.status(400).json({ message: 'Nao e permitido excluir o modulo global de instalacao.' });
  }

  const blockUsage = db.prepare('select count(*) as count from cohort_module_block where module_id = ?').get(module.id) as { count: number };
  if (blockUsage.count > 0) {
    return res.status(400).json({ message: 'Modulo usado em blocos de turma. Remova os blocos antes de excluir.' });
  }

  const allocationUsage = db.prepare('select count(*) as count from cohort_allocation where module_id = ?').get(module.id) as { count: number };
  if (allocationUsage.count > 0) {
    return res.status(400).json({ message: 'Modulo possui alocacoes historicas. Exclusao bloqueada para preservar historico.' });
  }

  try {
    db.prepare('delete from module_template where id = ?').run(module.id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ message: 'Nao foi possivel excluir modulo', detail: errorMessage(error) });
  }
});

app.post('/admin/bootstrap-current-data', (req, res) => {
  const schema = z.object({
    clients: z.array(z.string().min(2)).default([]),
    modules: z.array(z.object({
      code: z.string().min(3),
      name: z.string().min(3),
      category: z.string().optional(),
      duration_days: z.number().int().positive().optional(),
      profile: z.string().nullable().optional(),
      is_mandatory: z.number().int().min(0).max(1).optional()
    })).default([])
  });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const { clients, modules } = parsed.data;
  const summary = {
    clients_upserted: 0,
    modules_upserted: 0,
    progress_rows_created: 0
  };

  const tx = db.transaction(() => {
    const upsertCompany = db.prepare(`
      insert into company (id, name, status, notes, priority)
      values (?, ?, 'Ativo', null, 0)
      on conflict(name) do update set status = 'Ativo'
    `);

    const upsertModule = db.prepare(`
      insert into module_template (id, code, category, name, description, duration_days, profile, is_mandatory)
      values (?, ?, ?, ?, null, ?, ?, ?)
      on conflict(code) do update set
        category = excluded.category,
        name = excluded.name,
        duration_days = excluded.duration_days,
        profile = excluded.profile,
        is_mandatory = excluded.is_mandatory
    `);

    clients.forEach((name) => {
      upsertCompany.run(`comp-${slugify(name)}`, name.trim());
      summary.clients_upserted += 1;
    });

    modules.forEach((module) => {
      upsertModule.run(
        `mod-${slugify(module.code)}`,
        module.code.trim().toUpperCase(),
        module.category ?? 'Geral',
        module.name.trim(),
        module.duration_days ?? 1,
        module.profile ?? null,
        module.is_mandatory ?? 0
      );
      summary.modules_upserted += 1;
    });

    const companies = db.prepare('select id from company').all() as Array<{ id: string }>;
    const modulesRows = db.prepare('select id from module_template').all() as Array<{ id: string }>;

    const insertDefaultProgress = db.prepare(`
      insert or ignore into company_module_progress (id, company_id, module_id, status, notes, completed_at)
      values (?, ?, ?, 'Nao_iniciado', null, null)
    `);
    const insertActivation = db.prepare(`
      insert or ignore into company_module_activation (company_id, module_id, is_enabled)
      values (?, ?, 1)
    `);
    companies.forEach((company) => {
      modulesRows.forEach((module) => {
        const result = insertDefaultProgress.run(uuid('prog'), company.id, module.id);
        summary.progress_rows_created += result.changes;
        insertActivation.run(company.id, module.id);
      });
    });
  });

  try {
    tx();
    return res.json({ ok: true, summary });
  } catch (error) {
    return res.status(400).json({ message: 'Falha ao aplicar base atual', detail: errorMessage(error) });
  }
});

app.post('/admin/bootstrap-real-scenario', (_req, res) => {
  const clients = [
    'Krah do Brasil',
    'Magui Dispositivos',
    'Mancal Serviços',
    'Grupo CBM',
    'Caduferr',
    'Herten Ferramentaria',
    'Eletrospark Dispositivos'
  ];

  const technicians = [
    { id: 'tech-01', name: 'Carlos Lima', availability_notes: 'Foco em Instalação e CAD' },
    { id: 'tech-02', name: 'Ana Souza', availability_notes: 'Foco em CAM e Processos' },
    { id: 'tech-03', name: 'Paulo Reis', availability_notes: 'Foco em Implantação e Consultoria' }
  ];

  const modules = [
    { code: '020101020', name: "Treinamento TopSolid'Design 7 - Básico", category: 'CAD', duration_days: 3, is_mandatory: 1 },
    { code: '020101030', name: "Treinamento TopSolid'Design 7 - Montagem", category: 'CAD', duration_days: 2, is_mandatory: 1 },
    { code: '020102010', name: "Treinamento TopSolid'Cam 7 - Fresamento 2D", category: 'CAM', duration_days: 3, is_mandatory: 1 },
    { code: '020102020', name: "Treinamento TopSolid'Cam 7 - Fresamento 3D", category: 'CAM', duration_days: 2, is_mandatory: 1 },
    { code: '020102120', name: "Treinamento TopSolid'Cam 7 - Condições de Cortes (interno)", category: 'CAM', duration_days: 1, is_mandatory: 0 },
    { code: '020102070', name: "Treinamento TopSolid'Cam 7 - TopTool (interno)", category: 'CAM', duration_days: 3, is_mandatory: 0 },
    { code: '020102075', name: "Treinamento TopSolid'Cam 7 - Folha de Processos (interno)", category: 'CAM', duration_days: 2, is_mandatory: 0 },
    { code: '020102080', name: "Treinamento TopSolid'Cam 7 - Processos Automáticos", category: 'CAM', duration_days: 3, is_mandatory: 0 },
    { code: 'DT-001', name: 'Digital Twin - Utilização de máquina virtual 3D - Simplificada', category: 'CAM', duration_days: 3, is_mandatory: 0 },
    { code: '020202020', name: "Implantação TopSolid'Cam 7 (interno)", category: 'Automação', duration_days: 2, is_mandatory: 0 },
    { code: '020302050', name: "Acompanhamento TopSolid'Cam (interno)", category: 'Consultoria', duration_days: 2, is_mandatory: 0 },
    { code: '960001010', name: 'Instalação / Configuração', category: 'Instalação', duration_days: 1, is_mandatory: 1 }
  ];

  const realCohorts = [
    {
      id: 'coh-real-101',
      code: 'TUR-101',
      name: 'Design 7 - Básico e Montagem',
      start_date: '2026-02-17',
      technician_id: 'tech-02',
      status: 'Confirmada',
      capacity_companies: 8,
      blocks: [
        { module_code: '020101020', order_in_cohort: 1, start_day_offset: 1, duration_days: 3 },
        { module_code: '020101030', order_in_cohort: 2, start_day_offset: 4, duration_days: 2 }
      ],
      allocations: [
        { company_name: 'Krah do Brasil', module_code: '020101020', entry_day: 1, status: 'Confirmado' },
        { company_name: 'Magui Dispositivos', module_code: '020101020', entry_day: 1, status: 'Confirmado' },
        { company_name: 'Caduferr', module_code: '020101020', entry_day: 1, status: 'Previsto' },
        { company_name: 'Krah do Brasil', module_code: '020101030', entry_day: 4, status: 'Previsto' },
        { company_name: 'Magui Dispositivos', module_code: '020101030', entry_day: 4, status: 'Previsto' }
      ]
    },
    {
      id: 'coh-real-102',
      code: 'TUR-102',
      name: 'Instalação + Design 7',
      start_date: '2026-02-20',
      technician_id: 'tech-01',
      status: 'Planejada',
      capacity_companies: 8,
      blocks: [
        { module_code: '960001010', order_in_cohort: 1, start_day_offset: 1, duration_days: 1 },
        { module_code: '020101020', order_in_cohort: 2, start_day_offset: 2, duration_days: 3 }
      ],
      allocations: [
        { company_name: 'Mancal Serviços', module_code: '960001010', entry_day: 1, status: 'Confirmado' },
        { company_name: 'Grupo CBM', module_code: '960001010', entry_day: 1, status: 'Previsto' },
        { company_name: 'Herten Ferramentaria', module_code: '960001010', entry_day: 1, status: 'Previsto' },
        { company_name: 'Mancal Serviços', module_code: '020101020', entry_day: 2, status: 'Previsto' },
        { company_name: 'Grupo CBM', module_code: '020101020', entry_day: 2, status: 'Previsto' }
      ]
    },
    {
      id: 'coh-real-103',
      code: 'TUR-103',
      name: 'CAM 7 - Fresamento 2D/3D',
      start_date: '2026-02-24',
      technician_id: 'tech-02',
      status: 'Aguardando_quorum',
      capacity_companies: 6,
      blocks: [
        { module_code: '020102010', order_in_cohort: 1, start_day_offset: 1, duration_days: 3 },
        { module_code: '020102020', order_in_cohort: 2, start_day_offset: 4, duration_days: 2 }
      ],
      allocations: [
        { company_name: 'Eletrospark Dispositivos', module_code: '020102010', entry_day: 1, status: 'Previsto' },
        { company_name: 'Caduferr', module_code: '020102010', entry_day: 1, status: 'Previsto' },
        { company_name: 'Herten Ferramentaria', module_code: '020102020', entry_day: 4, status: 'Previsto' },
        { company_name: 'Magui Dispositivos', module_code: '020102020', entry_day: 4, status: 'Previsto' }
      ]
    },
    {
      id: 'coh-real-104',
      code: 'TUR-104',
      name: 'Processos Automáticos e Implantação',
      start_date: '2026-03-03',
      technician_id: 'tech-03',
      status: 'Planejada',
      capacity_companies: 6,
      blocks: [
        { module_code: '020102080', order_in_cohort: 1, start_day_offset: 1, duration_days: 3 },
        { module_code: '020202020', order_in_cohort: 2, start_day_offset: 4, duration_days: 2 },
        { module_code: '020302050', order_in_cohort: 3, start_day_offset: 6, duration_days: 2 }
      ],
      allocations: [
        { company_name: 'Grupo CBM', module_code: '020102080', entry_day: 1, status: 'Previsto' },
        { company_name: 'Krah do Brasil', module_code: '020202020', entry_day: 4, status: 'Previsto' },
        { company_name: 'Magui Dispositivos', module_code: '020302050', entry_day: 6, status: 'Previsto' }
      ]
    }
  ] as Array<{
    id: string;
    code: string;
    name: string;
    start_date: string;
    technician_id: string;
    status: 'Planejada' | 'Aguardando_quorum' | 'Confirmada';
    capacity_companies: number;
    blocks: Array<{ module_code: string; order_in_cohort: number; start_day_offset: number; duration_days: number }>;
    allocations: Array<{ company_name: string; module_code: string; entry_day: number; status: 'Previsto' | 'Confirmado' }>;
  }>;

  const summary = {
    companies_inserted: 0,
    technicians_inserted: 0,
    modules_inserted: 0,
    cohorts_inserted: 0,
    allocations_inserted: 0
  };

  const tx = db.transaction(() => {
    clearAllData();

    const insertCompany = db.prepare(`
      insert into company (id, name, status, notes, priority)
      values (?, ?, 'Ativo', null, 0)
    `);
    const insertTechnician = db.prepare(`
      insert into technician (id, name, availability_notes)
      values (?, ?, ?)
    `);
    const insertModule = db.prepare(`
      insert into module_template (id, code, category, name, description, duration_days, profile, is_mandatory)
      values (?, ?, ?, ?, null, ?, null, ?)
    `);
    const insertPrereq = db.prepare(`
      insert or ignore into module_prerequisite (module_id, prerequisite_module_id)
      values (?, ?)
    `);
    const insertProgress = db.prepare(`
      insert into company_module_progress (id, company_id, module_id, status, notes, completed_at)
      values (?, ?, ?, ?, null, ?)
    `);
    const insertActivation = db.prepare(`
      insert into company_module_activation (company_id, module_id, is_enabled)
      values (?, ?, 1)
    `);
    const insertSkill = db.prepare(`
      insert into technician_skill (technician_id, module_id)
      values (?, ?)
    `);
    const insertCohort = db.prepare(`
      insert into cohort (id, code, name, start_date, technician_id, status, capacity_companies, notes)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertBlock = db.prepare(`
      insert into cohort_module_block (id, cohort_id, module_id, order_in_cohort, start_day_offset, duration_days)
      values (?, ?, ?, ?, ?, ?)
    `);
    const insertAllocation = db.prepare(`
      insert into cohort_allocation (id, cohort_id, company_id, module_id, entry_day, status, notes)
      values (?, ?, ?, ?, ?, ?, null)
    `);

    clients.forEach((name) => {
      insertCompany.run(`comp-${slugify(name)}`, name);
      summary.companies_inserted += 1;
    });

    technicians.forEach((tech) => {
      insertTechnician.run(tech.id, tech.name, tech.availability_notes);
      summary.technicians_inserted += 1;
    });

    modules.forEach((module) => {
      insertModule.run(
        `mod-${slugify(module.code)}`,
        module.code,
        module.category,
        module.name,
        module.duration_days,
        module.is_mandatory
      );
      summary.modules_inserted += 1;
    });

    const installationId = `mod-${slugify('960001010')}`;
    modules
      .filter((module) => module.code !== '960001010')
      .forEach((module) => {
        insertPrereq.run(`mod-${slugify(module.code)}`, installationId);
      });

    const companyIds = clients.map((name) => `comp-${slugify(name)}`);
    const moduleIds = modules.map((module) => `mod-${slugify(module.code)}`);
    companyIds.forEach((companyId) => {
      moduleIds.forEach((moduleId) => {
        insertProgress.run(uuid('prog'), companyId, moduleId, 'Nao_iniciado', null);
        insertActivation.run(companyId, moduleId);
      });
    });

    const markProgressDone = db.prepare(`
      update company_module_progress
      set status = 'Concluido',
        completed_at = ?
      where company_id = ? and module_id = ?
    `);
    markProgressDone.run('2026-02-10', `comp-${slugify('Krah do Brasil')}`, installationId);
    markProgressDone.run('2026-02-10', `comp-${slugify('Magui Dispositivos')}`, installationId);

    const allModuleIdsForSkills = moduleIds.filter((moduleId) => moduleId !== installationId);
    allModuleIdsForSkills.forEach((moduleId) => {
      insertSkill.run('tech-02', moduleId);
    });
    insertSkill.run('tech-01', installationId);
    insertSkill.run('tech-01', `mod-${slugify('020101020')}`);
    insertSkill.run('tech-03', `mod-${slugify('020202020')}`);
    insertSkill.run('tech-03', `mod-${slugify('020302050')}`);

    realCohorts.forEach((cohort) => {
      insertCohort.run(
        cohort.id,
        cohort.code,
        cohort.name,
        cohort.start_date,
        cohort.technician_id,
        cohort.status,
        cohort.capacity_companies,
        'Cenário real para validação'
      );
      cohort.blocks.forEach((block) => {
        insertBlock.run(
          uuid('blk'),
          cohort.id,
          `mod-${slugify(block.module_code)}`,
          block.order_in_cohort,
          block.start_day_offset,
          block.duration_days
        );
      });
      cohort.allocations.forEach((allocation) => {
        insertAllocation.run(
          uuid('all'),
          cohort.id,
          `comp-${slugify(allocation.company_name)}`,
          `mod-${slugify(allocation.module_code)}`,
          allocation.entry_day,
          allocation.status
        );
        summary.allocations_inserted += 1;
      });
      summary.cohorts_inserted += 1;
    });
  });

  try {
    tx();
    return res.json({ ok: true, summary });
  } catch (error) {
    return res.status(400).json({ message: 'Falha ao criar cenário real', detail: errorMessage(error) });
  }
});

app.post('/admin/import-workbook', (req, res) => {
  const schema = z.object({
    file_path: z.string().optional(),
    reset_data: z.boolean().optional()
  });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const filePath = parsed.data.file_path ?? DEFAULT_WORKBOOK_PATH;
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ message: 'Arquivo nao encontrado', file_path: absolutePath });
  }

  try {
    const summary = importWorkbook(absolutePath, { resetData: parsed.data.reset_data ?? true });
    return res.json({ ok: true, summary });
  } catch (error) {
    return res.status(500).json({ message: 'Falha ao importar planilha', detail: errorMessage(error) });
  }
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
