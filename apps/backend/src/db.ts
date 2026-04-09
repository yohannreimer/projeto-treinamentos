import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type SqliteDatabase = InstanceType<typeof Database>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../data');
fs.mkdirSync(dataDir, { recursive: true });

function resolveDbPath() {
  const explicitDbPath = process.env.APP_DB_PATH?.trim();
  return explicitDbPath ? path.resolve(explicitDbPath) : path.resolve(dataDir, 'app.db');
}

let activeDbPath: string | null = null;
let activeDb: SqliteDatabase | null = null;

function getDbConnection(forceRefresh = false): SqliteDatabase {
  const nextDbPath = resolveDbPath();
  if (!forceRefresh && activeDb && activeDbPath === nextDbPath) {
    return activeDb;
  }

  const nextDb = new Database(nextDbPath);
  const previousDb = activeDb;
  activeDb = nextDb;
  activeDbPath = nextDbPath;
  previousDb?.close();

  return nextDb;
}

export function resetDbConnection() {
  return getDbConnection(true);
}

export const db = new Proxy({} as SqliteDatabase, {
  get(_target, property) {
    const connection = getDbConnection();
    const value = Reflect.get(connection, property);
    return typeof value === 'function' ? value.bind(connection) : value;
  },
  set(_target, property, value) {
    return Reflect.set(getDbConnection(), property, value);
  },
  has(_target, property) {
    return Reflect.has(getDbConnection(), property);
  },
  ownKeys() {
    return Reflect.ownKeys(getDbConnection());
  },
  getOwnPropertyDescriptor(_target, property) {
    return Reflect.getOwnPropertyDescriptor(getDbConnection(), property);
  }
});

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`alter table ${table} add column ${definition}`);
  }
}

