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

function hasCompositeUniqueIndex(table: string, columns: string[]) {
  const indexes = db.prepare(`pragma index_list(${table})`).all() as Array<{
    name: string;
    unique: number;
  }>;

  return indexes.some((index) => {
    if (index.unique !== 1) {
      return false;
    }

    const indexColumns = db.prepare(`pragma index_info(${index.name})`).all() as Array<{
      seqno: number;
      name: string;
    }>;

    const orderedColumns = indexColumns
      .sort((left, right) => left.seqno - right.seqno)
      .map((column) => column.name);

    return orderedColumns.length === columns.length
      && orderedColumns.every((column, position) => column === columns[position]);
  });
}

function readTableColumns(table: string) {
  return db.prepare(`pragma table_info(${table})`).all() as Array<{
    name: string;
    notnull: number;
  }>;
}

function normalizeFinanceText(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function hasColumn(table: string, column: string) {
  return readTableColumns(table).some((item) => item.name === column);
}

function hasForeignKey(table: string, targetTable: string, from: string, to: string) {
  const foreignKeys = db.prepare(`pragma foreign_key_list(${table})`).all() as Array<{
    table: string;
    from: string;
    to: string;
  }>;

  return foreignKeys.some((item) => item.table === targetTable && item.from === from && item.to === to);
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

const DEFAULT_ORGANIZATION_ID = 'org-holand';

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
      organization_id text not null,
      company_id text,
      name text not null,
      kind text not null,
      currency text not null default 'BRL',
      account_number text,
      branch_number text,
      is_active integer not null default 1,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, id),
      unique(company_id, id),
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(organization_id) references organization(id) on delete cascade
    );

    create table if not exists financial_category (
      id text primary key,
      organization_id text not null,
      company_id text,
      name text not null,
      kind text not null,
      parent_category_id text,
      is_active integer not null default 1,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, id),
      unique(company_id, id),
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id, parent_category_id) references financial_category(company_id, id) on delete restrict
    );

    create table if not exists financial_transaction (
      id text primary key,
      organization_id text not null,
      company_id text,
      financial_entity_id text,
      financial_account_id text,
      financial_category_id text,
      financial_cost_center_id text,
      financial_payment_method_id text,
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
      unique(organization_id, id),
      unique(company_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(organization_id, financial_entity_id) references financial_entity(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_account_id) references financial_account(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_category_id) references financial_category(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_cost_center_id) references financial_cost_center(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_payment_method_id) references financial_payment_method(organization_id, id) on delete restrict
    );

    create table if not exists financial_entity (
      id text primary key,
      organization_id text not null,
      legal_name text not null,
      trade_name text,
      document_number text,
      kind text not null check(kind in ('customer', 'supplier', 'both')),
      email text,
      phone text,
      is_active integer not null default 1,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, id),
      foreign key(organization_id) references organization(id) on delete cascade
    );

    create table if not exists financial_entity_tag (
      id text primary key,
      organization_id text not null,
      name text not null,
      normalized_name text not null,
      is_system integer not null default 0,
      is_active integer not null default 1,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, normalized_name),
      unique(organization_id, id),
      foreign key(organization_id) references organization(id) on delete cascade
    );

    create table if not exists financial_entity_tag_map (
      organization_id text not null,
      financial_entity_id text not null,
      financial_entity_tag_id text not null,
      created_at text not null,
      primary key(organization_id, financial_entity_id, financial_entity_tag_id),
      foreign key(organization_id, financial_entity_id) references financial_entity(organization_id, id) on delete cascade,
      foreign key(organization_id, financial_entity_tag_id) references financial_entity_tag(organization_id, id) on delete cascade
    );

    create table if not exists financial_cost_center (
      id text primary key,
      organization_id text not null,
      name text not null,
      code text,
      is_active integer not null default 1,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, id),
      foreign key(organization_id) references organization(id) on delete cascade
    );

    create table if not exists financial_payment_method (
      id text primary key,
      organization_id text not null,
      name text not null,
      kind text not null check(kind in ('cash', 'pix', 'boleto', 'card', 'transfer', 'other')),
      is_active integer not null default 1,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, id),
      foreign key(organization_id) references organization(id) on delete cascade
    );

    create table if not exists financial_entity_default_profile (
      id text primary key,
      organization_id text not null,
      financial_entity_id text not null,
      context text not null check(context in ('payable', 'receivable', 'transaction')),
      financial_category_id text,
      financial_cost_center_id text,
      financial_account_id text,
      financial_payment_method_id text,
      due_rule text,
      competence_rule text,
      recurrence_rule text,
      is_active integer not null default 1,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, financial_entity_id, context),
      foreign key(organization_id, financial_entity_id) references financial_entity(organization_id, id) on delete cascade,
      foreign key(organization_id, financial_category_id) references financial_category(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_cost_center_id) references financial_cost_center(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_account_id) references financial_account(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_payment_method_id) references financial_payment_method(organization_id, id) on delete restrict
    );

    create table if not exists financial_favorite_combination (
      id text primary key,
      organization_id text not null,
      name text not null,
      context text not null default 'any' check(context in ('any', 'payable', 'receivable', 'transaction')),
      financial_category_id text,
      financial_cost_center_id text,
      financial_account_id text,
      financial_payment_method_id text,
      is_active integer not null default 1,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(organization_id, financial_category_id) references financial_category(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_cost_center_id) references financial_cost_center(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_account_id) references financial_account(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_payment_method_id) references financial_payment_method(organization_id, id) on delete restrict
    );

    create table if not exists financial_payable (
      id text primary key,
      organization_id text not null,
      company_id text,
      financial_transaction_id text,
      financial_entity_id text,
      financial_account_id text,
      financial_category_id text,
      financial_cost_center_id text,
      financial_payment_method_id text,
      supplier_name text,
      description text not null,
      amount_cents integer not null,
      paid_amount_cents integer not null default 0,
      status text not null,
      issue_date text,
      due_date text,
      paid_at text,
      source text not null default 'manual',
      source_ref text,
      note text,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, id),
      unique(company_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(organization_id, financial_transaction_id) references financial_transaction(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_entity_id) references financial_entity(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_account_id) references financial_account(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_category_id) references financial_category(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_cost_center_id) references financial_cost_center(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_payment_method_id) references financial_payment_method(organization_id, id) on delete restrict
    );

    create table if not exists financial_receivable (
      id text primary key,
      organization_id text not null,
      company_id text,
      financial_transaction_id text,
      financial_entity_id text,
      financial_account_id text,
      financial_category_id text,
      financial_cost_center_id text,
      financial_payment_method_id text,
      customer_name text,
      description text not null,
      amount_cents integer not null,
      received_amount_cents integer not null default 0,
      status text not null,
      issue_date text,
      due_date text,
      received_at text,
      source text not null default 'manual',
      source_ref text,
      note text,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, id),
      unique(company_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(organization_id, financial_transaction_id) references financial_transaction(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_entity_id) references financial_entity(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_account_id) references financial_account(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_category_id) references financial_category(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_cost_center_id) references financial_cost_center(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_payment_method_id) references financial_payment_method(organization_id, id) on delete restrict
    );

    create table if not exists financial_import_job (
      id text primary key,
      organization_id text not null,
      company_id text,
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
      unique(organization_id, id),
      unique(company_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade
    );

    create table if not exists financial_bank_statement_entry (
      id text primary key,
      organization_id text not null,
      company_id text,
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
      unique(organization_id, id),
      unique(company_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(organization_id, financial_account_id) references financial_account(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_import_job_id) references financial_import_job(organization_id, id) on delete restrict
    );

    create table if not exists financial_reconciliation_match (
      id text primary key,
      organization_id text not null,
      company_id text,
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
      unique(organization_id, id),
      unique(company_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(organization_id, financial_bank_statement_entry_id) references financial_bank_statement_entry(organization_id, id) on delete cascade,
      foreign key(organization_id, financial_transaction_id) references financial_transaction(organization_id, id) on delete cascade
    );

    create table if not exists financial_debt (
      id text primary key,
      organization_id text not null,
      company_id text,
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
      unique(organization_id, id),
      unique(company_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(organization_id, financial_payable_id) references financial_payable(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_receivable_id) references financial_receivable(organization_id, id) on delete restrict,
      foreign key(organization_id, financial_transaction_id) references financial_transaction(organization_id, id) on delete restrict
    );

    create table if not exists financial_operation_audit (
      id text primary key,
      organization_id text not null,
      company_id text,
      resource_type text not null check(resource_type in ('payable', 'receivable')),
      resource_id text not null,
      action text not null,
      amount_cents integer,
      note text,
      created_by text,
      created_at text not null,
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete set null
    );

    create table if not exists financial_recurring_rule (
      id text primary key,
      organization_id text not null,
      company_id text,
      resource_type text not null check(resource_type in ('payable', 'receivable')),
      template_resource_id text not null,
      name text not null,
      frequency text not null default 'monthly' check(frequency in ('monthly')),
      day_of_month integer not null check(day_of_month between 1 and 31),
      start_date text not null,
      end_date text,
      materialization_months integer not null default 3,
      status text not null default 'active' check(status in ('active', 'paused', 'ended')),
      last_materialized_until text,
      created_by text,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade
    );

    create table if not exists financial_automation_rule (
      id text primary key,
      organization_id text not null,
      company_id text,
      name text not null,
      trigger_type text not null,
      conditions_json text not null default '{}',
      action_type text not null,
      action_payload_json text not null default '{}',
      is_active integer not null default 1,
      created_by text,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade
    );

    create table if not exists financial_attachment (
      id text primary key,
      organization_id text not null,
      company_id text,
      resource_type text not null check(resource_type in ('payable', 'receivable', 'transaction', 'reconciliation')),
      resource_id text not null,
      file_name text not null,
      mime_type text not null,
      file_size_bytes integer not null default 0,
      storage_ref text not null,
      created_by text,
      created_at text not null,
      unique(organization_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade
    );

    create table if not exists financial_bank_integration (
      id text primary key,
      organization_id text not null,
      company_id text,
      provider text not null,
      status text not null,
      account_name text,
      last_sync_at text,
      created_by text,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade
    );

    create table if not exists financial_simulation_scenario (
      id text primary key,
      organization_id text not null,
      company_id text,
      name text not null,
      description text,
      start_date text not null,
      end_date text not null,
      starting_balance_cents integer not null default 0,
      created_by text,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade
    );

    create table if not exists financial_simulation_item (
      id text primary key,
      organization_id text not null,
      company_id text,
      financial_simulation_scenario_id text not null,
      source_type text not null check(source_type in ('manual', 'payable', 'receivable', 'transaction')),
      source_id text,
      kind text not null check(kind in ('manual_inflow', 'manual_outflow', 'expected_inflow', 'scheduled_outflow', 'partial_payment')),
      label text not null,
      amount_cents integer not null,
      event_date text not null,
      probability_percent integer not null default 100,
      note text,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(organization_id, financial_simulation_scenario_id) references financial_simulation_scenario(organization_id, id) on delete cascade
    );

    create table if not exists billing_plan (
      id text primary key,
      organization_id text not null,
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
      unique(organization_id, id),
      unique(company_id, code),
      unique(company_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade
    );

    create table if not exists billing_subscription (
      id text primary key,
      organization_id text not null,
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
      unique(organization_id, id),
      unique(company_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(company_id, billing_plan_id) references billing_plan(company_id, id) on delete restrict
    );

    create table if not exists billing_invoice (
      id text primary key,
      organization_id text not null,
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
      unique(organization_id, id),
      unique(company_id, invoice_number),
      unique(company_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(company_id, billing_subscription_id) references billing_subscription(company_id, id) on delete restrict
    );

    create table if not exists app_setting (
      key text primary key,
      value text not null,
      updated_at text not null
    );

    create table if not exists organization (
      id text primary key,
      name text not null unique,
      slug text not null unique,
      is_active integer not null default 1,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists internal_user (
      id text primary key,
      username text not null unique,
      display_name text,
      password_hash text not null,
      role text not null default 'supremo',
      permissions_json text not null default '[]',
      organization_id text references organization(id) on delete set null,
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
  ensureColumn(
    'financial_account',
    'organization_id',
    'organization_id text references organization(id) on delete cascade'
  );
  ensureColumn(
    'financial_category',
    'organization_id',
    'organization_id text references organization(id) on delete cascade'
  );
  ensureColumn(
    'financial_transaction',
    'organization_id',
    'organization_id text references organization(id) on delete cascade'
  );
  ensureColumn(
    'financial_transaction',
    'financial_entity_id',
    'financial_entity_id text'
  );
  ensureColumn('financial_transaction', 'financial_cost_center_id', 'financial_cost_center_id text');
  ensureColumn('financial_transaction', 'financial_payment_method_id', 'financial_payment_method_id text');
  ensureColumn(
    'financial_payable',
    'organization_id',
    'organization_id text references organization(id) on delete cascade'
  );
  ensureColumn('financial_payable', 'financial_cost_center_id', 'financial_cost_center_id text');
  ensureColumn('financial_payable', 'financial_payment_method_id', 'financial_payment_method_id text');
  ensureColumn('financial_payable', 'paid_amount_cents', 'paid_amount_cents integer not null default 0');
  ensureColumn(
    'financial_receivable',
    'organization_id',
    'organization_id text references organization(id) on delete cascade'
  );
  ensureColumn('financial_receivable', 'financial_cost_center_id', 'financial_cost_center_id text');
  ensureColumn('financial_receivable', 'financial_payment_method_id', 'financial_payment_method_id text');
  ensureColumn('financial_receivable', 'received_amount_cents', 'received_amount_cents integer not null default 0');
  ensureColumn(
    'financial_import_job',
    'organization_id',
    'organization_id text references organization(id) on delete cascade'
  );
  ensureColumn(
    'financial_bank_statement_entry',
    'organization_id',
    'organization_id text references organization(id) on delete cascade'
  );
  ensureColumn(
    'financial_reconciliation_match',
    'organization_id',
    'organization_id text references organization(id) on delete cascade'
  );
  ensureColumn(
    'financial_debt',
    'organization_id',
    'organization_id text references organization(id) on delete cascade'
  );
  ensureColumn(
    'billing_plan',
    'organization_id',
    'organization_id text references organization(id) on delete cascade'
  );
  ensureColumn(
    'billing_subscription',
    'organization_id',
    'organization_id text references organization(id) on delete cascade'
  );
  ensureColumn(
    'billing_invoice',
    'organization_id',
    'organization_id text references organization(id) on delete cascade'
  );
  ensureColumn('internal_user', 'display_name', 'display_name text');
  ensureColumn('internal_user', 'role', "role text not null default 'supremo'");
  ensureColumn('internal_user', 'permissions_json', "permissions_json text not null default '[]'");
  ensureColumn(
    'internal_user',
    'organization_id',
    'organization_id text references organization(id) on delete set null'
  );
  ensureColumn('internal_user', 'is_active', 'is_active integer not null default 1');
  ensureColumn('internal_user', 'last_login_at', 'last_login_at text');

  const financialAccountColumns = readTableColumns('financial_account');
  const financialCategoryColumns = readTableColumns('financial_category');
  const financialAccountNeedsRebuild = !hasCompositeUniqueIndex('financial_account', ['organization_id', 'id'])
    || financialAccountColumns.find((column) => column.name === 'company_id')?.notnull === 1;
  const financialCategoryNeedsRebuild = !hasCompositeUniqueIndex('financial_category', ['organization_id', 'id'])
    || financialCategoryColumns.find((column) => column.name === 'company_id')?.notnull === 1;

  if (financialAccountNeedsRebuild || financialCategoryNeedsRebuild) {
    db.exec('pragma foreign_keys = off');
    try {
      if (financialAccountNeedsRebuild) {
        db.exec(`
          create table financial_account_new (
            id text primary key,
            organization_id text not null,
            company_id text,
            name text not null,
            kind text not null,
            currency text not null default 'BRL',
            account_number text,
            branch_number text,
            is_active integer not null default 1,
            created_at text not null,
            updated_at text not null,
            unique(organization_id, id),
            unique(company_id, id),
            foreign key(company_id) references company(id) on delete cascade,
            foreign key(organization_id) references organization(id) on delete cascade
          );
        `);
        db.exec(`
          insert into financial_account_new (
            id,
            organization_id,
            company_id,
            name,
            kind,
            currency,
            account_number,
            branch_number,
            is_active,
            created_at,
            updated_at
          )
          select
            id,
            coalesce(organization_id, '${DEFAULT_ORGANIZATION_ID}'),
            company_id,
            name,
            kind,
            coalesce(currency, 'BRL'),
            account_number,
            branch_number,
            coalesce(is_active, 1),
            created_at,
            updated_at
          from financial_account;
        `);
        db.exec('drop table financial_account;');
        db.exec('alter table financial_account_new rename to financial_account;');
      }

      if (financialCategoryNeedsRebuild) {
        db.exec(`
          create table financial_category_new (
            id text primary key,
            organization_id text not null,
            company_id text,
            name text not null,
            kind text not null,
            parent_category_id text,
            is_active integer not null default 1,
            created_at text not null,
            updated_at text not null,
            unique(organization_id, id),
            unique(company_id, id),
            foreign key(company_id) references company(id) on delete cascade,
            foreign key(organization_id) references organization(id) on delete cascade,
            foreign key(company_id, parent_category_id) references financial_category_new(company_id, id) on delete restrict
          );
        `);
        db.exec(`
          insert into financial_category_new (
            id,
            organization_id,
            company_id,
            name,
            kind,
            parent_category_id,
            is_active,
            created_at,
            updated_at
          )
          select
            id,
            coalesce(organization_id, '${DEFAULT_ORGANIZATION_ID}'),
            company_id,
            name,
            kind,
            parent_category_id,
            coalesce(is_active, 1),
            created_at,
            updated_at
          from financial_category;
        `);
        db.exec('drop table financial_category;');
        db.exec('alter table financial_category_new rename to financial_category;');
      }
    } finally {
      db.exec('pragma foreign_keys = on');
    }
  }

  const transactionColumns = db.prepare('pragma table_info(financial_transaction)').all() as Array<{
    name: string;
    notnull: number;
  }>;
  const transactionForeignKeys = db.prepare('pragma foreign_key_list(financial_transaction)').all() as Array<{
    table: string;
    from: string;
    to: string;
  }>;
  const transactionCompanyIdColumn = transactionColumns.find((column) => column.name === 'company_id');
  const transactionOrganizationIdColumn = transactionColumns.find((column) => column.name === 'organization_id');
  const hasFinancialEntityForeignKey = transactionForeignKeys.some(
    (row) => row.table === 'financial_entity' && row.from === 'organization_id' && row.to === 'organization_id'
  );
  const hasFinancialAccountForeignKey = transactionForeignKeys.some(
    (row) => row.table === 'financial_account' && row.from === 'organization_id' && row.to === 'organization_id'
  );
  const hasFinancialCategoryForeignKey = transactionForeignKeys.some(
    (row) => row.table === 'financial_category' && row.from === 'organization_id' && row.to === 'organization_id'
  );
  const financialTransactionNeedsRebuild = Boolean(
    transactionColumns.length > 0 && (
      !transactionOrganizationIdColumn ||
      transactionCompanyIdColumn?.notnull === 1 ||
      !hasFinancialEntityForeignKey ||
      !hasFinancialAccountForeignKey ||
      !hasFinancialCategoryForeignKey
    )
  );

  if (financialTransactionNeedsRebuild) {
    db.exec('pragma foreign_keys = off');
    try {
      db.exec(`
        create table financial_transaction_new (
          id text primary key,
          organization_id text not null,
          company_id text,
          financial_entity_id text,
          financial_account_id text,
          financial_category_id text,
          financial_cost_center_id text,
          financial_payment_method_id text,
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
          is_deleted integer not null default 0,
          unique(organization_id, id),
          unique(company_id, id),
          foreign key(organization_id) references organization(id) on delete cascade,
          foreign key(company_id) references company(id) on delete cascade,
          foreign key(organization_id, financial_entity_id) references financial_entity(organization_id, id) on delete restrict,
          foreign key(organization_id, financial_account_id) references financial_account(organization_id, id) on delete restrict,
          foreign key(organization_id, financial_category_id) references financial_category(organization_id, id) on delete restrict,
          foreign key(organization_id, financial_cost_center_id) references financial_cost_center(organization_id, id) on delete restrict,
          foreign key(organization_id, financial_payment_method_id) references financial_payment_method(organization_id, id) on delete restrict
        );
      `);
      db.exec(`
        insert into financial_transaction_new (
          id,
          organization_id,
          company_id,
          financial_entity_id,
          financial_account_id,
          financial_category_id,
          financial_cost_center_id,
          financial_payment_method_id,
          kind,
          status,
          amount_cents,
          issue_date,
          due_date,
          settlement_date,
          competence_date,
          source,
          source_ref,
          note,
          created_by,
          created_at,
          updated_at,
          is_deleted
        )
        select
          id,
          organization_id,
          company_id,
          financial_entity_id,
          financial_account_id,
          financial_category_id,
          financial_cost_center_id,
          financial_payment_method_id,
          kind,
          status,
          amount_cents,
          issue_date,
          due_date,
          settlement_date,
          competence_date,
          coalesce(source, 'manual'),
          source_ref,
          note,
          created_by,
          created_at,
          updated_at,
          coalesce(is_deleted, 0)
        from financial_transaction;
      `);
      db.exec('drop table financial_transaction;');
      db.exec('alter table financial_transaction_new rename to financial_transaction;');
    } finally {
      db.exec('pragma foreign_keys = on');
    }
  }

  const payableColumns = readTableColumns('financial_payable');
  const receivableColumns = readTableColumns('financial_receivable');
  const importJobColumns = readTableColumns('financial_import_job');
  const statementEntryColumns = readTableColumns('financial_bank_statement_entry');
  const reconciliationColumns = readTableColumns('financial_reconciliation_match');
  const debtColumns = readTableColumns('financial_debt');

  const financialPayableNeedsRebuild = payableColumns.length > 0 && (
    payableColumns.find((column) => column.name === 'company_id')?.notnull === 1
    || !hasColumn('financial_payable', 'financial_entity_id')
    || !hasForeignKey('financial_payable', 'financial_transaction', 'organization_id', 'organization_id')
    || !hasForeignKey('financial_payable', 'financial_entity', 'organization_id', 'organization_id')
    || !hasForeignKey('financial_payable', 'financial_account', 'organization_id', 'organization_id')
    || !hasForeignKey('financial_payable', 'financial_category', 'organization_id', 'organization_id')
  );

  const financialReceivableNeedsRebuild = receivableColumns.length > 0 && (
    receivableColumns.find((column) => column.name === 'company_id')?.notnull === 1
    || !hasColumn('financial_receivable', 'financial_entity_id')
    || !hasForeignKey('financial_receivable', 'financial_transaction', 'organization_id', 'organization_id')
    || !hasForeignKey('financial_receivable', 'financial_entity', 'organization_id', 'organization_id')
    || !hasForeignKey('financial_receivable', 'financial_account', 'organization_id', 'organization_id')
    || !hasForeignKey('financial_receivable', 'financial_category', 'organization_id', 'organization_id')
  );

  const financialImportJobNeedsRebuild = importJobColumns.length > 0
    && importJobColumns.find((column) => column.name === 'company_id')?.notnull === 1;

  const financialStatementEntryNeedsRebuild = statementEntryColumns.length > 0 && (
    statementEntryColumns.find((column) => column.name === 'company_id')?.notnull === 1
    || !hasForeignKey('financial_bank_statement_entry', 'financial_account', 'organization_id', 'organization_id')
    || !hasForeignKey('financial_bank_statement_entry', 'financial_import_job', 'organization_id', 'organization_id')
  );

  const financialReconciliationNeedsRebuild = reconciliationColumns.length > 0 && (
    reconciliationColumns.find((column) => column.name === 'company_id')?.notnull === 1
    || !hasForeignKey('financial_reconciliation_match', 'organization', 'organization_id', 'id')
    || !hasForeignKey('financial_reconciliation_match', 'financial_bank_statement_entry', 'organization_id', 'organization_id')
    || !hasForeignKey('financial_reconciliation_match', 'financial_transaction', 'organization_id', 'organization_id')
  );

  const financialDebtNeedsRebuild = debtColumns.length > 0 && (
    debtColumns.find((column) => column.name === 'company_id')?.notnull === 1
    || !hasForeignKey('financial_debt', 'organization', 'organization_id', 'id')
    || !hasForeignKey('financial_debt', 'financial_payable', 'organization_id', 'organization_id')
    || !hasForeignKey('financial_debt', 'financial_receivable', 'organization_id', 'organization_id')
    || !hasForeignKey('financial_debt', 'financial_transaction', 'organization_id', 'organization_id')
  );

  if (
    financialPayableNeedsRebuild
    || financialReceivableNeedsRebuild
    || financialImportJobNeedsRebuild
    || financialStatementEntryNeedsRebuild
    || financialReconciliationNeedsRebuild
    || financialDebtNeedsRebuild
  ) {
    db.exec('pragma foreign_keys = off');
    try {
      if (financialPayableNeedsRebuild) {
        db.exec(`
          create table financial_payable_new (
            id text primary key,
            organization_id text not null,
            company_id text,
            financial_transaction_id text,
            financial_entity_id text,
            financial_account_id text,
            financial_category_id text,
            financial_cost_center_id text,
            financial_payment_method_id text,
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
            unique(organization_id, id),
            unique(company_id, id),
            foreign key(organization_id) references organization(id) on delete cascade,
            foreign key(company_id) references company(id) on delete cascade,
            foreign key(organization_id, financial_transaction_id) references financial_transaction(organization_id, id) on delete restrict,
            foreign key(organization_id, financial_entity_id) references financial_entity(organization_id, id) on delete restrict,
            foreign key(organization_id, financial_account_id) references financial_account(organization_id, id) on delete restrict,
            foreign key(organization_id, financial_category_id) references financial_category(organization_id, id) on delete restrict,
            foreign key(organization_id, financial_cost_center_id) references financial_cost_center(organization_id, id) on delete restrict,
            foreign key(organization_id, financial_payment_method_id) references financial_payment_method(organization_id, id) on delete restrict
          );
        `);
        db.exec(`
          insert into financial_payable_new (
            id,
            organization_id,
            company_id,
            financial_transaction_id,
            financial_entity_id,
            financial_account_id,
            financial_category_id,
            financial_cost_center_id,
            financial_payment_method_id,
            supplier_name,
            description,
            amount_cents,
            status,
            issue_date,
            due_date,
            paid_at,
            source,
            source_ref,
            note,
            created_at,
            updated_at
          )
          select
            id,
            coalesce(organization_id, '${DEFAULT_ORGANIZATION_ID}'),
            company_id,
            financial_transaction_id,
            null,
            financial_account_id,
            financial_category_id,
            financial_cost_center_id,
            financial_payment_method_id,
            supplier_name,
            description,
            amount_cents,
            status,
            issue_date,
            due_date,
            paid_at,
            coalesce(source, 'manual'),
            source_ref,
            note,
            created_at,
            updated_at
          from financial_payable;
        `);
        db.exec('drop table financial_payable;');
        db.exec('alter table financial_payable_new rename to financial_payable;');
      }

      if (financialReceivableNeedsRebuild) {
        db.exec(`
          create table financial_receivable_new (
            id text primary key,
            organization_id text not null,
            company_id text,
            financial_transaction_id text,
            financial_entity_id text,
            financial_account_id text,
            financial_category_id text,
            financial_cost_center_id text,
            financial_payment_method_id text,
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
            unique(organization_id, id),
            unique(company_id, id),
            foreign key(organization_id) references organization(id) on delete cascade,
            foreign key(company_id) references company(id) on delete cascade,
            foreign key(organization_id, financial_transaction_id) references financial_transaction(organization_id, id) on delete restrict,
            foreign key(organization_id, financial_entity_id) references financial_entity(organization_id, id) on delete restrict,
            foreign key(organization_id, financial_account_id) references financial_account(organization_id, id) on delete restrict,
            foreign key(organization_id, financial_category_id) references financial_category(organization_id, id) on delete restrict,
            foreign key(organization_id, financial_cost_center_id) references financial_cost_center(organization_id, id) on delete restrict,
            foreign key(organization_id, financial_payment_method_id) references financial_payment_method(organization_id, id) on delete restrict
          );
        `);
        db.exec(`
          insert into financial_receivable_new (
            id,
            organization_id,
            company_id,
            financial_transaction_id,
            financial_entity_id,
            financial_account_id,
            financial_category_id,
            financial_cost_center_id,
            financial_payment_method_id,
            customer_name,
            description,
            amount_cents,
            status,
            issue_date,
            due_date,
            received_at,
            source,
            source_ref,
            note,
            created_at,
            updated_at
          )
          select
            id,
            coalesce(organization_id, '${DEFAULT_ORGANIZATION_ID}'),
            company_id,
            financial_transaction_id,
            null,
            financial_account_id,
            financial_category_id,
            financial_cost_center_id,
            financial_payment_method_id,
            customer_name,
            description,
            amount_cents,
            status,
            issue_date,
            due_date,
            received_at,
            coalesce(source, 'manual'),
            source_ref,
            note,
            created_at,
            updated_at
          from financial_receivable;
        `);
        db.exec('drop table financial_receivable;');
        db.exec('alter table financial_receivable_new rename to financial_receivable;');
      }

      if (financialImportJobNeedsRebuild) {
        db.exec(`
          create table financial_import_job_new (
            id text primary key,
            organization_id text not null,
            company_id text,
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
            unique(organization_id, id),
            unique(company_id, id),
            foreign key(organization_id) references organization(id) on delete cascade,
            foreign key(company_id) references company(id) on delete cascade
          );
        `);
        db.exec(`
          insert into financial_import_job_new (
            id,
            organization_id,
            company_id,
            import_type,
            source_file_name,
            source_file_mime_type,
            source_file_size_bytes,
            status,
            total_rows,
            processed_rows,
            error_rows,
            error_summary,
            created_by,
            created_at,
            updated_at,
            finished_at
          )
          select
            id,
            coalesce(organization_id, '${DEFAULT_ORGANIZATION_ID}'),
            company_id,
            import_type,
            source_file_name,
            source_file_mime_type,
            coalesce(source_file_size_bytes, 0),
            status,
            coalesce(total_rows, 0),
            coalesce(processed_rows, 0),
            coalesce(error_rows, 0),
            error_summary,
            created_by,
            created_at,
            updated_at,
            finished_at
          from financial_import_job;
        `);
        db.exec('drop table financial_import_job;');
        db.exec('alter table financial_import_job_new rename to financial_import_job;');
      }

      if (financialStatementEntryNeedsRebuild) {
        db.exec(`
          create table financial_bank_statement_entry_new (
            id text primary key,
            organization_id text not null,
            company_id text,
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
            unique(organization_id, id),
            unique(company_id, id),
            foreign key(organization_id) references organization(id) on delete cascade,
            foreign key(company_id) references company(id) on delete cascade,
            foreign key(organization_id, financial_account_id) references financial_account(organization_id, id) on delete restrict,
            foreign key(organization_id, financial_import_job_id) references financial_import_job(organization_id, id) on delete restrict
          );
        `);
        db.exec(`
          insert into financial_bank_statement_entry_new (
            id,
            organization_id,
            company_id,
            financial_account_id,
            financial_import_job_id,
            statement_date,
            posted_at,
            amount_cents,
            description,
            reference_code,
            balance_cents,
            source,
            source_ref,
            created_at,
            updated_at
          )
          select
            id,
            coalesce(organization_id, '${DEFAULT_ORGANIZATION_ID}'),
            company_id,
            financial_account_id,
            financial_import_job_id,
            statement_date,
            posted_at,
            amount_cents,
            description,
            reference_code,
            balance_cents,
            coalesce(source, 'bank_import'),
            source_ref,
            created_at,
            updated_at
          from financial_bank_statement_entry;
        `);
        db.exec('drop table financial_bank_statement_entry;');
        db.exec('alter table financial_bank_statement_entry_new rename to financial_bank_statement_entry;');
      }

      if (financialReconciliationNeedsRebuild) {
        db.exec(`
          create table financial_reconciliation_match_new (
            id text primary key,
            organization_id text not null,
            company_id text,
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
            unique(organization_id, id),
            unique(company_id, id),
            foreign key(organization_id) references organization(id) on delete cascade,
            foreign key(company_id) references company(id) on delete cascade,
            foreign key(organization_id, financial_bank_statement_entry_id) references financial_bank_statement_entry(organization_id, id) on delete cascade,
            foreign key(organization_id, financial_transaction_id) references financial_transaction(organization_id, id) on delete cascade
          );
        `);
        db.exec(`
          insert into financial_reconciliation_match_new (
            id,
            organization_id,
            company_id,
            financial_bank_statement_entry_id,
            financial_transaction_id,
            match_type,
            match_status,
            matched_amount_cents,
            matched_at,
            matched_by,
            note,
            created_at,
            updated_at
          )
          select
            id,
            coalesce(organization_id, '${DEFAULT_ORGANIZATION_ID}'),
            company_id,
            financial_bank_statement_entry_id,
            financial_transaction_id,
            match_type,
            match_status,
            matched_amount_cents,
            matched_at,
            matched_by,
            note,
            created_at,
            updated_at
          from financial_reconciliation_match;
        `);
        db.exec('drop table financial_reconciliation_match;');
        db.exec('alter table financial_reconciliation_match_new rename to financial_reconciliation_match;');
      }

      if (financialDebtNeedsRebuild) {
        db.exec(`
          create table financial_debt_new (
            id text primary key,
            organization_id text not null,
            company_id text,
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
            unique(organization_id, id),
            unique(company_id, id),
            foreign key(organization_id) references organization(id) on delete cascade,
            foreign key(company_id) references company(id) on delete cascade,
            foreign key(organization_id, financial_payable_id) references financial_payable(organization_id, id) on delete restrict,
            foreign key(organization_id, financial_receivable_id) references financial_receivable(organization_id, id) on delete restrict,
            foreign key(organization_id, financial_transaction_id) references financial_transaction(organization_id, id) on delete restrict
          );
        `);
        db.exec(`
          insert into financial_debt_new (
            id,
            organization_id,
            company_id,
            financial_payable_id,
            financial_receivable_id,
            financial_transaction_id,
            debt_type,
            status,
            principal_amount_cents,
            outstanding_amount_cents,
            due_date,
            settled_at,
            note,
            created_at,
            updated_at
          )
          select
            id,
            coalesce(organization_id, '${DEFAULT_ORGANIZATION_ID}'),
            company_id,
            financial_payable_id,
            financial_receivable_id,
            financial_transaction_id,
            debt_type,
            status,
            principal_amount_cents,
            outstanding_amount_cents,
            due_date,
            settled_at,
            note,
            created_at,
            updated_at
          from financial_debt;
        `);
        db.exec('drop table financial_debt;');
        db.exec('alter table financial_debt_new rename to financial_debt;');
      }
    } finally {
      db.exec('pragma foreign_keys = on');
    }
  }

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
    create index if not exists idx_financial_account_org_active on financial_account(organization_id, is_active);
    create index if not exists idx_financial_category_org_parent on financial_category(organization_id, parent_category_id);
    create index if not exists idx_financial_transaction_org_status_due on financial_transaction(organization_id, status, due_date);
    create index if not exists idx_financial_transaction_org_account on financial_transaction(organization_id, financial_account_id);
    create index if not exists idx_financial_transaction_org_category on financial_transaction(organization_id, financial_category_id);
    create index if not exists idx_financial_transaction_org_cost_center on financial_transaction(organization_id, financial_cost_center_id);
    create index if not exists idx_financial_payable_org_status_due on financial_payable(organization_id, status, due_date);
    create index if not exists idx_financial_payable_org_transaction on financial_payable(organization_id, financial_transaction_id);
    create index if not exists idx_financial_payable_org_cost_center on financial_payable(organization_id, financial_cost_center_id);
    create index if not exists idx_financial_receivable_org_status_due on financial_receivable(organization_id, status, due_date);
    create index if not exists idx_financial_receivable_org_transaction on financial_receivable(organization_id, financial_transaction_id);
    create index if not exists idx_financial_receivable_org_cost_center on financial_receivable(organization_id, financial_cost_center_id);
    create index if not exists idx_financial_entity_org_kind on financial_entity(organization_id, kind, is_active);
    create index if not exists idx_financial_entity_tag_org_active
      on financial_entity_tag(organization_id, is_active, normalized_name);
    create index if not exists idx_financial_entity_tag_map_entity
      on financial_entity_tag_map(organization_id, financial_entity_id);
    create index if not exists idx_financial_entity_default_profile_entity_context
      on financial_entity_default_profile(organization_id, financial_entity_id, context, is_active);
    create index if not exists idx_financial_favorite_combination_org_context
      on financial_favorite_combination(organization_id, context, is_active, name collate nocase);
    create index if not exists idx_financial_cost_center_org_active on financial_cost_center(organization_id, is_active);
    create index if not exists idx_financial_payment_method_org_kind on financial_payment_method(organization_id, kind, is_active);
    create index if not exists idx_financial_import_job_org_status on financial_import_job(organization_id, status, created_at desc);
    create index if not exists idx_financial_bank_statement_entry_org_account_date
      on financial_bank_statement_entry(organization_id, financial_account_id, statement_date);
    create index if not exists idx_financial_reconciliation_match_org_entry
      on financial_reconciliation_match(organization_id, financial_bank_statement_entry_id, financial_transaction_id);
    create index if not exists idx_financial_debt_org_status_due on financial_debt(organization_id, status, due_date);
    create index if not exists idx_financial_debt_org_payable on financial_debt(organization_id, financial_payable_id);
    create index if not exists idx_financial_debt_org_receivable on financial_debt(organization_id, financial_receivable_id);
    create index if not exists idx_financial_operation_audit_resource
      on financial_operation_audit(organization_id, resource_type, resource_id, created_at desc);
    create index if not exists idx_financial_recurring_rule_org_status
      on financial_recurring_rule(organization_id, status, start_date);
    create index if not exists idx_financial_recurring_rule_template
      on financial_recurring_rule(organization_id, resource_type, template_resource_id);
    create index if not exists idx_financial_automation_rule_org
      on financial_automation_rule(organization_id, is_active, created_at desc);
    create index if not exists idx_financial_attachment_resource
      on financial_attachment(organization_id, resource_type, resource_id, created_at desc);
    create index if not exists idx_financial_bank_integration_org
      on financial_bank_integration(organization_id, status, created_at desc);
    create index if not exists idx_financial_simulation_scenario_org
      on financial_simulation_scenario(organization_id, created_at desc);
    create index if not exists idx_financial_simulation_item_scenario
      on financial_simulation_item(organization_id, financial_simulation_scenario_id, event_date);
    create index if not exists idx_billing_plan_org_active on billing_plan(organization_id, is_active);
    create index if not exists idx_billing_subscription_org_status on billing_subscription(organization_id, status, created_at desc);
    create index if not exists idx_billing_subscription_org_plan on billing_subscription(organization_id, billing_plan_id);
    create index if not exists idx_billing_invoice_org_status_due on billing_invoice(organization_id, status, due_date);
    create index if not exists idx_billing_invoice_org_subscription on billing_invoice(organization_id, billing_subscription_id);
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

  const organizationSeedNowIso = new Date().toISOString();
  db.prepare(`
    insert or ignore into organization (id, name, slug, is_active, created_at, updated_at)
    values ('org-holand', 'Holand', 'holand', 1, ?, ?)
  `).run(organizationSeedNowIso, organizationSeedNowIso);

  const insertEntityTag = db.prepare(`
    insert or ignore into financial_entity_tag (
      id, organization_id, name, normalized_name, is_system, is_active, created_at, updated_at
    ) values (?, ?, ?, ?, 1, 1, ?, ?)
  `);
  [
    ['fetag-funcionario', 'Funcionário'],
    ['fetag-banco', 'Banco'],
    ['fetag-imposto', 'Imposto'],
    ['fetag-software', 'Software'],
    ['fetag-aluguel', 'Aluguel'],
    ['fetag-prestador', 'Prestador'],
    ['fetag-cliente-recorrente', 'Cliente recorrente'],
    ['fetag-fornecedor-critico', 'Fornecedor crítico'],
    ['fetag-comissao', 'Comissão'],
    ['fetag-marketing', 'Marketing'],
    ['fetag-juridico', 'Jurídico']
  ].forEach(([id, name]) => {
    insertEntityTag.run(id, DEFAULT_ORGANIZATION_ID, name, normalizeFinanceText(name), organizationSeedNowIso, organizationSeedNowIso);
  });

  const internalUserCount = db.prepare('select count(*) as count from internal_user').get() as { count: number };
  if (internalUserCount.count === 0) {
    const createdAtIso = new Date().toISOString();
    db.prepare(`
      insert into internal_user (
        id, username, display_name, password_hash, role, permissions_json, organization_id, is_active, last_login_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, 1, null, ?, ?)
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
      DEFAULT_ORGANIZATION_ID,
      createdAtIso,
      createdAtIso
    );
  }

  db.prepare(`
    update internal_user
    set organization_id = coalesce(organization_id, ?)
    where organization_id is null
  `).run(DEFAULT_ORGANIZATION_ID);

  db.prepare(`
    update financial_account
    set organization_id = coalesce(organization_id, ?)
    where organization_id is null
  `).run(DEFAULT_ORGANIZATION_ID);
  db.prepare(`
    update financial_category
    set organization_id = coalesce(organization_id, ?)
    where organization_id is null
  `).run(DEFAULT_ORGANIZATION_ID);
  db.prepare(`
    update financial_transaction
    set organization_id = coalesce(organization_id, ?)
    where organization_id is null
  `).run(DEFAULT_ORGANIZATION_ID);
  db.prepare(`
    update financial_payable
    set organization_id = coalesce(organization_id, ?)
    where organization_id is null
  `).run(DEFAULT_ORGANIZATION_ID);
  db.prepare(`
    update financial_receivable
    set organization_id = coalesce(organization_id, ?)
    where organization_id is null
  `).run(DEFAULT_ORGANIZATION_ID);
  db.prepare(`
    update financial_import_job
    set organization_id = coalesce(organization_id, ?)
    where organization_id is null
  `).run(DEFAULT_ORGANIZATION_ID);
  db.prepare(`
    update financial_bank_statement_entry
    set organization_id = coalesce(organization_id, ?)
    where organization_id is null
  `).run(DEFAULT_ORGANIZATION_ID);
  db.prepare(`
    update financial_reconciliation_match
    set organization_id = coalesce(organization_id, ?)
    where organization_id is null
  `).run(DEFAULT_ORGANIZATION_ID);
  db.prepare(`
    update financial_debt
    set organization_id = coalesce(organization_id, ?)
    where organization_id is null
  `).run(DEFAULT_ORGANIZATION_ID);
  db.prepare(`
    update billing_plan
    set organization_id = coalesce(organization_id, ?)
    where organization_id is null
  `).run(DEFAULT_ORGANIZATION_ID);
  db.prepare(`
    update billing_subscription
    set organization_id = coalesce(organization_id, ?)
    where organization_id is null
  `).run(DEFAULT_ORGANIZATION_ID);
  db.prepare(`
    update billing_invoice
    set organization_id = coalesce(organization_id, ?)
    where organization_id is null
  `).run(DEFAULT_ORGANIZATION_ID);

  db.exec(`
    create trigger if not exists financial_transaction_financial_entity_consistency_insert
    before insert on financial_transaction
    for each row
    when new.financial_entity_id is not null
      and not exists (
        select 1
        from financial_entity fe
        where fe.organization_id = new.organization_id
          and fe.id = new.financial_entity_id
      )
    begin
      select raise(abort, 'financial_transaction financial_entity mismatch');
    end;

    create trigger if not exists financial_transaction_financial_entity_consistency_update
    before update of organization_id, financial_entity_id on financial_transaction
    for each row
    when new.financial_entity_id is not null
      and not exists (
        select 1
        from financial_entity fe
        where fe.organization_id = new.organization_id
          and fe.id = new.financial_entity_id
      )
    begin
      select raise(abort, 'financial_transaction financial_entity mismatch');
    end;

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

function getDateOffsetIso(baseDate: string, offsetDays: number) {
  const value = new Date(`${baseDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function seedFinanceDemoData() {
  const organizationId = DEFAULT_ORGANIZATION_ID;
  const companyId = 'comp-01';
  const createdAt = new Date().toISOString();
  const today = nowDateIso();
  const yesterday = getDateOffsetIso(today, -1);
  const twoDaysAgo = getDateOffsetIso(today, -2);
  const threeDaysAgo = getDateOffsetIso(today, -3);
  const nextWeek = getDateOffsetIso(today, 7);
  const nextTwoWeeks = getDateOffsetIso(today, 14);
  const nextMonth = getDateOffsetIso(today, 30);
  const nextTwoMonths = getDateOffsetIso(today, 60);

  db.prepare(`
    insert or ignore into company (id, name, status, notes, priority)
    values (?, ?, ?, ?, ?)
  `).run(companyId, 'Metal Forte', 'Ativo', 'Cliente base para massa demo do financeiro', 0);

  const insertAccount = db.prepare(`
    insert or ignore into financial_account (
      id, organization_id, company_id, name, kind, currency, account_number, branch_number, is_active, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['facc-itau', 'Banco Itau Operacional', 'bank', '34123-4', '0001'],
    ['facc-caixa', 'Caixa Operacional', 'cash', null, null]
  ].forEach(([id, name, kind, accountNumber, branchNumber]) => {
    insertAccount.run(id, organizationId, companyId, name, kind, 'BRL', accountNumber, branchNumber, 1, createdAt, createdAt);
  });

  const insertCategory = db.prepare(`
    insert or ignore into financial_category (
      id, organization_id, company_id, name, kind, parent_category_id, is_active, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['fcat-servicos', 'Receita de Servicos', 'income'],
    ['fcat-bilheteria', 'Bilheteria', 'income'],
    ['fcat-patrocinio', 'Patrocinio', 'income'],
    ['fcat-impostos', 'Impostos', 'expense'],
    ['fcat-operacional', 'Despesas Operacionais', 'expense'],
    ['fcat-cachê', 'Cache Artistico', 'expense'],
    ['fcat-seguros', 'Seguros', 'expense']
  ].forEach(([id, name, kind]) => {
    insertCategory.run(id, organizationId, companyId, name, kind, null, 1, createdAt, createdAt);
  });

  const insertEntity = db.prepare(`
    insert or ignore into financial_entity (
      id, organization_id, legal_name, trade_name, document_number, kind, email, phone, is_active, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['fent-itau-bba', 'Itau BBA', 'Itau BBA', '12.345.678/0001-00', 'customer', 'contato@itaubba.com', '+55 11 3000-1000'],
    ['fent-joao-silva', 'Joao Silva', 'Joao Silva', '123.456.789-00', 'supplier', 'joao@silva.com', '+55 11 98888-1111'],
    ['fent-estudio-harmonia', 'Estudio Harmonia', 'Estudio Harmonia', '11.222.333/0001-55', 'supplier', 'adm@harmonia.com', '+55 11 98888-2222'],
    ['fent-sympla', 'Sympla', 'Sympla', '19.999.999/0001-99', 'customer', 'financeiro@sympla.com', '+55 31 3000-2000'],
    ['fent-bradesco', 'Bradesco', 'Bradesco Cultural', '60.746.948/0001-12', 'customer', 'cultural@bradesco.com', '+55 11 4000-3000'],
    ['fent-sesc', 'SESC Sao Paulo', 'SESC', '03.791.430/0001-83', 'customer', 'agenda@sescsp.org.br', '+55 11 4000-4000'],
    ['fent-porto', 'Porto Seguro', 'Porto Seguro', '61.198.164/0001-60', 'supplier', 'seguro@porto.com', '+55 11 4000-5000'],
    ['fent-ecad', 'ECAD', 'ECAD', '00.474.973/0001-62', 'supplier', 'ecad@ecad.org.br', '+55 21 4000-6000']
  ].forEach(([id, legalName, tradeName, documentNumber, kind, email, phone]) => {
    insertEntity.run(id, organizationId, legalName, tradeName, documentNumber, kind, email, phone, 1, createdAt, createdAt);
  });

  const insertCostCenter = db.prepare(`
    insert or ignore into financial_cost_center (id, organization_id, name, code, is_active, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['fcc-op', 'Operacao', 'OP'],
    ['fcc-com', 'Comercial', 'COM'],
    ['fcc-fin', 'Financeiro', 'FIN']
  ].forEach(([id, name, code]) => {
    insertCostCenter.run(id, organizationId, name, code, 1, createdAt, createdAt);
  });

  const insertPaymentMethod = db.prepare(`
    insert or ignore into financial_payment_method (id, organization_id, name, kind, is_active, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['fpm-pix', 'PIX', 'pix'],
    ['fpm-boleto', 'Boleto', 'boleto'],
    ['fpm-transfer', 'Transferencia', 'transfer']
  ].forEach(([id, name, kind]) => {
    insertPaymentMethod.run(id, organizationId, name, kind, 1, createdAt, createdAt);
  });

  const insertTransaction = db.prepare(`
    insert or ignore into financial_transaction (
      id, organization_id, company_id, financial_entity_id, financial_account_id, financial_category_id,
      kind, status, amount_cents, issue_date, due_date, settlement_date, competence_date, note, created_at, updated_at, is_deleted
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);
  const transactions = [
    ['ftxn-001', 'fent-itau-bba', 'facc-itau', 'fcat-patrocinio', 'income', 'settled', 15000000, threeDaysAgo, twoDaysAgo, twoDaysAgo, twoDaysAgo, 'Patrocinio Itau BBA'],
    ['ftxn-002', 'fent-joao-silva', 'facc-itau', 'fcat-cachê', 'expense', 'settled', 2500000, threeDaysAgo, yesterday, yesterday, yesterday, 'Cache Maestro Silva'],
    ['ftxn-003', 'fent-estudio-harmonia', 'facc-itau', 'fcat-operacional', 'expense', 'settled', 850000, twoDaysAgo, today, today, today, 'Aluguel Sala de Ensaio'],
    ['ftxn-004', 'fent-sympla', 'facc-itau', 'fcat-bilheteria', 'income', 'open', 4280000, today, nextWeek, null, today, 'Venda de Ingressos — Temporada Verao'],
    ['ftxn-005', 'fent-bradesco', 'facc-itau', 'fcat-patrocinio', 'income', 'planned', 8000000, today, nextMonth, null, nextMonth, 'Patrocinio Bradesco Cultural'],
    ['ftxn-006', 'fent-sesc', 'facc-itau', 'fcat-servicos', 'income', 'settled', 2200000, yesterday, today, today, today, 'Apresentacao SESC Pompeia'],
    ['ftxn-007', 'fent-porto', 'facc-itau', 'fcat-seguros', 'expense', 'open', 680000, today, nextTwoWeeks, null, today, 'Seguro de Instrumentos'],
    ['ftxn-008', 'fent-ecad', 'facc-itau', 'fcat-impostos', 'expense', 'overdue', 420000, yesterday, yesterday, null, yesterday, 'ECAD — Direitos Autorais'],
    ['ftxn-009', null, 'facc-caixa', null, 'expense', 'open', 195000, today, nextWeek, null, today, 'Despesa ainda sem categoria'],
    ['ftxn-010', 'fent-itau-bba', 'facc-itau', 'fcat-servicos', 'income', 'settled', 3000000, twoDaysAgo, yesterday, yesterday, yesterday, 'Receita de consultoria']
  ] as const;
  transactions.forEach((row) => {
    insertTransaction.run(
      row[0],
      organizationId,
      companyId,
      row[1],
      row[2],
      row[3],
      row[4],
      row[5],
      row[6],
      row[7],
      row[8],
      row[9],
      row[10],
      row[11],
      createdAt,
      createdAt
    );
  });

  const insertReceivable = db.prepare(`
    insert or ignore into financial_receivable (
      id, organization_id, company_id, financial_transaction_id, financial_entity_id, financial_account_id, financial_category_id,
      customer_name, description, amount_cents, status, issue_date, due_date, received_at, note, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['frec-001', 'ftxn-004', 'fent-sympla', 'facc-itau', 'fcat-bilheteria', 'Sympla', 'Recebivel bilheteria aberto', 4280000, 'open', today, nextWeek, null, 'Bilheteria em aberto'],
    ['frec-002', 'ftxn-005', 'fent-bradesco', 'facc-itau', 'fcat-patrocinio', 'Bradesco Cultural', 'Patrocinio futuro', 8000000, 'planned', today, nextMonth, null, 'Previsto para proximo mes'],
    ['frec-003', 'ftxn-001', 'fent-itau-bba', 'facc-itau', 'fcat-patrocinio', 'Itau BBA', 'Patrocinio recebido', 15000000, 'received', threeDaysAgo, twoDaysAgo, twoDaysAgo, 'Ja liquidado'],
    ['frec-004', null, 'fent-sesc', 'facc-itau', 'fcat-servicos', 'SESC', 'Recebivel em atraso', 3500000, 'overdue', threeDaysAgo, yesterday, null, 'Cobrar cliente'],
    ['frec-005', null, 'fent-itau-bba', 'facc-itau', 'fcat-servicos', 'Itau BBA', 'Recebimento parcial', 1800000, 'partial', yesterday, nextTwoWeeks, null, 'Falta segunda parcela']
  ].forEach((row) => {
    insertReceivable.run(row[0], organizationId, companyId, row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11], row[12], createdAt, createdAt);
  });

  const insertPayable = db.prepare(`
    insert or ignore into financial_payable (
      id, organization_id, company_id, financial_transaction_id, financial_entity_id, financial_account_id, financial_category_id,
      supplier_name, description, amount_cents, status, issue_date, due_date, paid_at, note, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['fpay-001', 'ftxn-007', 'fent-porto', 'facc-itau', 'fcat-seguros', 'Porto Seguro', 'Seguro mensal', 680000, 'open', today, nextTwoWeeks, null, 'Seguro recorrente'],
    ['fpay-002', 'ftxn-008', 'fent-ecad', 'facc-itau', 'fcat-impostos', 'ECAD', 'Direitos autorais', 420000, 'overdue', threeDaysAgo, yesterday, null, 'Pagamento atrasado'],
    ['fpay-003', 'ftxn-003', 'fent-estudio-harmonia', 'facc-itau', 'fcat-operacional', 'Estudio Harmonia', 'Aluguel sala', 850000, 'paid', twoDaysAgo, today, today, 'Pago hoje'],
    ['fpay-004', null, 'fent-joao-silva', 'facc-itau', 'fcat-cachê', 'Joao Silva', 'Cache vence hoje', 320000, 'open', yesterday, today, null, 'Urgente'],
    ['fpay-005', null, 'fent-estudio-harmonia', 'facc-itau', 'fcat-operacional', 'Estudio Harmonia', 'Pagamento em breve', 8500000, 'planned', today, nextWeek, null, 'Planejado para a proxima semana']
  ].forEach((row) => {
    insertPayable.run(row[0], organizationId, companyId, row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11], row[12], createdAt, createdAt);
  });

  const insertImportJob = db.prepare(`
    insert or ignore into financial_import_job (
      id, organization_id, company_id, import_type, source_file_name, source_file_mime_type, source_file_size_bytes,
      status, total_rows, processed_rows, error_rows, error_summary, created_by, finished_at, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['fimp-001', 'OFX', 'extrato-abril.ofx', 'application/x-ofx', 48012, 'completed', 6, 6, 0, null, `${createdAt}`, `${createdAt}`],
    ['fimp-002', 'CSV', 'extrato-recebiveis.csv', 'text/csv', 21012, 'completed', 3, 3, 0, null, `${createdAt}`, `${createdAt}`]
  ].forEach((row) => {
    insertImportJob.run(row[0], organizationId, companyId, row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], 'seed', row[10], createdAt, createdAt);
  });

  const insertStatementEntry = db.prepare(`
    insert or ignore into financial_bank_statement_entry (
      id, organization_id, company_id, financial_account_id, financial_import_job_id, statement_date, posted_at,
      amount_cents, description, reference_code, balance_cents, source, source_ref, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['fstmt-001', 'facc-itau', 'fimp-001', twoDaysAgo, twoDaysAgo, 15000000, 'Credito patrocinio Itau', 'ITAU001', 15000000, 'ofx', 'linha-1'],
    ['fstmt-002', 'facc-itau', 'fimp-001', yesterday, yesterday, -2500000, 'Pagamento cache Joao Silva', 'ITAU002', 12500000, 'ofx', 'linha-2'],
    ['fstmt-003', 'facc-itau', 'fimp-001', today, today, -850000, 'Pagamento aluguel estudio', 'ITAU003', 11650000, 'ofx', 'linha-3'],
    ['fstmt-004', 'facc-itau', 'fimp-001', today, today, -320000, 'Cache vence hoje', 'ITAU004', 11330000, 'ofx', 'linha-4'],
    ['fstmt-005', 'facc-itau', 'fimp-002', nextWeek, nextWeek, 4280000, 'Recebimento Sympla', 'CSV001', 15610000, 'csv', 'linha-5'],
    ['fstmt-006', 'facc-itau', 'fimp-002', nextWeek, nextWeek, -8500000, 'Pagamento Estudio', 'CSV002', 7110000, 'csv', 'linha-6']
  ].forEach((row) => {
    insertStatementEntry.run(row[0], organizationId, companyId, row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], createdAt, createdAt);
  });

  const insertMatch = db.prepare(`
    insert or ignore into financial_reconciliation_match (
      id, organization_id, company_id, financial_bank_statement_entry_id, financial_transaction_id,
      match_type, match_status, matched_amount_cents, matched_at, matched_by, note, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['fmatch-001', 'fstmt-001', 'ftxn-001', 'seed', 'matched', 15000000, twoDaysAgo, 'seed', 'confidence=0.9800'],
    ['fmatch-002', 'fstmt-002', 'ftxn-002', 'seed', 'matched', 2500000, yesterday, 'seed', 'confidence=0.9600'],
    ['fmatch-003', 'fstmt-003', 'ftxn-003', 'seed', 'matched', 850000, today, 'seed', 'confidence=0.9500']
  ].forEach((row) => {
    insertMatch.run(row[0], organizationId, companyId, row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], createdAt, createdAt);
  });

  const insertDebt = db.prepare(`
    insert or ignore into financial_debt (
      id, organization_id, company_id, financial_payable_id, financial_receivable_id, financial_transaction_id,
      debt_type, status, principal_amount_cents, outstanding_amount_cents, due_date, settled_at, note, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['fdeb-001', 'fpay-002', null, 'ftxn-008', 'tributaria', 'open', 420000, 420000, nextMonth, null, 'ECAD ainda em aberto'],
    ['fdeb-002', null, 'frec-004', null, 'comercial', 'partial', 3500000, 1200000, nextTwoMonths, null, 'Recebivel renegociado']
  ].forEach((row) => {
    insertDebt.run(row[0], organizationId, companyId, row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], createdAt, createdAt);
  });
}

export function seedDb() {
  if (!hasSeed()) {

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

  seedFinanceDemoData();
}

export function clearAllData() {
  db.exec(`
    delete from financial_reconciliation_match;
    delete from financial_bank_statement_entry;
    delete from financial_import_job;
    delete from financial_debt;
    delete from financial_receivable;
    delete from financial_payable;
    delete from financial_transaction;
    delete from financial_entity_default_profile;
    delete from financial_entity_tag_map;
    delete from financial_entity_tag;
    delete from financial_payment_method;
    delete from financial_cost_center;
    delete from financial_category;
    delete from financial_account;
    delete from financial_entity;
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
