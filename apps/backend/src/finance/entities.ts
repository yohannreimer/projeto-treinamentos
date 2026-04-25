import { db, uuid } from '../db.js';
import type {
  CreateFinanceEntityInput,
  CreateFinanceEntityTagInput,
  FinanceEntityDefaultContext,
  FinanceEntityDefaultProfileDto,
  FinanceEntityDuplicateGroupDto,
  FinanceEntityDto,
  FinanceEntityKind,
  FinanceEntityTagDto,
  FinanceEntityWithTagsDto,
  SetFinanceEntityTagsInput,
  UpdateFinanceEntityInput,
  UpsertFinanceEntityDefaultProfileInput
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

function normalizeEntityTagName(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeEntityIdentity(value?: string | null) {
  return (value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeDocumentNumber(value?: string | null) {
  return (value ?? '').replace(/\D+/g, '');
}

function mapEntityTagRow(row: {
  id: string;
  organization_id: string;
  name: string;
  normalized_name: string;
  is_system: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}): FinanceEntityTagDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    normalized_name: row.normalized_name,
    is_system: Number(row.is_system) === 1,
    is_active: Number(row.is_active) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function listTagsForEntity(organizationId: string, entityId: string): FinanceEntityTagDto[] {
  const rows = db.prepare(`
    select
      fet.id,
      fet.organization_id,
      fet.name,
      fet.normalized_name,
      fet.is_system,
      fet.is_active,
      fet.created_at,
      fet.updated_at
    from financial_entity_tag_map fetm
    inner join financial_entity_tag fet
      on fet.organization_id = fetm.organization_id
     and fet.id = fetm.financial_entity_tag_id
    where fetm.organization_id = ?
      and fetm.financial_entity_id = ?
    order by fet.name collate nocase asc
  `).all(organizationId, entityId) as Array<{
    id: string;
    organization_id: string;
    name: string;
    normalized_name: string;
    is_system: number;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map(mapEntityTagRow);
}

export function listFinanceEntities(
  organizationId: string,
  kind?: FinanceEntityKind | null
): FinanceEntityWithTagsDto[] {
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

  return rows.map((row) => ({
    ...mapEntityRow(row),
    tags: listTagsForEntity(normalizedOrganizationId, row.id)
  }));
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

export function updateFinanceEntity(input: UpdateFinanceEntityInput): FinanceEntityWithTagsDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);

  const current = db.prepare(`
    select id, organization_id, legal_name, trade_name, document_number, kind, email, phone, is_active, created_at, updated_at
    from financial_entity
    where organization_id = ? and id = ?
    limit 1
  `).get(normalizedOrganizationId, input.financial_entity_id) as Parameters<typeof mapEntityRow>[0] | undefined;

  if (!current) {
    throw new Error('Entidade financeira não encontrada.');
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    update financial_entity
    set legal_name = ?,
        trade_name = ?,
        document_number = ?,
        kind = ?,
        email = ?,
        phone = ?,
        is_active = ?,
        updated_at = ?
    where organization_id = ? and id = ?
  `).run(
    input.legal_name?.trim() || current.legal_name,
    Object.prototype.hasOwnProperty.call(input, 'trade_name') ? input.trade_name?.trim() || null : current.trade_name,
    Object.prototype.hasOwnProperty.call(input, 'document_number') ? input.document_number?.trim() || null : current.document_number,
    input.kind ?? current.kind,
    Object.prototype.hasOwnProperty.call(input, 'email') ? input.email?.trim() || null : current.email,
    Object.prototype.hasOwnProperty.call(input, 'phone') ? input.phone?.trim() || null : current.phone,
    typeof input.is_active === 'boolean' ? (input.is_active ? 1 : 0) : current.is_active,
    nowIso,
    normalizedOrganizationId,
    input.financial_entity_id
  );

  const updated = db.prepare(`
    select id, organization_id, legal_name, trade_name, document_number, kind, email, phone, is_active, created_at, updated_at
    from financial_entity
    where organization_id = ? and id = ?
    limit 1
  `).get(normalizedOrganizationId, input.financial_entity_id) as Parameters<typeof mapEntityRow>[0] | undefined;

  if (!updated) {
    throw new Error('Falha ao atualizar entidade financeira.');
  }

  return {
    ...mapEntityRow(updated),
    tags: listTagsForEntity(normalizedOrganizationId, input.financial_entity_id)
  };
}

export function listFinanceEntityDuplicateGroups(organizationId: string): FinanceEntityDuplicateGroupDto[] {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  const entities = listFinanceEntities(normalizedOrganizationId);
  const groups = new Map<string, FinanceEntityDuplicateGroupDto>();

  const pushGroup = (
    reason: FinanceEntityDuplicateGroupDto['reason'],
    label: string,
    entity: FinanceEntityWithTagsDto
  ) => {
    if (label.length < 3) {
      return;
    }
    const key = `${reason}:${label}`;
    const current = groups.get(key) ?? {
      id: key,
      reason,
      label,
      entities: []
    };
    current.entities.push(entity);
    groups.set(key, current);
  };

  entities.forEach((entity) => {
    pushGroup('document_number', normalizeDocumentNumber(entity.document_number), entity);
    pushGroup('legal_name', normalizeEntityIdentity(entity.legal_name), entity);
    pushGroup('trade_name', normalizeEntityIdentity(entity.trade_name), entity);
  });

  return [...groups.values()]
    .filter((group) => group.entities.length > 1)
    .sort((left, right) => right.entities.length - left.entities.length || left.label.localeCompare(right.label));
}

export function listFinanceEntityTags(organizationId: string): FinanceEntityTagDto[] {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const rows = db.prepare(`
    select id, organization_id, name, normalized_name, is_system, is_active, created_at, updated_at
    from financial_entity_tag
    where organization_id = ?
    order by is_active desc, name collate nocase asc
  `).all(normalizedOrganizationId) as Array<{
    id: string;
    organization_id: string;
    name: string;
    normalized_name: string;
    is_system: number;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map(mapEntityTagRow);
}

export function createFinanceEntityTag(input: CreateFinanceEntityTagInput): FinanceEntityTagDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const name = input.name.trim();
  const normalizedName = normalizeEntityTagName(name);
  const nowIso = new Date().toISOString();
  const id = uuid('fetag');

  db.prepare(`
    insert or ignore into financial_entity_tag (
      id, organization_id, name, normalized_name, is_system, is_active, created_at, updated_at
    ) values (?, ?, ?, ?, 0, ?, ?, ?)
  `).run(id, normalizedOrganizationId, name, normalizedName, input.is_active === false ? 0 : 1, nowIso, nowIso);

  const created = db.prepare(`
    select id, organization_id, name, normalized_name, is_system, is_active, created_at, updated_at
    from financial_entity_tag
    where organization_id = ? and normalized_name = ?
    limit 1
  `).get(normalizedOrganizationId, normalizedName) as {
    id: string;
    organization_id: string;
    name: string;
    normalized_name: string;
    is_system: number;
    is_active: number;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!created) {
    throw new Error('Falha ao criar classificação da entidade.');
  }

  return mapEntityTagRow(created);
}

export function setFinanceEntityTags(input: SetFinanceEntityTagsInput): FinanceEntityWithTagsDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const entity = db.prepare(`
    select id, organization_id, legal_name, trade_name, document_number, kind, email, phone, is_active, created_at, updated_at
    from financial_entity
    where organization_id = ? and id = ?
    limit 1
  `).get(normalizedOrganizationId, input.financial_entity_id) as Parameters<typeof mapEntityRow>[0] | undefined;

  if (!entity) {
    throw new Error('Entidade financeira não encontrada.');
  }

  const uniqueTagIds = [...new Set(input.tag_ids)];
  const validTagRows = uniqueTagIds.length === 0
    ? []
    : db.prepare(`
      select id from financial_entity_tag
      where organization_id = ?
        and id in (${uniqueTagIds.map(() => '?').join(', ')})
        and is_active = 1
    `).all(normalizedOrganizationId, ...uniqueTagIds) as Array<{ id: string }>;

  if (validTagRows.length !== uniqueTagIds.length) {
    throw new Error('Uma ou mais classificações são inválidas.');
  }

  const nowIso = new Date().toISOString();
  const replaceTags = db.transaction(() => {
    db.prepare(`
      delete from financial_entity_tag_map
      where organization_id = ? and financial_entity_id = ?
    `).run(normalizedOrganizationId, input.financial_entity_id);

    const insert = db.prepare(`
      insert into financial_entity_tag_map (
        organization_id, financial_entity_id, financial_entity_tag_id, created_at
      ) values (?, ?, ?, ?)
    `);

    uniqueTagIds.forEach((tagId) => {
      insert.run(normalizedOrganizationId, input.financial_entity_id, tagId, nowIso);
    });
  });

  replaceTags();

  return {
    ...mapEntityRow(entity),
    tags: listTagsForEntity(normalizedOrganizationId, input.financial_entity_id)
  };
}

function mapEntityDefaultProfileRow(row: {
  id: string;
  organization_id: string;
  financial_entity_id: string;
  context: string;
  financial_category_id: string | null;
  financial_category_name: string | null;
  financial_cost_center_id: string | null;
  financial_cost_center_name: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_payment_method_id: string | null;
  financial_payment_method_name: string | null;
  due_rule: string | null;
  competence_rule: string | null;
  recurrence_rule: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}): FinanceEntityDefaultProfileDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    financial_entity_id: row.financial_entity_id,
    context: row.context as FinanceEntityDefaultContext,
    financial_category_id: row.financial_category_id,
    financial_category_name: row.financial_category_name,
    financial_cost_center_id: row.financial_cost_center_id,
    financial_cost_center_name: row.financial_cost_center_name,
    financial_account_id: row.financial_account_id,
    financial_account_name: row.financial_account_name,
    financial_payment_method_id: row.financial_payment_method_id,
    financial_payment_method_name: row.financial_payment_method_name,
    due_rule: row.due_rule,
    competence_rule: row.competence_rule,
    recurrence_rule: row.recurrence_rule,
    is_active: Number(row.is_active) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function readDefaultProfile(
  organizationId: string,
  entityId: string,
  context: FinanceEntityDefaultContext,
  activeOnly = true
) {
  return db.prepare(`
    select
      fdp.id,
      fdp.organization_id,
      fdp.financial_entity_id,
      fdp.context,
      fdp.financial_category_id,
      fc.name as financial_category_name,
      fdp.financial_cost_center_id,
      fcc.name as financial_cost_center_name,
      fdp.financial_account_id,
      fa.name as financial_account_name,
      fdp.financial_payment_method_id,
      fpm.name as financial_payment_method_name,
      fdp.due_rule,
      fdp.competence_rule,
      fdp.recurrence_rule,
      fdp.is_active,
      fdp.created_at,
      fdp.updated_at
    from financial_entity_default_profile fdp
    left join financial_category fc
      on fc.organization_id = fdp.organization_id and fc.id = fdp.financial_category_id
    left join financial_cost_center fcc
      on fcc.organization_id = fdp.organization_id and fcc.id = fdp.financial_cost_center_id
    left join financial_account fa
      on fa.organization_id = fdp.organization_id and fa.id = fdp.financial_account_id
    left join financial_payment_method fpm
      on fpm.organization_id = fdp.organization_id and fpm.id = fdp.financial_payment_method_id
    where fdp.organization_id = ?
      and fdp.financial_entity_id = ?
      and fdp.context = ?
      and (? = 0 or fdp.is_active = 1)
    limit 1
  `).get(organizationId, entityId, context, activeOnly ? 1 : 0) as Parameters<typeof mapEntityDefaultProfileRow>[0] | undefined;
}

export function getFinanceEntityDefaultProfile(
  organizationId: string,
  entityId: string,
  context: FinanceEntityDefaultContext
): FinanceEntityDefaultProfileDto | null {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const row = readDefaultProfile(normalizedOrganizationId, entityId, context);
  return row ? mapEntityDefaultProfileRow(row) : null;
}

export function upsertFinanceEntityDefaultProfile(
  input: UpsertFinanceEntityDefaultProfileInput
): FinanceEntityDefaultProfileDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const entityExists = db.prepare(`
    select id from financial_entity
    where organization_id = ? and id = ?
    limit 1
  `).get(normalizedOrganizationId, input.financial_entity_id);

  if (!entityExists) {
    throw new Error('Entidade financeira não encontrada.');
  }

  const nowIso = new Date().toISOString();
  const existing = readDefaultProfile(normalizedOrganizationId, input.financial_entity_id, input.context, false);

  if (existing) {
    db.prepare(`
      update financial_entity_default_profile
      set financial_category_id = ?,
          financial_cost_center_id = ?,
          financial_account_id = ?,
          financial_payment_method_id = ?,
          due_rule = ?,
          competence_rule = ?,
          recurrence_rule = ?,
          is_active = ?,
          updated_at = ?
      where id = ? and organization_id = ?
    `).run(
      input.financial_category_id ?? null,
      input.financial_cost_center_id ?? null,
      input.financial_account_id ?? null,
      input.financial_payment_method_id ?? null,
      input.due_rule?.trim() || null,
      input.competence_rule?.trim() || null,
      input.recurrence_rule?.trim() || null,
      input.is_active === false ? 0 : 1,
      nowIso,
      existing.id,
      normalizedOrganizationId
    );
  } else {
    db.prepare(`
      insert into financial_entity_default_profile (
        id, organization_id, financial_entity_id, context, financial_category_id,
        financial_cost_center_id, financial_account_id, financial_payment_method_id,
        due_rule, competence_rule, recurrence_rule, is_active, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid('fedp'),
      normalizedOrganizationId,
      input.financial_entity_id,
      input.context,
      input.financial_category_id ?? null,
      input.financial_cost_center_id ?? null,
      input.financial_account_id ?? null,
      input.financial_payment_method_id ?? null,
      input.due_rule?.trim() || null,
      input.competence_rule?.trim() || null,
      input.recurrence_rule?.trim() || null,
      input.is_active === false ? 0 : 1,
      nowIso,
      nowIso
    );
  }

  const created = readDefaultProfile(normalizedOrganizationId, input.financial_entity_id, input.context, false);
  if (!created) {
    throw new Error('Falha ao salvar perfil padrão da entidade.');
  }
  return mapEntityDefaultProfileRow(created);
}