export function initDb() {
  db.pragma('journal_mode = WAL');

  db.exec(`
    create table if not exists module_template (
      id text primary key,
      code text not null unique,
      category text not null,
      name text not null,
      description text,
      duration_days integer not null,
      profile text,
      is_mandatory integer not null default 0
    );

    create table if not exists company (
      id text primary key,
      name text not null unique,
      status text not null default 'Em_treinamento',
      notes text,
      priority integer not null default 0,
      priority_level text not null default 'Normal',
      contact_name text,
      contact_phone text,
      contact_email text,
      modality text not null default 'Turma_Online',
      is_third_party integer not null default 0
    );

    create table if not exists company_module_progress (
      id text primary key,
      company_id text not null,
      module_id text not null,
      status text not null default 'Nao_iniciado',
      notes text,
      completed_at text,
      custom_duration_days integer,
      custom_units integer,
      unique(company_id, module_id),
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(module_id) references module_template(id) on delete cascade
    );

    create table if not exists company_module_activation (
      company_id text not null,
      module_id text not null,
      is_enabled integer not null default 1,
      primary key (company_id, module_id),
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(module_id) references module_template(id) on delete cascade
    );

    create table if not exists technician (
      id text primary key,
      name text not null,
      availability_notes text,
      hourly_cost real
    );

    create table if not exists technician_skill (
      technician_id text not null,
      module_id text not null,
      primary key (technician_id, module_id),
      foreign key(technician_id) references technician(id) on delete cascade,
      foreign key(module_id) references module_template(id) on delete cascade
    );

    create table if not exists cohort (
      id text primary key,
      code text not null unique,
      name text not null,
      start_date text not null,
      technician_id text,
      status text not null default 'Planejada',
      capacity_companies integer not null,
      period text not null default 'Integral',
      start_time text,
      end_time text,
      delivery_mode text not null default 'Online',
      notes text,
      foreign key(technician_id) references technician(id) on delete set null
    );

    create table if not exists cohort_module_block (
      id text primary key,
      cohort_id text not null,
      module_id text not null,
      order_in_cohort integer not null,
      start_day_offset integer not null,
      duration_days integer not null,
      unique(cohort_id, order_in_cohort),
      foreign key(cohort_id) references cohort(id) on delete cascade,
      foreign key(module_id) references module_template(id) on delete restrict
    );

    create table if not exists cohort_schedule_day (
      id text primary key,
      cohort_id text not null,
      day_index integer not null,
      day_date text not null,
      start_time text,
      end_time text,
      unique(cohort_id, day_index),
      foreign key(cohort_id) references cohort(id) on delete cascade
    );

    create table if not exists cohort_allocation (
      id text primary key,
      cohort_id text not null,
      company_id text not null,
      module_id text not null,
      entry_day integer not null,
      status text not null default 'Previsto',
      notes text,
      override_installation_prereq integer not null default 0,
      override_reason text,
      executed_at text,
      unique(cohort_id, company_id, module_id),
      foreign key(cohort_id) references cohort(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(module_id) references module_template(id) on delete restrict
    );

    create table if not exists cohort_participant (
      id text primary key,
      cohort_id text not null,
      company_id text not null,
      participant_name text not null,
      created_at text not null,
      unique(cohort_id, company_id, participant_name),
      foreign key(cohort_id) references cohort(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade
    );

    create table if not exists cohort_participant_module (
      participant_id text not null,
      module_id text not null,
      primary key (participant_id, module_id),
      foreign key(participant_id) references cohort_participant(id) on delete cascade,
      foreign key(module_id) references module_template(id) on delete cascade
    );

    create table if not exists optional_module (
      id text primary key,
      code text not null unique,
      category text,
      name text not null,
      duration_days integer not null,
      profile text,
      notes text
    );

    create table if not exists company_optional_progress (
      id text primary key,
      company_id text not null,
      optional_module_id text not null,
      status text not null default 'Planejado',
      notes text,
      unique(company_id, optional_module_id),
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(optional_module_id) references optional_module(id) on delete cascade
    );

    create table if not exists module_prerequisite (
      module_id text not null,
      prerequisite_module_id text not null,
      primary key (module_id, prerequisite_module_id),
      foreign key(module_id) references module_template(id) on delete cascade,
      foreign key(prerequisite_module_id) references module_template(id) on delete cascade
    );

    create table if not exists company_license (
      id text primary key,
      company_id text not null,
      name text not null,
      program_id text,
      user_name text,
      module_list text,
      license_identifier text,
      renewal_cycle text not null default 'Mensal',
      expires_at text not null,
      notes text,
      last_renewed_at text,
      created_at text not null,
      updated_at text not null,
      foreign key(company_id) references company(id) on delete cascade
    );

    create table if not exists company_license_module (
      license_id text not null,
      module_id text not null,
      primary key (license_id, module_id),
      foreign key(license_id) references company_license(id) on delete cascade,
      foreign key(module_id) references module_template(id) on delete cascade
    );

    create table if not exists license_program (
      id text primary key,
      name text not null unique,
      notes text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists recruitment_candidate (
      id text primary key,
      name text not null,
      process_status text not null default 'Em_processo',
      stage text not null default 'Triagem',
      strengths text,
      concerns text,
      specialties text,
      equipment_notes text,
      career_plan text,
      notes text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists calendar_activity (
      id text primary key,
      title text not null,
      activity_type text not null default 'Outro',
      start_date text not null,
      end_date text not null,
      all_day integer not null default 1,
      start_time text,
      end_time text,
      technician_id text,
      company_id text,
      status text not null default 'Planejada',
      notes text,
      created_at text not null,
      updated_at text not null,
      foreign key(technician_id) references technician(id) on delete set null,
      foreign key(company_id) references company(id) on delete set null
    );

    create table if not exists calendar_activity_technician (
      activity_id text not null,
      technician_id text not null,
      primary key (activity_id, technician_id),
      foreign key(activity_id) references calendar_activity(id) on delete cascade,
      foreign key(technician_id) references technician(id) on delete cascade
    );

    create table if not exists internal_document (
      id text primary key,
      title text not null,
      category text,
      notes text,
      file_name text not null,
      mime_type text not null,
      file_data_base64 text not null,
      file_size_bytes integer not null default 0,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists implementation_kanban_card (
      id text primary key,
      title text not null,
      description text,
      status text not null default 'Todo',
      column_id text,
      client_name text,
      license_name text,
      module_name text,
      technician_id text,
      subcategory text,
      support_resolution text,
      support_third_party_notes text,
      support_handoff_target text,
      support_handoff_date text,
      priority text not null default 'Normal',
      due_date text,
      attachment_image_data_url text,
      position integer not null default 0,
      created_at text not null,
      updated_at text not null,
      foreign key(column_id) references implementation_kanban_column(id) on delete set null
    );

    create table if not exists implementation_kanban_column (
      id text primary key,
      title text not null,
      color text,
      position integer not null default 0,
      created_at text not null,
      updated_at text not null
    );
  `);

  ensureColumn('company', 'priority', 'priority integer not null default 0');
  ensureColumn('company', 'priority_level', "priority_level text not null default 'Normal'");
  ensureColumn('company', 'contact_name', 'contact_name text');
  ensureColumn('company', 'contact_phone', 'contact_phone text');
  ensureColumn('company', 'contact_email', 'contact_email text');
  ensureColumn('company', 'modality', "modality text not null default 'Turma_Online'");
  ensureColumn('company', 'is_third_party', 'is_third_party integer not null default 0');
  ensureColumn('company_module_progress', 'custom_duration_days', 'custom_duration_days integer');
  ensureColumn('company_module_progress', 'custom_units', 'custom_units integer');
  ensureColumn('cohort', 'period', "period text not null default 'Integral'");
  ensureColumn('cohort', 'start_time', 'start_time text');
  ensureColumn('cohort', 'end_time', 'end_time text');
  ensureColumn('cohort', 'delivery_mode', "delivery_mode text not null default 'Online'");
  ensureColumn(
    'cohort_allocation',
    'override_installation_prereq',
    'override_installation_prereq integer not null default 0'
  );
  ensureColumn('cohort_allocation', 'override_reason', 'override_reason text');
  ensureColumn('cohort_allocation', 'executed_at', 'executed_at text');
  ensureColumn('company_license', 'program_id', 'program_id text');
  ensureColumn('company_license', 'user_name', 'user_name text');
  ensureColumn('company_license', 'module_list', 'module_list text');
  ensureColumn('company_license', 'license_identifier', 'license_identifier text');
  ensureColumn('technician', 'hourly_cost', 'hourly_cost real');
  ensureColumn('implementation_kanban_card', 'column_id', 'column_id text');
  ensureColumn('implementation_kanban_card', 'client_name', 'client_name text');
  ensureColumn('implementation_kanban_card', 'license_name', 'license_name text');
  ensureColumn('implementation_kanban_card', 'module_name', 'module_name text');
  ensureColumn('implementation_kanban_card', 'technician_id', 'technician_id text');
  ensureColumn('implementation_kanban_card', 'subcategory', 'subcategory text');
  ensureColumn('implementation_kanban_card', 'support_resolution', 'support_resolution text');
  ensureColumn('implementation_kanban_card', 'support_third_party_notes', 'support_third_party_notes text');
  ensureColumn('implementation_kanban_card', 'support_handoff_target', 'support_handoff_target text');
  ensureColumn('implementation_kanban_card', 'support_handoff_date', 'support_handoff_date text');
  ensureColumn('implementation_kanban_card', 'priority', "priority text not null default 'Normal'");
  ensureColumn('implementation_kanban_card', 'due_date', 'due_date text');
  ensureColumn('implementation_kanban_card', 'attachment_image_data_url', 'attachment_image_data_url text');

  db.exec(`
    insert or ignore into cohort_participant_module (participant_id, module_id)
    select cp.id, a.module_id
    from cohort_participant cp
    join cohort_allocation a on a.cohort_id = cp.cohort_id and a.company_id = cp.company_id
    where a.status <> 'Cancelado'
  `);

  const activitiesWithSingleTechnician = db.prepare(`
    select id, technician_id
    from calendar_activity
    where technician_id is not null and trim(technician_id) <> ''
  `).all() as Array<{ id: string; technician_id: string }>;
  const insertActivityTechnician = db.prepare(`
    insert or ignore into calendar_activity_technician (activity_id, technician_id)
    values (?, ?)
  `);
  activitiesWithSingleTechnician.forEach((row) => {
    insertActivityTechnician.run(row.id, row.technician_id);
  });

  const nowIso = new Date().toISOString().slice(0, 10);
  const defaultKanbanColumns: Array<{ id: string; title: string; color: string; position: number }> = [
    { id: 'kcol-todo', title: 'A fazer', color: '#7b8ea8', position: 0 },
    { id: 'kcol-doing', title: 'Em andamento', color: '#b17613', position: 1 },
    { id: 'kcol-done', title: 'Concluído', color: '#1c8b61', position: 2 }
  ];
  const existingColumnCount = db.prepare('select count(*) as count from implementation_kanban_column').get() as { count: number };
  if (existingColumnCount.count === 0) {
    const insertColumn = db.prepare(`
      insert into implementation_kanban_column (id, title, color, position, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?)
    `);
    defaultKanbanColumns.forEach((column) => {
      insertColumn.run(column.id, column.title, column.color, column.position, nowIso, nowIso);
    });
  }

  const statusToColumnId: Record<string, string> = {
    Todo: 'kcol-todo',
    Doing: 'kcol-doing',
    Done: 'kcol-done'
  };
  const cardsWithoutColumn = db.prepare(`
    select id, status
    from implementation_kanban_card
    where column_id is null or trim(column_id) = ''
  `).all() as Array<{ id: string; status: string }>;
  if (cardsWithoutColumn.length > 0) {
    const firstColumn = db.prepare(`
      select id
      from implementation_kanban_column
      order by position asc, created_at asc
      limit 1
    `).get() as { id: string } | undefined;
    const fallbackColumnId = firstColumn?.id ?? 'kcol-todo';
    const updateCardColumn = db.prepare('update implementation_kanban_card set column_id = ? where id = ?');
    cardsWithoutColumn.forEach((card) => {
      updateCardColumn.run(statusToColumnId[card.status] ?? fallbackColumnId, card.id);
    });
  }

  const licenseProgramCount = db.prepare('select count(*) as count from license_program').get() as { count: number };
  if (licenseProgramCount.count === 0) {
    const nowIso = new Date().toISOString().slice(0, 10);
    const insertProgram = db.prepare(`
      insert into license_program (id, name, notes, created_at, updated_at)
      values (?, ?, ?, ?, ?)
    `);
    insertProgram.run('lpr-topsolid-design', 'TopSolid Design', null, nowIso, nowIso);
    insertProgram.run('lpr-topsolid-cam', 'TopSolid CAM', null, nowIso, nowIso);
  }
}

