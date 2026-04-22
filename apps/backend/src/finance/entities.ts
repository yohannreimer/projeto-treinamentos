import { db, uuid } from '../db.js';
import type {
  CreateFinanceEntityInput,
  FinanceEntityDto,
  FinanceEntityKind
} from './types.js';

const DEFAULT_ORGANIZATION_ID = 'org-holand';

function resolveOrganizationId(organizationId?: string | null) {
  const normalized = organizationId?.trim();
  return normalized && normalized.length > 0 ? normalized : DEFAULT_ORGANIZATION_ID;
}

function readOrganizationRow(organizationId: string) {
  const row = db.prepare(`
    select id, name
    from organization
    where id = ?
    limit 1
  `).get(organizationId) as { id: string; name: string } | undefined;

  if (!row) {
    throw new Error('Organização não encontrada.');
  }

  return row;
}

function mapEntityRow(row: {
  id: string;
  organization_id: string;
  legal_name: string;
  trade_name: string | null;
  document_number: string | null;
  kind: string;
  email: string | null;
  phone: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}): FinanceEntityDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    legal_name: row.legal_name,
    trade_name: row.trade_name,
    document_number: row.document_number,
    kind: row.kind as FinanceEntityKind,
    email: row.email,
    phone: row.phone,
    is_active: Number(row.is_active) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function listFinanceEntities(
  organizationId: string,
  kind?: FinanceEntityKind | null
): FinanceEntityDto[] {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);

  const rows = db.prepare(`
    select
      id,
      organization_id,
      legal_name,
      trade_name,
      document_number,
      kind,
      email,
      phone,
      is_active,
      created_at,
      updated_at
    from financial_entity
    where organization_id = ?
      and (? is null or kind = ?)
    order by is_active desc, legal_name collate nocase asc, created_at desc
  `).all(normalizedOrganizationId, kind ?? null, kind ?? null) as Array<{
    id: string;
    organization_id: string;
    legal_name: string;
    trade_name: string | null;
    document_number: string | null;
    kind: string;
    email: string | null;
    phone: string | null;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map(mapEntityRow);
}

export function createFinanceEntity(input: CreateFinanceEntityInput): FinanceEntityDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);

  const nowIso = new Date().toISOString();
  const id = uuid('fent');

  db.prepare(`
    insert into financial_entity (
      id,
      organization_id,
      legal_name,
      trade_name,
      document_number,
      kind,
      email,
      phone,
      is_active,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalizedOrganizationId,
    input.legal_name.trim(),
    input.trade_name?.trim() || null,
    input.document_number?.trim() || null,
    input.kind,
    input.email?.trim() || null,
    input.phone?.trim() || null,
    input.is_active === false ? 0 : 1,
    nowIso,
    nowIso
  );

  const created = db.prepare(`
    select
      id,
      organization_id,
      legal_name,
      trade_name,
      document_number,
      kind,
      email,
      phone,
      is_active,
      created_at,
      updated_at
    from financial_entity
    where id = ?
    limit 1
  `).get(id) as
    | {
        id: string;
        organization_id: string;
        legal_name: string;
        trade_name: string | null;
        document_number: string | null;
        kind: string;
        email: string | null;
        phone: string | null;
        is_active: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!created) {
    throw new Error('Falha ao criar entidade financeira.');
  }

  return mapEntityRow(created);
}
