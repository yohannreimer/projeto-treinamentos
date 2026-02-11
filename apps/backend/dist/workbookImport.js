import * as XLSX from 'xlsx';
import { clearAllData, db, nowDateIso } from './db.js';
function normalizeText(value) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}
function normalizeKey(value) {
    return normalizeText(value).replace(/[^a-z0-9]/g, '');
}
function slug(value) {
    return normalizeText(value)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'item';
}
function toInt(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value))
        return Math.trunc(value);
    if (typeof value === 'string') {
        const cleaned = value.replace(',', '.').trim();
        const parsed = Number(cleaned);
        if (Number.isFinite(parsed))
            return Math.trunc(parsed);
    }
    return fallback;
}
function toStringValue(value) {
    if (value == null)
        return '';
    if (typeof value === 'string')
        return value.trim();
    return String(value).trim();
}
function pick(row, aliases) {
    const entries = Object.entries(row);
    for (const alias of aliases) {
        const normalizedAlias = normalizeKey(alias);
        for (const [key, value] of entries) {
            if (normalizeKey(key) === normalizedAlias)
                return value;
        }
    }
    return undefined;
}
function parseDate(value) {
    if (value == null || value === '')
        return null;
    if (typeof value === 'number') {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (!parsed)
            return null;
        const mm = String(parsed.m).padStart(2, '0');
        const dd = String(parsed.d).padStart(2, '0');
        return `${parsed.y}-${mm}-${dd}`;
    }
    const text = toStringValue(value);
    if (!text)
        return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text))
        return text;
    const brDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brDate) {
        const [, d, m, y] = brDate;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return null;
}
function normalizeCompanyStatus(value) {
    const text = normalizeText(toStringValue(value));
    if (text.includes('inativ'))
        return 'Inativo';
    return 'Ativo';
}
function normalizeModuleStatus(value) {
    const text = normalizeText(toStringValue(value));
    if (!text)
        return 'Nao_iniciado';
    if (text.includes('conclu'))
        return 'Concluido';
    if (text.includes('execu'))
        return 'Em_execucao';
    if (text.includes('planej'))
        return 'Planejado';
    if (text.includes('nao'))
        return 'Nao_iniciado';
    return 'Nao_iniciado';
}
function normalizeOptionalStatus(value) {
    const text = normalizeText(toStringValue(value));
    if (!text)
        return 'Planejado';
    if (text.includes('conclu'))
        return 'Concluido';
    if (text.includes('execu'))
        return 'Em_execucao';
    return 'Planejado';
}
function normalizeAllocationStatus(value) {
    const text = normalizeText(toStringValue(value));
    if (text.includes('execu'))
        return 'Executado';
    if (text.includes('confirm'))
        return 'Confirmado';
    if (text.includes('cancel'))
        return 'Cancelado';
    return 'Previsto';
}
function normalizeCohortStatus(value) {
    const text = normalizeText(toStringValue(value));
    if (text.includes('confirm'))
        return 'Confirmada';
    if (text.includes('conclu'))
        return 'Concluida';
    if (text.includes('cancel'))
        return 'Cancelada';
    if (text.includes('quorum'))
        return 'Aguardando_quorum';
    return 'Planejada';
}
function isMandatory(value) {
    const text = normalizeText(toStringValue(value));
    if (text.includes('sim') || text.includes('obrig'))
        return 1;
    return 0;
}
function readSheet(workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet)
        return [];
    return XLSX.utils.sheet_to_json(sheet, {
        defval: null,
        raw: true
    });
}
function ensureCompany(name, companyIdsByName) {
    const key = normalizeText(name);
    const existing = companyIdsByName.get(key);
    if (existing)
        return existing;
    const id = `comp-${slug(name)}-${Math.random().toString(36).slice(2, 7)}`;
    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, ?, ?)').run(id, name, 'Ativo', 'Criado automaticamente no import', 0);
    companyIdsByName.set(key, id);
    return id;
}
function ensureTechnician(name, techIdsByName) {
    const key = normalizeText(name);
    const existing = techIdsByName.get(key);
    if (existing)
        return existing;
    const id = `tech-${slug(name)}-${Math.random().toString(36).slice(2, 7)}`;
    db.prepare('insert into technician (id, name, availability_notes) values (?, ?, ?)').run(id, name, null);
    techIdsByName.set(key, id);
    return id;
}
export function importWorkbook(filePath, options = {}) {
    const workbook = XLSX.readFile(filePath, { cellDates: false });
    const journeyRows = readSheet(workbook, 'Jornada_Padrao');
    const clientsRows = readSheet(workbook, 'Clientes');
    const progressRows = readSheet(workbook, 'Progresso_do_Cliente');
    const techRows = readSheet(workbook, 'Tecnicos');
    const cohortRows = readSheet(workbook, 'Turmas');
    const cohortModulesRows = readSheet(workbook, 'Turma_Modulos');
    const allocationRows = readSheet(workbook, 'Alocacao_Turma_Modulo');
    const optionalRows = readSheet(workbook, 'Modulos_Opcionais');
    const optionalProgressRows = readSheet(workbook, 'Progresso_Opcionais');
    const summary = {
        file_path: filePath,
        modules: 0,
        companies: 0,
        technicians: 0,
        cohorts: 0,
        cohort_blocks: 0,
        allocations: 0,
        optionals: 0,
        company_progress_updates: 0,
        optional_progress_updates: 0
    };
    const tx = db.transaction(() => {
        if (options.resetData ?? true) {
            clearAllData();
        }
        const moduleIdsByCode = new Map();
        const companyIdsByName = new Map();
        const techIdsByName = new Map();
        const cohortIdsByCode = new Map();
        const optionalIdsByCode = new Map();
        const upsertModule = db.prepare(`
      insert into module_template (id, code, category, name, description, duration_days, profile, is_mandatory)
      values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(code)
      do update set
        category = excluded.category,
        name = excluded.name,
        description = excluded.description,
        duration_days = excluded.duration_days,
        profile = excluded.profile,
        is_mandatory = excluded.is_mandatory
    `);
        for (const row of journeyRows) {
            const code = toStringValue(pick(row, ['Codigo_Modulo', 'Código_Modulo'])).toUpperCase();
            if (!code)
                continue;
            const id = `mod-${slug(code)}`;
            const category = toStringValue(pick(row, ['Categoria'])) || 'Geral';
            const description = toStringValue(pick(row, ['Descricao', 'Descrição']));
            const name = description.split(' - ').slice(1).join(' - ') || description || code;
            const duration = Math.max(toInt(pick(row, ['Diarias', 'Diárias']), 1), 1);
            const profile = toStringValue(pick(row, ['Perfil'])) || null;
            const mandatory = isMandatory(pick(row, ['Obrigatorio', 'Obrigatório']));
            upsertModule.run(id, code, category, name, description, duration, profile, mandatory);
            moduleIdsByCode.set(code, id);
            summary.modules += 1;
        }
        const mod01Id = moduleIdsByCode.get('MOD-01');
        if (mod01Id) {
            db.prepare('delete from module_prerequisite').run();
            const insertPrereq = db.prepare('insert or ignore into module_prerequisite (module_id, prerequisite_module_id) values (?, ?)');
            for (const [code, id] of moduleIdsByCode.entries()) {
                if (code !== 'MOD-01') {
                    insertPrereq.run(id, mod01Id);
                }
            }
        }
        const upsertCompany = db.prepare(`
      insert into company (id, name, status, notes, priority)
      values (?, ?, ?, ?, ?)
      on conflict(name)
      do update set status = excluded.status, notes = excluded.notes
    `);
        for (const row of clientsRows) {
            const name = toStringValue(pick(row, ['Empresa']));
            if (!name)
                continue;
            const id = `comp-${slug(name)}`;
            const status = normalizeCompanyStatus(pick(row, ['Status']));
            const notes = toStringValue(pick(row, ['Observacoes', 'Observações'])) || null;
            upsertCompany.run(id, name, status, notes, 0);
            companyIdsByName.set(normalizeText(name), id);
            summary.companies += 1;
        }
        const upsertTech = db.prepare(`
      insert into technician (id, name, availability_notes)
      values (?, ?, ?)
      on conflict(id)
      do update set name = excluded.name, availability_notes = excluded.availability_notes
    `);
        const upsertTechSkill = db.prepare('insert or ignore into technician_skill (technician_id, module_id) values (?, ?)');
        for (const row of techRows) {
            const name = toStringValue(pick(row, ['Tecnico', 'Técnico']));
            if (!name)
                continue;
            const id = `tech-${slug(name)}`;
            const notes = toStringValue(pick(row, ['Observacoes', 'Observações'])) || null;
            upsertTech.run(id, name, notes);
            techIdsByName.set(normalizeText(name), id);
            summary.technicians += 1;
            const rawSkills = toStringValue(pick(row, ['Especialidades (codigos modulos separados por virgula)', 'Especialidades']));
            const codes = rawSkills.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
            for (const code of codes) {
                const moduleId = moduleIdsByCode.get(code);
                if (moduleId) {
                    upsertTechSkill.run(id, moduleId);
                }
            }
        }
        const upsertCohort = db.prepare(`
      insert into cohort (id, code, name, start_date, technician_id, status, capacity_companies, notes)
      values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(code)
      do update set
        name = excluded.name,
        start_date = excluded.start_date,
        technician_id = excluded.technician_id,
        status = excluded.status,
        capacity_companies = excluded.capacity_companies,
        notes = excluded.notes
    `);
        for (const row of cohortRows) {
            const code = toStringValue(pick(row, ['ID_Turma'])).toUpperCase();
            if (!code)
                continue;
            const id = `coh-${slug(code)}`;
            const name = toStringValue(pick(row, ['Nome_Turma'])) || code;
            const rawDate = pick(row, ['Data_Inicio', 'Data Início']);
            const startDate = parseDate(rawDate) ?? nowDateIso();
            const techName = toStringValue(pick(row, ['Tecnico', 'Técnico']));
            const techId = techName ? ensureTechnician(techName, techIdsByName) : null;
            const status = normalizeCohortStatus(pick(row, ['Status']));
            const capacity = Math.max(toInt(pick(row, ['Capacidade_empresas']), 6), 1);
            const notes = toStringValue(pick(row, ['Obs', 'Observacoes', 'Observações'])) || null;
            upsertCohort.run(id, code, name, startDate, techId, status, capacity, notes);
            cohortIdsByCode.set(code, id);
            summary.cohorts += 1;
        }
        const upsertBlock = db.prepare(`
      insert into cohort_module_block (id, cohort_id, module_id, order_in_cohort, start_day_offset, duration_days)
      values (?, ?, ?, ?, ?, ?)
      on conflict(cohort_id, order_in_cohort)
      do update set
        module_id = excluded.module_id,
        start_day_offset = excluded.start_day_offset,
        duration_days = excluded.duration_days
    `);
        for (const row of cohortModulesRows) {
            const cohortCode = toStringValue(pick(row, ['ID_Turma'])).toUpperCase();
            const moduleCode = toStringValue(pick(row, ['Codigo_Modulo', 'Código_Modulo'])).toUpperCase();
            const cohortId = cohortIdsByCode.get(cohortCode);
            const moduleId = moduleIdsByCode.get(moduleCode);
            if (!cohortId || !moduleId)
                continue;
            const order = Math.max(toInt(pick(row, ['Ordem_no_Turma', 'Ordem_na_Turma']), 1), 1);
            const start = Math.max(toInt(pick(row, ['Dia_Inicio_na_Turma']), order), 1);
            const duration = Math.max(toInt(pick(row, ['Duracao_dias', 'Duração_dias']), 1), 1);
            const id = `blk-${slug(cohortCode)}-${order}`;
            upsertBlock.run(id, cohortId, moduleId, order, start, duration);
            summary.cohort_blocks += 1;
        }
        const defaultProgress = db.prepare(`
      insert or ignore into company_module_progress (id, company_id, module_id, status, notes, completed_at)
      values (?, ?, ?, 'Nao_iniciado', null, null)
    `);
        for (const companyId of companyIdsByName.values()) {
            for (const moduleId of moduleIdsByCode.values()) {
                defaultProgress.run(`prog-${Math.random().toString(36).slice(2, 12)}`, companyId, moduleId);
            }
        }
        const upsertProgress = db.prepare(`
      insert into company_module_progress (id, company_id, module_id, status, notes, completed_at)
      values (?, ?, ?, ?, ?, ?)
      on conflict(company_id, module_id)
      do update set
        status = excluded.status,
        notes = excluded.notes,
        completed_at = excluded.completed_at
    `);
        for (const row of progressRows) {
            const companyName = toStringValue(pick(row, ['Empresa']));
            const moduleCode = toStringValue(pick(row, ['Codigo_Modulo', 'Código_Modulo'])).toUpperCase();
            if (!companyName || !moduleCode)
                continue;
            const companyId = ensureCompany(companyName, companyIdsByName);
            const moduleId = moduleIdsByCode.get(moduleCode);
            if (!moduleId)
                continue;
            const status = normalizeModuleStatus(pick(row, ['Status']));
            const notes = toStringValue(pick(row, ['Obs'])) || null;
            const completedAt = status === 'Concluido' ? nowDateIso() : null;
            upsertProgress.run(`prog-${Math.random().toString(36).slice(2, 12)}`, companyId, moduleId, status, notes, completedAt);
            summary.company_progress_updates += 1;
        }
        const upsertOptional = db.prepare(`
      insert into optional_module (id, code, category, name, duration_days, profile, notes)
      values (?, ?, ?, ?, ?, ?, ?)
      on conflict(code)
      do update set
        category = excluded.category,
        name = excluded.name,
        duration_days = excluded.duration_days,
        profile = excluded.profile,
        notes = excluded.notes
    `);
        for (const row of optionalRows) {
            const code = toStringValue(pick(row, ['Codigo_Opcional', 'Código_Opcional'])).toUpperCase();
            if (!code)
                continue;
            const id = `opt-${slug(code)}`;
            const category = toStringValue(pick(row, ['Categoria'])) || 'Geral';
            const description = toStringValue(pick(row, ['Descricao', 'Descrição'])) || code;
            const duration = Math.max(toInt(pick(row, ['Diarias', 'Diárias']), 1), 1);
            const profile = toStringValue(pick(row, ['Perfil'])) || null;
            const notes = toStringValue(pick(row, ['Obs'])) || null;
            upsertOptional.run(id, code, category, description, duration, profile, notes);
            optionalIdsByCode.set(code, id);
            summary.optionals += 1;
        }
        const upsertOptionalProgress = db.prepare(`
      insert into company_optional_progress (id, company_id, optional_module_id, status, notes)
      values (?, ?, ?, ?, ?)
      on conflict(company_id, optional_module_id)
      do update set status = excluded.status, notes = excluded.notes
    `);
        for (const row of optionalProgressRows) {
            const companyName = toStringValue(pick(row, ['Empresa']));
            const optionalCode = toStringValue(pick(row, ['Codigo_Opcional', 'Código_Opcional'])).toUpperCase();
            if (!companyName || !optionalCode)
                continue;
            const companyId = ensureCompany(companyName, companyIdsByName);
            const optionalId = optionalIdsByCode.get(optionalCode);
            if (!optionalId)
                continue;
            const status = normalizeOptionalStatus(pick(row, ['Status']));
            const notes = toStringValue(pick(row, ['Obs'])) || null;
            upsertOptionalProgress.run(`optprog-${Math.random().toString(36).slice(2, 12)}`, companyId, optionalId, status, notes);
            summary.optional_progress_updates += 1;
        }
        const upsertAllocation = db.prepare(`
      insert into cohort_allocation (id, cohort_id, company_id, module_id, entry_day, status, notes)
      values (?, ?, ?, ?, ?, ?, ?)
      on conflict(cohort_id, company_id, module_id)
      do update set
        entry_day = excluded.entry_day,
        status = excluded.status,
        notes = excluded.notes
    `);
        for (const row of allocationRows) {
            const cohortCode = toStringValue(pick(row, ['ID_Turma'])).toUpperCase();
            const companyName = toStringValue(pick(row, ['Empresa']));
            const moduleCode = toStringValue(pick(row, ['Codigo_Modulo', 'Código_Modulo'])).toUpperCase();
            if (!cohortCode || !companyName || !moduleCode)
                continue;
            const cohortId = cohortIdsByCode.get(cohortCode);
            const companyId = ensureCompany(companyName, companyIdsByName);
            const moduleId = moduleIdsByCode.get(moduleCode);
            if (!cohortId || !companyId || !moduleId)
                continue;
            const block = db.prepare('select start_day_offset from cohort_module_block where cohort_id = ? and module_id = ?').get(cohortId, moduleId);
            if (!block)
                continue;
            const entryDay = Math.max(toInt(pick(row, ['Dia_Entrada']), block.start_day_offset), block.start_day_offset);
            const status = normalizeAllocationStatus(pick(row, ['Status_participacao', 'Status_participação']));
            const notes = toStringValue(pick(row, ['Obs'])) || null;
            upsertAllocation.run(`all-${Math.random().toString(36).slice(2, 12)}`, cohortId, companyId, moduleId, entryDay, status, notes);
            summary.allocations += 1;
        }
    });
    tx();
    return summary;
}