function hasSeed(): boolean {
  const row = db.prepare('select count(*) as count from module_template').get() as { count: number };
  return row.count > 0;
}

export function seedDb() {
  if (hasSeed()) return;

  const modules: Array<[string, string, string, string, number, string, number]> = [
    ['mod-01', 'MOD-01', 'Instalacao', 'Instalacao TopSolid', 1, 'Iniciante', 1],
    ['mod-02', 'MOD-02', 'CAD', 'TopSolid Design Basico', 3, 'Iniciante', 1],
    ['mod-03', 'MOD-03', 'CAD', 'TopSolid Montagem', 2, 'Intermediario', 1],
    ['mod-04', 'MOD-04', 'CAD', 'Detalhamento 2D', 2, 'Intermediario', 0],
    ['mod-05', 'MOD-05', 'CAM', 'TopSolid CAM Basico', 3, 'Intermediario', 1],
    ['mod-06', 'MOD-06', 'CAM', 'TopSolid CAM Avancado', 2, 'Avancado', 0]
  ];

  const companies: Array<[string, string, string, string, number]> = [
    ['comp-01', 'Metal Forte', 'Ativo', 'Cliente industrial', 0],
    ['comp-02', 'Usinagem Alpha', 'Ativo', 'Entrou em 2025', 0],
    ['comp-03', 'Mecanica Beta', 'Ativo', 'Pendencia de instalacao', 0],
    ['comp-04', 'Projeto Gama', 'Inativo', 'Conta em pausa', 0]
  ];

  const techs: Array<[string, string, string]> = [
    ['tech-01', 'Carlos Lima', 'Disponivel no periodo da manha'],
    ['tech-02', 'Ana Souza', 'Especialista em CAD/CAM'],
    ['tech-03', 'Paulo Reis', 'Foco em implantacao e consultoria']
  ];

  const insertModule = db.prepare(
    'insert into module_template (id, code, category, name, duration_days, profile, is_mandatory) values (?, ?, ?, ?, ?, ?, ?)'
  );
  modules.forEach((m) => insertModule.run(...m));

  const insertCompany = db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, ?, ?)');
  companies.forEach((c) => insertCompany.run(...c));

  const insertTech = db.prepare('insert into technician (id, name, availability_notes) values (?, ?, ?)');
  techs.forEach((t) => insertTech.run(...t));

  const insertSkill = db.prepare('insert into technician_skill (technician_id, module_id) values (?, ?)');
  insertSkill.run('tech-01', 'mod-01');
  insertSkill.run('tech-01', 'mod-02');
  insertSkill.run('tech-01', 'mod-03');
  insertSkill.run('tech-02', 'mod-02');
  insertSkill.run('tech-02', 'mod-03');
  insertSkill.run('tech-02', 'mod-05');
  insertSkill.run('tech-02', 'mod-06');
  insertSkill.run('tech-03', 'mod-01');
  insertSkill.run('tech-03', 'mod-04');

  const progress = db.prepare(
    'insert into company_module_progress (id, company_id, module_id, status, completed_at) values (?, ?, ?, ?, ?)'
  );
  progress.run('prog-01', 'comp-01', 'mod-01', 'Concluido', '2025-12-10');
  progress.run('prog-02', 'comp-01', 'mod-02', 'Concluido', '2026-01-12');
  progress.run('prog-03', 'comp-02', 'mod-01', 'Concluido', '2026-01-03');
  progress.run('prog-04', 'comp-02', 'mod-02', 'Planejado', null);

  const activation = db.prepare(
    'insert or ignore into company_module_activation (company_id, module_id, is_enabled) values (?, ?, 1)'
  );
  companies.forEach((company) => {
    modules.forEach((module) => {
      activation.run(company[0], module[0]);
    });
  });

  const cohorts = db.prepare(
    'insert into cohort (id, code, name, start_date, technician_id, status, capacity_companies, notes) values (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  cohorts.run('coh-01', 'TUR-001', 'CAD Basico + Montagem', '2026-02-20', 'tech-02', 'Confirmada', 8, null);
  cohorts.run('coh-02', 'TUR-002', 'Instalacao + CAD Basico', '2026-02-27', 'tech-01', 'Planejada', 10, null);

  const blocks = db.prepare(
    'insert into cohort_module_block (id, cohort_id, module_id, order_in_cohort, start_day_offset, duration_days) values (?, ?, ?, ?, ?, ?)'
  );
  blocks.run('blk-01', 'coh-01', 'mod-02', 1, 1, 3);
  blocks.run('blk-02', 'coh-01', 'mod-03', 2, 4, 2);
  blocks.run('blk-03', 'coh-02', 'mod-01', 1, 1, 1);
  blocks.run('blk-04', 'coh-02', 'mod-02', 2, 2, 3);

  const allocations = db.prepare(
    'insert into cohort_allocation (id, cohort_id, company_id, module_id, entry_day, status, notes) values (?, ?, ?, ?, ?, ?, ?)'
  );
  allocations.run('all-01', 'coh-01', 'comp-01', 'mod-03', 4, 'Confirmado', 'Entrou no modulo de montagem');
  allocations.run('all-02', 'coh-02', 'comp-03', 'mod-01', 1, 'Previsto', null);

  const prereq = db.prepare(
    'insert or ignore into module_prerequisite (module_id, prerequisite_module_id) values (?, ?)'
  );
  modules
    .filter((item) => item[1] !== 'MOD-01')
    .forEach((item) => prereq.run(item[0], 'mod-01'));
}

export function clearAllData() {
  db.exec(`
    delete from calendar_activity_technician;
    delete from internal_document;
    delete from calendar_activity;
    delete from implementation_kanban_card;
    delete from implementation_kanban_column;
    delete from recruitment_candidate;
    delete from company_license_module;
    delete from company_license;
    delete from license_program;
    delete from company_optional_progress;
    delete from optional_module;
    delete from company_module_activation;
    delete from cohort_participant_module;
    delete from cohort_participant;
    delete from cohort_allocation;
    delete from cohort_schedule_day;
    delete from cohort_module_block;
    delete from cohort;
    delete from technician_skill;
    delete from technician;
    delete from company_module_progress;
    delete from company;
    delete from module_prerequisite;
    delete from module_template;
  `);
}

export function nowDateIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function uuid(prefix: string): string {
  return prefix + '-' + Math.random().toString(36).slice(2, 10);
}
