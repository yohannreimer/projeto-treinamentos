import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';

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
  nextDb.pragma('foreign_keys = ON');
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

function uniqueSortedIsoDates(values: string[]): string[] {
  return Array.from(new Set(values
    .map((item) => item.trim())
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item))
  )).sort((a, b) => a.localeCompare(b));
}

function iterateIsoDateRange(startDate: string, endDate: string): string[] {
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  if (!startYear || !startMonth || !startDay || !endYear || !endMonth || !endDay) return [];

  const cursor = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor > end) return [];

  const results: string[] = [];
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    results.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
}

function hashInternalPasswordSeed(password: string): string {
  const saltHex = randomBytes(16).toString('hex');
  const digest = scryptSync(password, saltHex, 64);
  return `scrypt:${saltHex}:${digest.toString('hex')}`;
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

    create table if not exists portal_client (
      id text primary key,
      company_id text not null unique,
      slug text not null unique,
      is_active integer not null default 1,
      support_intro_text text,
      hidden_module_ids_json text not null default '[]',
      module_date_overrides_json text not null default '{}',
      module_status_overrides_json text not null default '{}',
      created_at text not null,
      updated_at text not null,
      unique(id, company_id),
      foreign key(company_id) references company(id) on delete cascade
    );

    create table if not exists portal_user (
      id text primary key,
      portal_client_id text not null,
      username text not null,
      password_hash text not null,
      is_active integer not null default 1,
      last_login_at text,
      created_at text not null,
      updated_at text not null,
      unique(id, portal_client_id),
      unique(portal_client_id, username),
      foreign key(portal_client_id) references portal_client(id) on delete cascade
    );

    create table if not exists portal_session (
      id text primary key,
      portal_user_id text not null,
      portal_client_id text not null,
      company_id text not null,
      token_hash text not null unique,
      is_internal integer not null default 0,
      expires_at text not null,
      created_at text not null,
      last_seen_at text not null,
      foreign key(portal_user_id, portal_client_id)
        references portal_user(id, portal_client_id)
        on delete cascade,
      foreign key(portal_client_id, company_id)
        references portal_client(id, company_id)
        on delete cascade
    );

    create table if not exists portal_ticket (
      id text primary key,
      company_id text not null,
      portal_user_id text not null,
      title text not null,
      description text,
      priority text not null default 'Normal',
      status text not null default 'Aberto',
      origin text not null default 'portal_cliente',
      whatsapp_number text,
      last_read_cliente_at text,
      last_read_holand_at text,
      kanban_card_id text,
      created_at text not null,
      updated_at text not null,
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(portal_user_id) references portal_user(id) on delete cascade,
      foreign key(kanban_card_id) references implementation_kanban_card(id) on delete set null
    );

    create table if not exists portal_ticket_message (
      id text primary key,
      ticket_id text not null,
      author_type text not null default 'Cliente',
      author_label text,
      body text,
      created_at text not null,
      foreign key(ticket_id) references portal_ticket(id) on delete cascade
    );

    create table if not exists portal_ticket_attachment (
      id text primary key,
      ticket_message_id text not null,
      file_name text not null,
      mime_type text not null,
      file_data_base64 text not null,
      file_size_bytes integer not null default 0,
      created_at text not null,
      foreign key(ticket_message_id) references portal_ticket_message(id) on delete cascade
    );

    create table if not exists portal_ticket_webhook_queue (
      id text primary key,
      ticket_id text not null,
      company_id text not null,
      recipient_side text not null,
      recipient_whatsapp text not null,
      trigger_event text not null,
      event_created_at text not null,
      available_at text not null,
      payload_json text not null,
      sent_at text,
      suppressed_at text,
      suppression_reason text,
      last_error text,
      created_at text not null,
      updated_at text not null,
      foreign key(ticket_id) references portal_ticket(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade
    );

    create table if not exists portal_agenda_item (
      id text primary key,
      portal_client_id text not null,
      title text not null,
      activity_type text not null default 'Outro',
      start_date text not null,
      end_date text not null,
      all_day integer not null default 1,
      start_time text,
      end_time text,
      status text not null default 'Planejada',
      notes text,
      created_at text not null,
      updated_at text not null,
      foreign key(portal_client_id) references portal_client(id) on delete cascade
    );

    create table if not exists financial_account (
      id text primary key,
      company_id text not null,
      name text not null,
      kind text not null,
      currency text not null default 'BRL',
      account_number text,
      branch_number text,
      is_active integer not null default 1,
      created_at text not null,
      updated_at text not null,
      unique(company_id, id),
      foreign key(company_id) references company(id) on delete cascade
    );

    create table if not exists financial_category (
      id text primary key,
      company_id text not null,
      name text not null,
      kind text not null,
      parent_category_id text,
      is_active integer not null default 1,
      created_at text not null,
      updated_at text not null,
      unique(company_id, id),
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(company_id, parent_category_id) references financial_category(company_id, id) on delete restrict
    );

    create table if not exists financial_transaction (
      id text primary key,
      company_id text not null,
      financial_account_id text,
      financial_category_id text,
      kind text not null,
      status text not null,
      amount_cents integer not null,
      issue_date text,
      due_date text,
      settlement_date text,
      competence_date text,
      source text not null default 'manual',
      source_ref text,
      note text,
      created_by text,
      created_at text not null,
      updated_at text not null,
      unique(company_id, id),
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(company_id, financial_account_id) references financial_account(company_id, id) on delete restrict,
      foreign key(company_id, financial_category_id) references financial_category(company_id, id) on delete restrict
    );

    create table if not exists financial_payable (
      id text primary key,
      company_id text not null,
      financial_transaction_id text,
      financial_account_id text,
      financial_category_id text,
      supplier_name text,
      description text not null,
      amount_cents integer not null,
      status text not null,
      issue_date text,
      due_date text,
      paid_at text,
      source text not null default 'manual',
      source_ref text,
      note text,
      created_at text not null,
      updated_at text not null,
      unique(company_id, id),
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(company_id, financial_transaction_id) references financial_transaction(company_id, id) on delete restrict,
      foreign key(company_id, financial_account_id) references financial_account(company_id, id) on delete restrict,
      foreign key(company_id, financial_category_id) references financial_category(company_id, id) on delete restrict
    );

    create table if not exists financial_receivable (
      id text primary key,
      company_id text not null,
      financial_transaction_id text,
      financial_account_id text,
      financial_category_id text,
      customer_name text,
      description text not null,
      amount_cents integer not null,
      status text not null,
      issue_date text,
      due_date text,
      received_at text,
      source text not null default 'manual',
      source_ref text,
      note text,
      created_at text not null,
      updated_at text not null,
      unique(company_id, id),
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(company_id, financial_transaction_id) references financial_transaction(company_id, id) on delete restrict,
      foreign key(company_id, financial_account_id) references financial_account(company_id, id) on delete restrict,
      foreign key(company_id, financial_category_id) references financial_category(company_id, id) on delete restrict
    );

    create table if not exists financial_import_job (
      id text primary key,
      company_id text not null,
      import_type text not null,
      source_file_name text not null,
      source_file_mime_type text,
      source_file_size_bytes integer not null default 0,
      status text not null,
      total_rows integer not null default 0,
      processed_rows integer not null default 0,
      error_rows integer not null default 0,
      error_summary text,
      created_by text,
      created_at text not null,
      updated_at text not null,
      finished_at text,
      unique(company_id, id),
      foreign key(company_id) references company(id) on delete cascade
    );

    create table if not exists financial_bank_statement_entry (
      id text primary key,
      company_id text not null,
      financial_account_id text not null,
      financial_import_job_id text,
      statement_date text not null,
      posted_at text,
      amount_cents integer not null,
      description text not null,
      reference_code text,
      balance_cents integer,
      source text not null default 'bank_import',
      source_ref text,
      created_at text not null,
      updated_at text not null,
      unique(company_id, id),
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(company_id, financial_account_id) references financial_account(company_id, id) on delete restrict,
      foreign key(company_id, financial_import_job_id) references financial_import_job(company_id, id) on delete restrict
    );

    create table if not exists financial_reconciliation_match (
      id text primary key,
      company_id text not null,
      financial_bank_statement_entry_id text not null,
      financial_transaction_id text not null,
      match_type text not null,
      match_status text not null,
      matched_amount_cents integer not null,
      matched_at text not null,
      matched_by text,
      note text,
      created_at text not null,
      updated_at text not null,
      unique(company_id, id),
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(company_id, financial_bank_statement_entry_id) references financial_bank_statement_entry(company_id, id) on delete cascade,
      foreign key(company_id, financial_transaction_id) references financial_transaction(company_id, id) on delete cascade
    );

    create table if not exists financial_debt (
      id text primary key,
      company_id text not null,
      financial_payable_id text,
      financial_receivable_id text,
      financial_transaction_id text,
      debt_type text not null,
      status text not null,
      principal_amount_cents integer not null,
      outstanding_amount_cents integer not null,
      due_date text,
      settled_at text,
      note text,
      created_at text not null,
      updated_at text not null,
      unique(company_id, id),
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(company_id, financial_payable_id) references financial_payable(company_id, id) on delete restrict,
      foreign key(company_id, financial_receivable_id) references financial_receivable(company_id, id) on delete restrict,
      foreign key(company_id, financial_transaction_id) references financial_transaction(company_id, id) on delete restrict
    );

    create table if not exists billing_plan (
      id text primary key,
      company_id text not null,
      code text not null,
      name text not null,
      billing_cycle text not null,
      price_cents integer not null default 0,
      currency text not null default 'BRL',
      is_active integer not null default 1,
      features_json text not null default '[]',
      created_at text not null,
      updated_at text not null,
      unique(company_id, code),
      unique(company_id, id),
      foreign key(company_id) references company(id) on delete cascade
    );

    create table if not exists billing_subscription (
      id text primary key,
      company_id text not null,
      billing_plan_id text not null,
      status text not null,
      started_at text not null,
      current_period_start text,
      current_period_end text,
      trial_ends_at text,
      canceled_at text,
      auto_renew integer not null default 1,
      created_at text not null,
      updated_at text not null,
      unique(company_id, id),
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(company_id, billing_plan_id) references billing_plan(company_id, id) on delete restrict
    );

    create table if not exists billing_invoice (
      id text primary key,
      company_id text not null,
      billing_subscription_id text,
      invoice_number text not null,
      status text not null,
      issue_date text not null,
      due_date text,
      paid_at text,
      amount_cents integer not null,
      currency text not null default 'BRL',
      pdf_url text,
      note text,
      created_at text not null,
      updated_at text not null,
      unique(company_id, invoice_number),
      unique(company_id, id),
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(company_id, billing_subscription_id) references billing_subscription(company_id, id) on delete restrict
    );

    create table if not exists app_setting (
      key text primary key,
      value text not null,
      updated_at text not null
    );

    create table if not exists internal_user (
      id text primary key,
      username text not null unique,
      display_name text,
      password_hash text not null,
      role text not null default 'supremo',
      permissions_json text not null default '[]',
      is_active integer not null default 1,
      last_login_at text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists internal_session (
      id text primary key,
      internal_user_id text not null,
      token_hash text not null unique,
      expires_at text not null,
      created_at text not null,
      last_seen_at text not null,
      foreign key(internal_user_id) references internal_user(id) on delete cascade
    );

    create table if not exists internal_audit_log (
      id text primary key,
      internal_user_id text,
      username text not null,
      action text not null,
      resource_type text not null,
      resource_id text,
      payload_json text not null default '{}',
      created_at text not null,
      foreign key(internal_user_id) references internal_user(id) on delete set null
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
      selected_dates text,
      linked_module_id text,
      hours_scope text not null default 'none',
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

    create table if not exists calendar_activity_day (
      activity_id text not null,
      day_date text not null,
      all_day integer not null default 1,
      start_time text,
      end_time text,
      primary key (activity_id, day_date),
      foreign key(activity_id) references calendar_activity(id) on delete cascade
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
      attachment_file_name text,
      attachment_file_data_base64 text,
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

    create table if not exists hours_event_store (
      id text primary key,
      aggregate_type text not null,
      aggregate_id text not null,
      company_id text not null,
      event_type text not null,
      payload_json text not null,
      idempotency_key text not null,
      actor_type text not null,
      actor_id text,
      correlation_id text,
      occurred_at text not null,
      created_at text not null
    );

    create table if not exists hours_projection_balance (
      company_id text primary key,
      available_hours real not null default 0,
      consumed_hours real not null default 0,
      balance_hours real not null default 0,
      remaining_diarias real not null default 0,
      updated_at text not null
    );

    create table if not exists hours_projection_ledger (
      id text primary key,
      company_id text not null,
      event_id text not null,
      event_type text not null,
      delta_hours real not null default 0,
      balance_after real not null default 0,
      payload_json text not null,
      created_at text not null
    );

    create table if not exists hours_projection_pending (
      id text primary key,
      company_id text not null,
      event_id text not null,
      event_type text not null,
      delta_hours real not null default 0,
      reason text,
      status text not null default 'Pendente',
      payload_json text not null,
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
  ensureColumn('calendar_activity', 'selected_dates', 'selected_dates text');
  ensureColumn('module_template', 'delivery_mode', "delivery_mode text not null default 'ministrado'");
  ensureColumn('module_template', 'client_hours_policy', "client_hours_policy text not null default 'consome'");
  ensureColumn('calendar_activity', 'linked_module_id', 'linked_module_id text');
  ensureColumn('calendar_activity', 'hours_scope', "hours_scope text not null default 'none'");
  ensureColumn('calendar_activity', 'hours_consumed_snapshot', 'hours_consumed_snapshot real not null default 0');
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
  ensureColumn('implementation_kanban_card', 'attachment_file_name', 'attachment_file_name text');
  ensureColumn('implementation_kanban_card', 'attachment_file_data_base64', 'attachment_file_data_base64 text');
  ensureColumn('portal_session', 'is_internal', 'is_internal integer not null default 0');
  ensureColumn('portal_ticket', 'whatsapp_number', 'whatsapp_number text');
  ensureColumn('portal_ticket', 'last_read_cliente_at', 'last_read_cliente_at text');
  ensureColumn('portal_ticket', 'last_read_holand_at', 'last_read_holand_at text');
  ensureColumn('portal_ticket', 'kanban_card_id', 'kanban_card_id text');
  ensureColumn('portal_client', 'support_intro_text', 'support_intro_text text');
  ensureColumn('portal_client', 'hidden_module_ids_json', "hidden_module_ids_json text not null default '[]'");
  ensureColumn('portal_client', 'module_date_overrides_json', "module_date_overrides_json text not null default '{}'");
  ensureColumn('portal_client', 'module_status_overrides_json', "module_status_overrides_json text not null default '{}'");
  ensureColumn('financial_transaction', 'is_deleted', 'is_deleted integer not null default 0');
  ensureColumn('internal_user', 'display_name', 'display_name text');
  ensureColumn('internal_user', 'role', "role text not null default 'supremo'");
  ensureColumn('internal_user', 'permissions_json', "permissions_json text not null default '[]'");
  ensureColumn('internal_user', 'is_active', 'is_active integer not null default 1');
  ensureColumn('internal_user', 'last_login_at', 'last_login_at text');

  db.exec(`
    drop index if exists idx_portal_user_username;
    create index if not exists idx_portal_user_client_active on portal_user(portal_client_id, is_active);
    create index if not exists idx_portal_session_company_expires on portal_session(company_id, expires_at);
    create index if not exists idx_portal_session_client on portal_session(portal_client_id);
    create index if not exists idx_portal_ticket_company_created on portal_ticket(company_id, created_at desc);
    create index if not exists idx_portal_ticket_kanban on portal_ticket(kanban_card_id);
    create index if not exists idx_portal_ticket_message_ticket_created on portal_ticket_message(ticket_id, created_at asc);
    create index if not exists idx_portal_ticket_attachment_message on portal_ticket_attachment(ticket_message_id);
    create index if not exists idx_portal_ticket_webhook_queue_pending
      on portal_ticket_webhook_queue(company_id, recipient_side, sent_at, suppressed_at, available_at, created_at);
    create index if not exists idx_portal_agenda_item_client_date on portal_agenda_item(portal_client_id, start_date, end_date);
    create unique index if not exists idx_hours_event_store_idempotency_key on hours_event_store(idempotency_key);
    create index if not exists idx_internal_session_user on internal_session(internal_user_id);
    create index if not exists idx_internal_session_expires on internal_session(expires_at);
    create index if not exists idx_internal_audit_created on internal_audit_log(created_at desc);
    create index if not exists idx_financial_account_company_active on financial_account(company_id, is_active);
    create index if not exists idx_financial_category_company_parent on financial_category(company_id, parent_category_id);
    create index if not exists idx_financial_transaction_company_status_due on financial_transaction(company_id, status, due_date);
    create index if not exists idx_financial_transaction_company_account on financial_transaction(company_id, financial_account_id);
    create index if not exists idx_financial_transaction_company_category on financial_transaction(company_id, financial_category_id);
    create index if not exists idx_financial_payable_company_status_due on financial_payable(company_id, status, due_date);
    create index if not exists idx_financial_payable_company_transaction on financial_payable(company_id, financial_transaction_id);
    create index if not exists idx_financial_receivable_company_status_due on financial_receivable(company_id, status, due_date);
    create index if not exists idx_financial_receivable_company_transaction on financial_receivable(company_id, financial_transaction_id);
    create index if not exists idx_financial_import_job_company_status on financial_import_job(company_id, status, created_at desc);
    create index if not exists idx_financial_bank_statement_entry_account_date
      on financial_bank_statement_entry(company_id, financial_account_id, statement_date);
    create index if not exists idx_financial_reconciliation_match_entry
      on financial_reconciliation_match(company_id, financial_bank_statement_entry_id, financial_transaction_id);
    create index if not exists idx_financial_debt_company_status_due on financial_debt(company_id, status, due_date);
    create index if not exists idx_financial_debt_payable on financial_debt(company_id, financial_payable_id);
    create index if not exists idx_financial_debt_receivable on financial_debt(company_id, financial_receivable_id);
    create index if not exists idx_billing_plan_company_active on billing_plan(company_id, is_active);
    create index if not exists idx_billing_subscription_company_status on billing_subscription(company_id, status, created_at desc);
    create index if not exists idx_billing_subscription_plan on billing_subscription(company_id, billing_plan_id);
    create index if not exists idx_billing_invoice_company_status_due on billing_invoice(company_id, status, due_date);
    create index if not exists idx_billing_invoice_subscription on billing_invoice(company_id, billing_subscription_id);
  `);

  const internalUserCount = db.prepare('select count(*) as count from internal_user').get() as { count: number };
  if (internalUserCount.count === 0) {
    const nowIso = new Date().toISOString();
    db.prepare(`
      insert into internal_user (
        id, username, display_name, password_hash, role, permissions_json, is_active, last_login_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, 1, null, ?, ?)
    `).run(
      'iuser-supremo-default',
      'holand',
      'Equipe Holand',
      hashInternalPasswordSeed('Holand2026!@#'),
      'supremo',
      JSON.stringify([
        'dashboard',
        'calendar',
        'cohorts',
        'clients',
        'technicians',
        'implementation',
        'support',
        'recruitment',
        'licenses',
        'license_programs',
        'docs',
        'admin'
      ]),
      nowIso,
      nowIso
    );
  }

  db.exec(`
    create trigger if not exists portal_session_tenant_consistency_insert
    before insert on portal_session
    for each row
    when not exists (
      select 1
      from portal_user pu
      join portal_client pc on pc.id = pu.portal_client_id
      where pu.id = new.portal_user_id
        and pu.portal_client_id = new.portal_client_id
        and pc.company_id = new.company_id
    )
    begin
      select raise(abort, 'portal_session tenant mismatch');
    end;

    create trigger if not exists portal_session_tenant_consistency_update
    before update of portal_user_id, portal_client_id, company_id on portal_session
    for each row
    when not exists (
      select 1
      from portal_user pu
      join portal_client pc on pc.id = pu.portal_client_id
      where pu.id = new.portal_user_id
        and pu.portal_client_id = new.portal_client_id
        and pc.company_id = new.company_id
    )
    begin
      select raise(abort, 'portal_session tenant mismatch');
    end;

    create trigger if not exists portal_ticket_tenant_consistency_insert
    before insert on portal_ticket
    for each row
    when not exists (
      select 1
      from portal_user pu
      join portal_client pc on pc.id = pu.portal_client_id
      where pu.id = new.portal_user_id
        and pc.company_id = new.company_id
    )
    begin
      select raise(abort, 'portal_ticket tenant mismatch');
    end;

    create trigger if not exists portal_ticket_tenant_consistency_update
    before update of portal_user_id, company_id on portal_ticket
    for each row
    when not exists (
      select 1
      from portal_user pu
      join portal_client pc on pc.id = pu.portal_client_id
      where pu.id = new.portal_user_id
        and pc.company_id = new.company_id
    )
    begin
      select raise(abort, 'portal_ticket tenant mismatch');
    end;
  `);

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

  const activitiesWithoutDayRows = db.prepare(`
    select ca.id, ca.start_date, ca.end_date, ca.selected_dates, ca.all_day, ca.start_time, ca.end_time
    from calendar_activity ca
    where not exists (
      select 1
      from calendar_activity_day cad
      where cad.activity_id = ca.id
    )
  `).all() as Array<{
    id: string;
    start_date: string;
    end_date: string;
    selected_dates: string | null;
    all_day: number;
    start_time: string | null;
    end_time: string | null;
  }>;
  const insertActivityDay = db.prepare(`
    insert or ignore into calendar_activity_day (activity_id, day_date, all_day, start_time, end_time)
    values (?, ?, ?, ?, ?)
  `);
  activitiesWithoutDayRows.forEach((activity) => {
    const selectedDates = uniqueSortedIsoDates((activity.selected_dates ?? '').split('|'));
    const fallbackDates = iterateIsoDateRange(activity.start_date, activity.end_date || activity.start_date);
    const dates = selectedDates.length > 0 ? selectedDates : fallbackDates;
    const allDay = Number(activity.all_day) === 1 ? 1 : 0;
    const startTime = allDay === 1 ? null : activity.start_time;
    const endTime = allDay === 1 ? null : activity.end_time;
    dates.forEach((dateIso) => {
      insertActivityDay.run(activity.id, dateIso, allDay, startTime, endTime);
    });
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
    delete from portal_ticket_webhook_queue;
    delete from portal_ticket;
    delete from portal_ticket_attachment;
    delete from portal_ticket_message;
    delete from portal_agenda_item;
    delete from portal_session;
    delete from portal_user;
    delete from portal_client;
    delete from calendar_activity_day;
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
