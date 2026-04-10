import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import puppeteer from 'puppeteer-core';
import { z } from 'zod';
import { clearAllData, db, nowDateIso, uuid } from './db.js';
import { hashPassword } from './portal/auth.js';
import { importWorkbook } from './workbookImport.js';
import type { AllocationStatus, ModuleProgressStatus } from './types.js';

const INSTALLATION_CODES = ['960001010', 'MOD-01'] as const;
const DEFAULT_WORKBOOK_PATH = '/Users/yohannreimer/Downloads/Planejamento_Jornada_Treinamentos_v3.xlsx';
const DESTRUCTIVE_CONFIRMATION_PHRASE = 'APAGAR_BASE_TOTAL';
const COMPANY_STATUS_VALUES = ['Ativo', 'Inativo', 'Em_treinamento', 'Finalizado'] as const;
const COMPANY_PRIORITY_VALUES = ['Alta', 'Normal', 'Baixa', 'Parado', 'Aguardando_liberacao'] as const;
const COMPANY_MODALITY_VALUES = ['Turma_Online', 'Exclusivo_Online', 'Presencial'] as const;
const COMPANY_RELATION_VALUES = ['Nosso', 'Terceiro'] as const;
const COHORT_PERIOD_VALUES = ['Integral', 'Meio_periodo'] as const;
const COHORT_DELIVERY_MODE_VALUES = ['Online', 'Presencial', 'Hibrida'] as const;
const RECRUITMENT_STAGE_VALUES = ['Triagem', 'Primeira_entrevista', 'Segunda_fase', 'Final'] as const;
const RECRUITMENT_STATUS_VALUES = ['Em_processo', 'Stand_by', 'Aprovado', 'Reprovado', 'Banco_de_talentos'] as const;
const KANBAN_CARD_PRIORITY_VALUES = ['Alta', 'Normal', 'Baixa', 'Critica'] as const;
const KANBAN_SUBCATEGORY_VALUES = ['Pre_vendas', 'Pos_vendas', 'Suporte', 'Implementacao'] as const;
const KANBAN_SUPPORT_HANDOFF_VALUES = ['Conosco', 'Sao_Paulo'] as const;
const CALENDAR_ACTIVITY_TYPE_VALUES = ['Visita_cliente', 'Pre_vendas', 'Pos_vendas', 'Suporte', 'Implementacao', 'Reuniao', 'Outro'] as const;
const CALENDAR_ACTIVITY_STATUS_VALUES = ['Planejada', 'Em_andamento', 'Concluida', 'Cancelada'] as const;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const IMPLEMENTATION_KANBAN_DEFAULT_COLUMNS = [
  { id: 'kcol-todo', title: 'A fazer', color: '#7b8ea8' },
  { id: 'kcol-doing', title: 'Em andamento', color: '#b17613' },
  { id: 'kcol-done', title: 'Concluído', color: '#1c8b61' }
] as const;
const SERVER_FILE_PATH = fileURLToPath(import.meta.url);
const SERVER_DIR = path.dirname(SERVER_FILE_PATH);
const PROJECT_ROOT_FROM_SERVER = path.resolve(SERVER_DIR, '..', '..', '..');
const CERTIFICATE_TEMPLATE_PATH_CANDIDATES = [
  path.resolve(SERVER_DIR, 'templates/certificate_holand.html'),
  path.resolve(PROJECT_ROOT_FROM_SERVER, 'apps/backend/src/templates/certificate_holand.html'),
  path.resolve(process.cwd(), 'apps/backend/src/templates/certificate_holand.html'),
  path.resolve(process.cwd(), 'src/templates/certificate_holand.html'),
  path.resolve(process.cwd(), 'apps/backend/dist/templates/certificate_holand.html')
] as const;
let certificateTemplateCache: string | null = null;
const PDF_BROWSER_PATH_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_BIN,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

const kanbanCardImageSchema = z
  .string()
  .max(3_000_000)
  .refine((value) => value.startsWith('data:image/'), 'Anexo deve ser uma imagem válida em data URL.');

const internalDocumentDataUrlSchema = z
  .string()
  .max(12_000_000)
  .refine((value) => /^data:(application\/pdf|image\/[a-zA-Z0-9.+-]+);base64,/.test(value), 'Arquivo inválido.');

const cohortBlockSchema = z.object({
  module_id: z.string(),
  order_in_cohort: z.number().int().positive(),
  start_day_offset: z.number().int().positive(),
  duration_days: z.number().int().positive()
});

const cohortScheduleDaySchema = z.object({
  day_index: z.number().int().positive(),
  day_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional()
});

const createCohortSchema = z.object({
  code: z.string().min(3),
  name: z.string().min(3),
  start_date: z.string().min(10),
  technician_id: z.string().optional().nullable(),
  status: z.enum(['Planejada', 'Aguardando_quorum', 'Confirmada', 'Concluida', 'Cancelada']).default('Planejada'),
  capacity_companies: z.number().int().positive(),
  period: z.enum(COHORT_PERIOD_VALUES).default('Integral'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  schedule_days: z.array(cohortScheduleDaySchema).optional(),
  delivery_mode: z.enum(COHORT_DELIVERY_MODE_VALUES).default('Online'),
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
  period: z.enum(COHORT_PERIOD_VALUES).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  schedule_days: z.array(cohortScheduleDaySchema).optional(),
  delivery_mode: z.enum(COHORT_DELIVERY_MODE_VALUES).optional(),
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
  period: z.enum(COHORT_PERIOD_VALUES).default('Integral'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  schedule_days: z.array(cohortScheduleDaySchema).optional(),
  blocks: z.array(cohortBlockSchema).min(1),
  exclude_cohort_id: z.string().optional()
});

const cohortParticipantCreateSchema = z.object({
  company_id: z.string().min(1),
  participant_name: z.string().min(3).max(160)
});

const cohortParticipantModulesUpdateSchema = z.object({
  module_ids: z.array(z.string().min(1)).max(200).default([])
});

const licenseCreateSchema = z.object({
  company_id: z.string(),
  program_id: z.string(),
  user_name: z.string().min(1),
  module_list: z.string().min(1).optional(),
  module_ids: z.array(z.string()).optional(),
  license_identifier: z.string().min(1),
  renewal_cycle: z.enum(['Mensal', 'Anual']).default('Mensal'),
  expires_at: z.string().min(10),
  notes: z.string().nullable().optional()
}).superRefine((data, context) => {
  if ((data.module_ids?.length ?? 0) === 0 && !data.module_list?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['module_ids'],
      message: 'Informe ao menos um módulo da licença.'
    });
  }
});

const licenseUpdateSchema = z.object({
  company_id: z.string().optional(),
  program_id: z.string().optional(),
  user_name: z.string().min(1).optional(),
  module_list: z.string().min(1).optional(),
  module_ids: z.array(z.string()).optional(),
  license_identifier: z.string().min(1).optional(),
  renewal_cycle: z.enum(['Mensal', 'Anual']).optional(),
  expires_at: z.string().min(10).optional(),
  notes: z.string().nullable().optional()
});

const kanbanCardCreateSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().nullable().optional(),
  column_id: z.string().min(1),
  client_name: z.string().max(120).nullable().optional(),
  license_name: z.string().max(180).nullable().optional(),
  module_name: z.string().max(180).nullable().optional(),
  technician_id: z.string().nullable().optional(),
  subcategory: z.enum(KANBAN_SUBCATEGORY_VALUES).nullable().optional(),
  support_resolution: z.string().max(2000).nullable().optional(),
  support_third_party_notes: z.string().max(2000).nullable().optional(),
  support_handoff_target: z.enum(KANBAN_SUPPORT_HANDOFF_VALUES).nullable().optional(),
  support_handoff_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.enum(KANBAN_CARD_PRIORITY_VALUES).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  attachment_image_data_url: kanbanCardImageSchema.nullable().optional()
});

const kanbanCardUpdateSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  description: z.string().nullable().optional(),
  column_id: z.string().min(1).optional(),
  position: z.number().int().min(0).optional(),
  client_name: z.string().max(120).nullable().optional(),
  license_name: z.string().max(180).nullable().optional(),
  module_name: z.string().max(180).nullable().optional(),
  technician_id: z.string().nullable().optional(),
  subcategory: z.enum(KANBAN_SUBCATEGORY_VALUES).nullable().optional(),
  support_resolution: z.string().max(2000).nullable().optional(),
  support_third_party_notes: z.string().max(2000).nullable().optional(),
  support_handoff_target: z.enum(KANBAN_SUPPORT_HANDOFF_VALUES).nullable().optional(),
  support_handoff_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.enum(KANBAN_CARD_PRIORITY_VALUES).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  attachment_image_data_url: kanbanCardImageSchema.nullable().optional()
});

const calendarActivityDateScheduleSchema = z.object({
  day_date: z.string().regex(ISO_DATE_REGEX),
  all_day: z.boolean().optional().default(true),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional()
});

const calendarActivityCreateSchema = z.object({
  title: z.string().min(2).max(160),
  activity_type: z.enum(CALENDAR_ACTIVITY_TYPE_VALUES).default('Outro'),
  start_date: z.string().regex(ISO_DATE_REGEX),
  end_date: z.string().regex(ISO_DATE_REGEX).optional(),
  selected_dates: z.array(z.string().regex(ISO_DATE_REGEX)).optional(),
  date_schedules: z.array(calendarActivityDateScheduleSchema).optional(),
  all_day: z.boolean().optional().default(true),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  technician_id: z.string().nullable().optional(),
  technician_ids: z.array(z.string()).optional(),
  company_id: z.string().nullable().optional(),
  status: z.enum(CALENDAR_ACTIVITY_STATUS_VALUES).optional().default('Planejada'),
  notes: z.string().max(2000).nullable().optional()
});

const calendarActivityUpdateSchema = z.object({
  title: z.string().min(2).max(160).optional(),
  activity_type: z.enum(CALENDAR_ACTIVITY_TYPE_VALUES).optional(),
  start_date: z.string().regex(ISO_DATE_REGEX).optional(),
  end_date: z.string().regex(ISO_DATE_REGEX).optional(),
  selected_dates: z.array(z.string().regex(ISO_DATE_REGEX)).optional(),
  date_schedules: z.array(calendarActivityDateScheduleSchema).optional(),
  all_day: z.boolean().optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  technician_id: z.string().nullable().optional(),
  technician_ids: z.array(z.string()).optional(),
  company_id: z.string().nullable().optional(),
  status: z.enum(CALENDAR_ACTIVITY_STATUS_VALUES).optional(),
  notes: z.string().max(2000).nullable().optional()
});

const internalDocumentCreateSchema = z.object({
  title: z.string().min(2).max(180),
  category: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  file_name: z.string().min(1).max(200),
  mime_type: z.string().min(3).max(120),
  file_data_base64: internalDocumentDataUrlSchema
});

const kanbanBoardReorderSchema = z.object({
  columns: z.array(
    z.object({
      column_id: z.string().min(1),
      card_ids: z.array(z.string())
    })
  ).min(1)
});

const kanbanColumnCreateSchema = z.object({
  title: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
});

const kanbanColumnUpdateSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  position: z.number().int().min(0).optional()
});

const kanbanColumnReorderSchema = z.object({
  column_ids: z.array(z.string()).min(1)
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

function activeCompanyModuleIdsInCohort(cohortId: string, companyId: string): string[] {
  const rows = db.prepare(`
    select distinct module_id
    from cohort_allocation
    where cohort_id = ? and company_id = ? and status <> 'Cancelado'
    order by entry_day asc
  `).all(cohortId, companyId) as Array<{ module_id: string }>;
  return rows.map((row) => row.module_id);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readCertificateTemplate(): string {
  if (certificateTemplateCache) {
    return certificateTemplateCache;
  }
  for (const candidatePath of CERTIFICATE_TEMPLATE_PATH_CANDIDATES) {
    if (!fs.existsSync(candidatePath)) continue;
    certificateTemplateCache = fs.readFileSync(candidatePath, 'utf-8');
    return certificateTemplateCache;
  }
  throw new Error('Template de certificado não encontrado.');
}

function resolvePdfBrowserExecutablePath(): string {
  for (const candidatePath of PDF_BROWSER_PATH_CANDIDATES) {
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }
  throw new Error(
    'Navegador para PDF não encontrado. Defina PUPPETEER_EXECUTABLE_PATH ou instale Chromium/Google Chrome no servidor.'
  );
}

async function renderPdfFromHtml(html: string): Promise<Buffer> {
  const executablePath = resolvePdfBrowserExecutablePath();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    await page.evaluate(async () => {
      const fontsReady = (document as any)?.fonts?.ready;
      if (fontsReady) {
        await fontsReady;
      }
    });
    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm'
      }
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

function applyPdfLayoutOverrides(html: string): string {
  const override = `
<style id="pdf-layout-override">
  @page { size: 297mm 210mm !important; margin: 0 !important; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 297mm !important;
    height: 210mm !important;
    background: #EF2F0F !important;
    overflow: hidden !important;
  }
  body {
    display: block !important;
  }
  .cert {
    width: 297mm !important;
    height: 210mm !important;
    box-shadow: none !important;
    margin: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
    position: relative !important;
    background: #1D2830 !important;
  }
  .top-bar,
  .header,
  .hero,
  .arrow-divider {
    flex: 0 0 auto !important;
  }
  .employees-section {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    padding-bottom: 14px !important;
  }
  #employees-grid {
    align-content: start !important;
    gap: 6px !important;
  }
  .footer {
    flex: 0 0 auto !important;
    margin-top: auto !important;
    padding-top: 14px !important;
    padding-bottom: 14px !important;
    margin-bottom: 11mm !important;
  }
  .bottom-strip {
    position: absolute !important;
    left: 0 !important;
    right: 0 !important;
    bottom: -0.4mm !important;
    flex: 0 0 auto !important;
    margin: 0 !important;
    box-shadow: 0 1px 0 #EF2F0F !important;
  }
  .cert::after {
    content: '' !important;
    position: absolute !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    height: 1.4mm !important;
    background: #EF2F0F !important;
    z-index: 5 !important;
    pointer-events: none !important;
  }
  .bottom-strip {
    position: relative !important;
    z-index: 6 !important;
  }
</style>`;

  if (html.includes('</head>')) {
    return html.replace('</head>', `${override}\n</head>`);
  }
  return `${override}\n${html}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function moduleShortLabel(name: string): string {
  return name
    .replace(/^Treinamento\s+/i, '')
    .replace(/^TopSolid'?/i, 'TopSolid')
    .trim();
}

function formatLongDatePtBr(dateIso: string): string {
  const parts = parseIsoDate(dateIso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  return parts.replace(/\s+/g, ' ').trim();
}

function normalizeCertToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 18);
}

function normalizeFileLabelPart(value: string): string {
  const normalized = value
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'Sem nome';
}

function hasDestructiveConfirmation(confirmationPhrase?: string): boolean {
  return confirmationPhrase?.trim() === DESTRUCTIVE_CONFIRMATION_PHRASE;
}

function getConfirmationPhraseFromRequest(req: express.Request): string | undefined {
  const queryPhrase = typeof req.query.confirmation_phrase === 'string'
    ? req.query.confirmation_phrase
    : undefined;
  const headerPhrase = typeof req.headers['x-confirmation-phrase'] === 'string'
    ? req.headers['x-confirmation-phrase']
    : undefined;
  const bodyPhrase = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>).confirmation_phrase
    : undefined;

  return typeof bodyPhrase === 'string'
    ? bodyPhrase
    : queryPhrase ?? headerPhrase;
}

function decodeDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Arquivo inválido.');
  }
  const mimeType = match[1];
  const base64 = match[2];
  return {
    mimeType,
    buffer: Buffer.from(base64, 'base64')
  };
}

function requireDestructiveConfirmation(
  req: express.Request,
  res: express.Response,
  actionLabel: string
): boolean {
  if (hasDestructiveConfirmation(getConfirmationPhraseFromRequest(req))) {
    return true;
  }

  res.status(400).json({
    message: `Confirmação obrigatória ausente para ${actionLabel}. Digite exatamente ${DESTRUCTIVE_CONFIRMATION_PHRASE}.`
  });
  return false;
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '');
}

function normalizeCompanyStatus(status?: string | null): (typeof COMPANY_STATUS_VALUES)[number] {
  const normalized = normalizeToken(status ?? '');
  if (normalized === 'ativo') return 'Ativo';
  if (normalized === 'inativo') return 'Inativo';
  if (normalized === 'em_treinamento') return 'Em_treinamento';
  if (normalized === 'finalizado') return 'Finalizado';
  return 'Em_treinamento';
}

function normalizeCompanyPriorityLevel(level?: string | null): (typeof COMPANY_PRIORITY_VALUES)[number] {
  const normalized = normalizeToken(level ?? '');
  if (normalized === 'alta') return 'Alta';
  if (normalized === 'normal') return 'Normal';
  if (normalized === 'baixa') return 'Baixa';
  if (normalized === 'parado') return 'Parado';
  if (normalized === 'aguardando_liberacao') return 'Aguardando_liberacao';
  return 'Normal';
}

function normalizeCompanyModality(modality?: string | null): (typeof COMPANY_MODALITY_VALUES)[number] {
  const normalized = normalizeToken(modality ?? '');
  if (normalized === 'turma_online') return 'Turma_Online';
  if (normalized === 'exclusivo_online') return 'Exclusivo_Online';
  if (normalized === 'presencial') return 'Presencial';
  return 'Turma_Online';
}

function normalizeCompanyRelation(relation?: string | null): (typeof COMPANY_RELATION_VALUES)[number] {
  const normalized = normalizeToken(relation ?? '');
  if (normalized === 'terceiro') return 'Terceiro';
  if (normalized === 'nosso') return 'Nosso';
  return 'Nosso';
}

function cohortCodeExists(code: string, excludeCohortId?: string): boolean {
  if (!code.trim()) return false;
  if (excludeCohortId) {
    const row = db.prepare(`
      select 1 as ok
      from cohort
      where upper(code) = upper(?) and id <> ?
      limit 1
    `).get(code.trim(), excludeCohortId) as { ok: number } | undefined;
    return Boolean(row?.ok);
  }
  const row = db.prepare(`
    select 1 as ok
    from cohort
    where upper(code) = upper(?)
    limit 1
  `).get(code.trim()) as { ok: number } | undefined;
  return Boolean(row?.ok);
}

function nextAutoCohortCode(): string {
  const rows = db.prepare(`
    select code
    from cohort
    where upper(code) like 'TUR-%'
  `).all() as Array<{ code: string }>;

  let maxNumeric = 0;
  rows.forEach((row) => {
    const match = row.code.toUpperCase().match(/^TUR-(\d+)$/);
    if (!match) return;
    const numeric = Number(match[1]);
    if (Number.isFinite(numeric)) {
      maxNumeric = Math.max(maxNumeric, numeric);
    }
  });

  let next = maxNumeric + 1;
  let candidate = `TUR-${String(next).padStart(3, '0')}`;
  while (cohortCodeExists(candidate)) {
    next += 1;
    candidate = `TUR-${String(next).padStart(3, '0')}`;
  }

  return candidate;
}

function resolveUniqueCohortCode(requestedCode: string, excludeCohortId?: string): string {
  const normalized = requestedCode.trim().toUpperCase();
  if (!cohortCodeExists(normalized, excludeCohortId)) {
    return normalized;
  }

  const turMatch = normalized.match(/^TUR-(\d+)$/);
  if (turMatch) {
    return nextAutoCohortCode();
  }

  let suffix = 2;
  let candidate = `${normalized}-${suffix}`;
  while (cohortCodeExists(candidate, excludeCohortId)) {
    suffix += 1;
    candidate = `${normalized}-${suffix}`;
  }
  return candidate;
}

function normalizeCompanyPriorityScore(priorityLevel: string): number {
  const level = normalizeCompanyPriorityLevel(priorityLevel);
  if (level === 'Alta') return 100;
  if (level === 'Normal') return 70;
  if (level === 'Baixa') return 40;
  if (level === 'Parado') return 10;
  return 0;
}

function priorityLevelFromNumeric(priority: number): (typeof COMPANY_PRIORITY_VALUES)[number] {
  if (priority >= 85) return 'Alta';
  if (priority >= 55) return 'Normal';
  if (priority >= 25) return 'Baixa';
  if (priority >= 10) return 'Parado';
  return 'Aguardando_liberacao';
}

function resolveModuleNamesByIds(moduleIds: string[]): Map<string, string> {
  if (moduleIds.length === 0) {
    return new Map();
  }

  const placeholders = moduleIds.map(() => '?').join(',');
  const rows = db.prepare(`
    select id, name
    from module_template
    where id in (${placeholders})
  `).all(...moduleIds) as Array<{ id: string; name: string }>;

  return new Map(rows.map((row) => [row.id, row.name]));
}

function normalizeLicenseModuleSelection(payload: {
  module_ids?: string[];
  module_list?: string;
}): {
  moduleIds: string[];
  moduleListText: string;
} {
  const rawModuleIds = (payload.module_ids ?? [])
    .map((moduleId) => moduleId.trim())
    .filter(Boolean);
  const uniqueModuleIds = Array.from(new Set(rawModuleIds));

  if (uniqueModuleIds.length > 0) {
    const moduleNameById = resolveModuleNamesByIds(uniqueModuleIds);
    if (moduleNameById.size !== uniqueModuleIds.length) {
      throw new Error('Um ou mais módulos de licença não foram encontrados.');
    }

    const moduleListText = uniqueModuleIds
      .map((moduleId) => moduleNameById.get(moduleId) ?? moduleId)
      .join(' | ');

    return {
      moduleIds: uniqueModuleIds,
      moduleListText
    };
  }

  return {
    moduleIds: [],
    moduleListText: payload.module_list?.trim() ?? ''
  };
}

function syncLicenseModules(licenseId: string, moduleIds: string[]) {
  db.prepare('delete from company_license_module where license_id = ?').run(licenseId);
  if (moduleIds.length === 0) {
    return;
  }

  const insert = db.prepare(`
    insert into company_license_module (license_id, module_id)
    values (?, ?)
  `);
  moduleIds.forEach((moduleId) => {
    insert.run(licenseId, moduleId);
  });
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

function uniqueSortedIsoDates(values?: string[] | null): string[] {
  if (!values || values.length === 0) return [];
  return Array.from(new Set(
    values
      .map((item) => item.trim())
      .filter((item) => ISO_DATE_REGEX.test(item))
  )).sort((a, b) => a.localeCompare(b));
}

function iterateIsoDateRange(startDate: string, endDate: string): string[] {
  const cursor = parseIsoDate(startDate);
  const finish = parseIsoDate(endDate);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(finish.getTime()) || cursor > finish) return [];

  const dates: string[] = [];
  while (cursor <= finish) {
    dates.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

type ActivityDateSchedule = {
  day_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
};

function normalizeActivityDatePayload(args: {
  startDate: string;
  endDate: string;
  selectedDates?: string[] | null;
  dateSchedules?: Array<{ day_date: string; all_day?: boolean; start_time?: string | null; end_time?: string | null }> | null;
  defaultAllDay: boolean;
  defaultStartTime: string | null;
  defaultEndTime: string | null;
}): {
  startDate: string;
  endDate: string;
  selectedDates: string[];
  selectedDatesRaw: string | null;
  dateSchedules: ActivityDateSchedule[];
  summaryAllDay: boolean;
  summaryStartTime: string | null;
  summaryEndTime: string | null;
} {
  const normalizedDateSchedules = (args.dateSchedules ?? [])
    .map((row) => ({
      day_date: row.day_date.trim(),
      all_day: row.all_day ?? true,
      start_time: row.start_time ?? null,
      end_time: row.end_time ?? null
    }))
    .filter((row) => ISO_DATE_REGEX.test(row.day_date))
    .sort((a, b) => a.day_date.localeCompare(b.day_date));
  const scheduleMap = new Map<string, { all_day: boolean; start_time: string | null; end_time: string | null }>();
  normalizedDateSchedules.forEach((row) => {
    scheduleMap.set(row.day_date, {
      all_day: row.all_day,
      start_time: row.start_time,
      end_time: row.end_time
    });
  });

  let selectedDates = uniqueSortedIsoDates(args.selectedDates);
  if (selectedDates.length === 0 && scheduleMap.size > 0) {
    selectedDates = Array.from(scheduleMap.keys()).sort((a, b) => a.localeCompare(b));
  }
  if (selectedDates.length === 0) {
    selectedDates = iterateIsoDateRange(args.startDate, args.endDate);
  }
  if (selectedDates.length === 0) {
    selectedDates = [args.startDate];
  }

  const dateSchedules = selectedDates.map<ActivityDateSchedule>((dateIso) => {
    const schedule = scheduleMap.get(dateIso);
    const allDay = schedule?.all_day ?? args.defaultAllDay;
    const startTime = allDay ? null : (schedule?.start_time ?? args.defaultStartTime ?? null);
    const endTime = allDay ? null : (schedule?.end_time ?? args.defaultEndTime ?? null);
    if (!allDay && startTime && endTime && endTime < startTime) {
      throw new Error(`Hora final não pode ser menor que a hora inicial em ${dateIso}.`);
    }
    return {
      day_date: dateIso,
      all_day: allDay,
      start_time: startTime,
      end_time: endTime
    };
  });

  const summaryAllDay = dateSchedules.every((row) => row.all_day);
  const summaryStartTime = summaryAllDay
    ? null
    : dateSchedules.find((row) => row.start_time)?.start_time ?? null;
  const summaryEndTime = summaryAllDay
    ? null
    : dateSchedules.find((row) => row.end_time)?.end_time ?? null;

  return {
    startDate: selectedDates[0],
    endDate: selectedDates[selectedDates.length - 1],
    selectedDates,
    selectedDatesRaw: selectedDates.join('|'),
    dateSchedules,
    summaryAllDay,
    summaryStartTime,
    summaryEndTime
  };
}

function activityTimeToMinutes(value: string | null): number | null {
  if (!value) return null;
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function activitySlotsOverlap(left: ActivityDateSchedule, right: ActivityDateSchedule): boolean {
  if (left.all_day || right.all_day) return true;
  const leftStart = activityTimeToMinutes(left.start_time);
  const leftEnd = activityTimeToMinutes(left.end_time);
  const rightStart = activityTimeToMinutes(right.start_time);
  const rightEnd = activityTimeToMinutes(right.end_time);
  if (leftStart === null || leftEnd === null || rightStart === null || rightEnd === null) return true;
  if (leftEnd <= leftStart || rightEnd <= rightStart) return true;
  return leftStart < rightEnd && rightStart < leftEnd;
}

function activitySlotLabel(slot: ActivityDateSchedule): string {
  if (slot.all_day) return 'Dia inteiro';
  return `${slot.start_time ?? '--:--'} - ${slot.end_time ?? '--:--'}`;
}

function assertNoActivityTechnicianConflicts(args: {
  technicianIds: string[];
  schedules: ActivityDateSchedule[];
  excludeActivityId?: string;
}): string | null {
  if (args.technicianIds.length === 0 || args.schedules.length === 0) return null;
  const baseSql = `
    select ca.id, ca.title, cad.day_date, cad.all_day, cad.start_time, cad.end_time
    from calendar_activity ca
    join calendar_activity_day cad on cad.activity_id = ca.id
    join calendar_activity_technician cat on cat.activity_id = ca.id
    where cat.technician_id = ?
      and cad.day_date = ?
      and ca.status <> 'Cancelada'
  `;
  const queryWithExclude = db.prepare(`${baseSql} and ca.id <> ?`);
  const queryWithoutExclude = db.prepare(baseSql);

  for (const technicianId of args.technicianIds) {
    for (const schedule of args.schedules) {
      const rows = args.excludeActivityId
        ? queryWithExclude.all(technicianId, schedule.day_date, args.excludeActivityId)
        : queryWithoutExclude.all(technicianId, schedule.day_date);
      const normalizedRows = rows as Array<{
        id: string;
        title: string;
        day_date: string;
        all_day: number;
        start_time: string | null;
        end_time: string | null;
      }>;
      const conflict = normalizedRows.find((row) => activitySlotsOverlap(
        schedule,
        {
          day_date: row.day_date,
          all_day: Number(row.all_day) === 1,
          start_time: row.start_time,
          end_time: row.end_time
        }
      ));
      if (conflict) {
        const dateLabel = parseIsoDate(schedule.day_date).toLocaleDateString('pt-BR');
        const requestedLabel = activitySlotLabel(schedule);
        const existingLabel = activitySlotLabel({
          day_date: conflict.day_date,
          all_day: Number(conflict.all_day) === 1,
          start_time: conflict.start_time,
          end_time: conflict.end_time
        });
        return `Conflito de agenda do técnico em ${dateLabel}: novo horário ${requestedLabel} conflita com "${conflict.title}" (${existingLabel}).`;
      }
    }
  }
  return null;
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
  const totalDays = totalCohortDays(blocks);

  const dates: string[] = [];
  for (let day = 0; day < totalDays; day += 1) {
    dates.push(addBusinessDays(startDate, day));
  }
  return dates;
}

function totalCohortDays(blocks: Array<{ start_day_offset: number; duration_days: number }>): number {
  return blocks.length === 0
    ? 1
    : Math.max(
      1,
      ...blocks.map((block) => block.start_day_offset + block.duration_days - 1)
    );
}

function totalScheduleSlots(
  period: (typeof COHORT_PERIOD_VALUES)[number],
  blocks: Array<{ start_day_offset: number; duration_days: number }>
): number {
  const totalDays = totalCohortDays(blocks);
  return period === 'Meio_periodo' ? totalDays * 2 : totalDays;
}

function normalizeScheduleDays(
  scheduleDays: Array<{ day_index: number; day_date: string; start_time?: string | null; end_time?: string | null }> | undefined,
  totalDays: number
): Array<{ day_index: number; day_date: string; start_time: string | null; end_time: string | null }> | null {
  if (!scheduleDays || scheduleDays.length === 0) return null;
  if (scheduleDays.length !== totalDays) return null;

  const seen = new Set<number>();
  const rows = scheduleDays
    .map((item) => ({
      day_index: Number(item.day_index),
      day_date: item.day_date,
      start_time: item.start_time ?? null,
      end_time: item.end_time ?? null
    }))
    .sort((a, b) => a.day_index - b.day_index);

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!Number.isInteger(row.day_index) || row.day_index < 1) return null;
    if (seen.has(row.day_index)) return null;
    seen.add(row.day_index);
    if (row.day_index !== index + 1) return null;
  }
  return rows;
}

function validateScheduleDays(
  period: (typeof COHORT_PERIOD_VALUES)[number],
  blocks: Array<{ start_day_offset: number; duration_days: number }>,
  scheduleDays: Array<{ day_index: number; day_date: string; start_time?: string | null; end_time?: string | null }> | undefined
): string | null {
  if (!scheduleDays || scheduleDays.length === 0) return null;
  const totalDays = totalScheduleSlots(period, blocks);
  const normalized = normalizeScheduleDays(scheduleDays, totalDays);
  if (!normalized) {
    return `Agenda personalizada inválida. Informe exatamente ${totalDays} ${period === 'Meio_periodo' ? 'encontro(s)' : 'dia(s)'}, com índice sequencial de 1 até ${totalDays}.`;
  }

  if (period === 'Meio_periodo') {
    for (const row of normalized) {
      if (!row.start_time || !row.end_time) {
        return `No dia ${row.day_index}, informe horário inicial e final.`;
      }
      const startMinutes = timeToMinutes(row.start_time);
      const endMinutes = timeToMinutes(row.end_time);
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return `No dia ${row.day_index}, o horário final deve ser maior que o inicial.`;
      }
    }
  }
  return null;
}

function resolveCohortDateSlots(params: {
  startDate: string;
  blocks: Array<{ start_day_offset: number; duration_days: number }>;
  period: (typeof COHORT_PERIOD_VALUES)[number];
  startTime: string | null;
  endTime: string | null;
  scheduleDays?: Array<{ day_index: number; day_date: string; start_time?: string | null; end_time?: string | null }>;
}) {
  const totalDays = totalScheduleSlots(params.period, params.blocks);
  const normalized = normalizeScheduleDays(params.scheduleDays, totalDays);
  if (normalized) {
    return normalized.map((row) => ({
      day_index: row.day_index,
      day_date: row.day_date,
      start_time: row.start_time ?? params.startTime ?? null,
      end_time: row.end_time ?? params.endTime ?? null
    }));
  }

  return Array.from({ length: totalDays }).map((_, index) => ({
    day_index: index + 1,
    day_date: addBusinessDays(params.startDate, index),
    start_time: params.period === 'Meio_periodo' ? params.startTime : null,
    end_time: params.period === 'Meio_periodo' ? params.endTime : null
  }));
}

function syncConfirmedCohortExecutions() {
  const todayIso = nowDateIso();
  const candidates = db.prepare(`
    select
      a.id as allocation_id,
      a.cohort_id,
      a.company_id,
      a.module_id,
      a.entry_day,
      a.status as allocation_status,
      c.start_date,
      c.period,
      coalesce(cmb.duration_days, 1) as duration_days
    from cohort_allocation a
    join cohort c on c.id = a.cohort_id
    left join cohort_module_block cmb on cmb.cohort_id = a.cohort_id and cmb.module_id = a.module_id
    where c.status in ('Confirmada', 'Concluida')
      and a.status in ('Previsto', 'Confirmado', 'Executado')
  `).all() as Array<{
    allocation_id: string;
    cohort_id: string;
    company_id: string;
    module_id: string;
    entry_day: number;
    allocation_status: AllocationStatus;
    start_date: string;
    period: (typeof COHORT_PERIOD_VALUES)[number] | null;
    duration_days: number;
  }>;

  if (candidates.length === 0) return;

  const cohortIds = Array.from(new Set(candidates.map((item) => item.cohort_id)));
  const scheduleByCohortAndIndex = new Map<string, string>();
  if (cohortIds.length > 0) {
    const placeholders = cohortIds.map(() => '?').join(',');
    const scheduleRows = db.prepare(`
      select cohort_id, day_index, day_date
      from cohort_schedule_day
      where cohort_id in (${placeholders})
    `).all(...cohortIds) as Array<{
      cohort_id: string;
      day_index: number;
      day_date: string;
    }>;
    scheduleRows.forEach((row) => {
      scheduleByCohortAndIndex.set(`${row.cohort_id}:${row.day_index}`, row.day_date);
    });
  }

  function resolveSlotDate(candidate: {
    cohort_id: string;
    start_date: string;
  }, slotIndex: number) {
    const scheduled = scheduleByCohortAndIndex.get(`${candidate.cohort_id}:${slotIndex}`);
    if (scheduled) return scheduled;
    return addBusinessDays(candidate.start_date, Math.max(0, slotIndex - 1));
  }

  function progressRank(status: ModuleProgressStatus) {
    if (status === 'Concluido') return 3;
    if (status === 'Em_execucao') return 2;
    if (status === 'Planejado') return 1;
    return 0;
  }

  const markExecuted = db.prepare(`
    update cohort_allocation
    set status = 'Executado',
      executed_at = coalesce(executed_at, ?)
    where id = ?
      and status in ('Previsto', 'Confirmado', 'Executado')
  `);

  const upsertProgress = db.prepare(`
    insert into company_module_progress (id, company_id, module_id, status, completed_at)
    values (?, ?, ?, ?, ?)
    on conflict(company_id, module_id) do update set
      status = excluded.status,
      completed_at = case
        when excluded.status = 'Concluido' then
          case
            when company_module_progress.completed_at is null then excluded.completed_at
            when date(company_module_progress.completed_at) <= date(excluded.completed_at) then excluded.completed_at
            else company_module_progress.completed_at
          end
        else null
      end
  `);

  const moduleProgressStates = new Map<string, {
    company_id: string;
    module_id: string;
    status: ModuleProgressStatus;
    completed_at: string | null;
  }>();

  const tx = db.transaction(() => {
    candidates.forEach((candidate) => {
      const entryDay = Math.max(1, Number(candidate.entry_day || 1));
      const normalizedPeriod = candidate.period ?? 'Integral';
      const startSlot = normalizedPeriod === 'Meio_periodo'
        ? (entryDay * 2) - 1
        : entryDay;
      const totalSlots = Math.max(1, Number(candidate.duration_days || 1)) * (normalizedPeriod === 'Meio_periodo' ? 2 : 1);
      const endSlot = startSlot + totalSlots - 1;

      let completedSlots = 0;
      for (let slotIndex = startSlot; slotIndex <= endSlot; slotIndex += 1) {
        const slotDate = resolveSlotDate(candidate, slotIndex);
        if (slotDate <= todayIso) {
          completedSlots += 1;
        }
      }

      let moduleStatus: ModuleProgressStatus = 'Planejado';
      let completedAt: string | null = null;

      if (completedSlots >= totalSlots) {
        moduleStatus = 'Concluido';
        completedAt = resolveSlotDate(candidate, endSlot);
        markExecuted.run(completedAt, candidate.allocation_id);
      } else if (completedSlots > 0) {
        moduleStatus = 'Em_execucao';
      }

      const mapKey = `${candidate.company_id}:${candidate.module_id}`;
      const current = moduleProgressStates.get(mapKey);
      if (!current) {
        moduleProgressStates.set(mapKey, {
          company_id: candidate.company_id,
          module_id: candidate.module_id,
          status: moduleStatus,
          completed_at: completedAt
        });
        return;
      }

      const nextRank = progressRank(moduleStatus);
      const currentRank = progressRank(current.status);
      if (nextRank > currentRank) {
        moduleProgressStates.set(mapKey, {
          company_id: candidate.company_id,
          module_id: candidate.module_id,
          status: moduleStatus,
          completed_at: completedAt
        });
        return;
      }
      if (nextRank === currentRank && moduleStatus === 'Concluido') {
        const existingDate = current.completed_at ?? '';
        const nextDate = completedAt ?? '';
        if (nextDate > existingDate) {
          moduleProgressStates.set(mapKey, {
            company_id: candidate.company_id,
            module_id: candidate.module_id,
            status: moduleStatus,
            completed_at: completedAt
          });
        }
      }
    });

    moduleProgressStates.forEach((state) => {
      upsertProgress.run(uuid('prog'), state.company_id, state.module_id, state.status, state.completed_at);
    });
  });

  tx();
}

function formatDatePtBr(dateIso: string): string {
  return parseIsoDate(dateIso).toLocaleDateString('pt-BR');
}

function dayDiff(fromIsoDate: string, toIsoDate: string): number {
  const from = parseIsoDate(fromIsoDate).getTime();
  const to = parseIsoDate(toIsoDate).getTime();
  return Math.round((to - from) / 86400000);
}

function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function validateCohortTimeWindow(period: (typeof COHORT_PERIOD_VALUES)[number], startTime?: string | null, endTime?: string | null): string | null {
  if (period !== 'Meio_periodo') return null;
  if (!startTime || !endTime) {
    return 'Para turma de meio período, informe horário inicial e final.';
  }
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) {
    return 'Horário inválido para turma de meio período.';
  }
  if (endMinutes <= startMinutes) {
    return 'Horário final deve ser maior que o horário inicial na turma de meio período.';
  }
  return null;
}

function hasTechnicianPeriodConflict(
  newPeriod: (typeof COHORT_PERIOD_VALUES)[number],
  newStartTime: string | null,
  newEndTime: string | null,
  existingPeriod: (typeof COHORT_PERIOD_VALUES)[number],
  existingStartTime: string | null,
  existingEndTime: string | null
): boolean {
  if (newPeriod !== 'Meio_periodo' || existingPeriod !== 'Meio_periodo') {
    return true;
  }

  const newStartMinutes = timeToMinutes(newStartTime);
  const newEndMinutes = timeToMinutes(newEndTime);
  const existingStartMinutes = timeToMinutes(existingStartTime);
  const existingEndMinutes = timeToMinutes(existingEndTime);
  if (
    newStartMinutes === null || newEndMinutes === null ||
    existingStartMinutes === null || existingEndMinutes === null
  ) {
    return true;
  }

  return newStartMinutes < existingEndMinutes && existingStartMinutes < newEndMinutes;
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
  period: (typeof COHORT_PERIOD_VALUES)[number];
  startTime: string | null;
  endTime: string | null;
  scheduleDays?: Array<{ day_index: number; day_date: string; start_time?: string | null; end_time?: string | null }>;
  blocks: Array<{ start_day_offset: number; duration_days: number }>;
  excludeCohortId?: string;
}): { id: string; code: string; name: string; conflictDate: string } | null {
  const rows = params.excludeCohortId
    ? db.prepare(`
      select id, code, name, start_date, period, start_time, end_time
      from cohort
      where technician_id = ?
        and status <> 'Cancelada'
        and id <> ?
      order by date(start_date) asc
    `).all(params.technicianId, params.excludeCohortId)
    : db.prepare(`
      select id, code, name, start_date, period, start_time, end_time
      from cohort
      where technician_id = ?
        and status <> 'Cancelada'
      order by date(start_date) asc
    `).all(params.technicianId);

  const candidateCohorts = rows as Array<{
    id: string;
    code: string;
    name: string;
    start_date: string;
    period: (typeof COHORT_PERIOD_VALUES)[number] | null;
    start_time: string | null;
    end_time: string | null;
  }>;
  const newSlots = resolveCohortDateSlots({
    startDate: params.startDate,
    blocks: params.blocks,
    period: params.period,
    startTime: params.startTime,
    endTime: params.endTime,
    scheduleDays: params.scheduleDays
  });
  const newSlotByDate = new Map(newSlots.map((slot) => [slot.day_date, slot]));
  const selectBlocks = db.prepare(`
    select start_day_offset, duration_days
    from cohort_module_block
    where cohort_id = ?
    order by order_in_cohort asc
  `);
  const selectScheduleDays = db.prepare(`
    select day_index, day_date, start_time, end_time
    from cohort_schedule_day
    where cohort_id = ?
    order by day_index asc
  `);

  for (const cohort of candidateCohorts) {
    const existingBlocks = selectBlocks.all(cohort.id) as Array<{ start_day_offset: number; duration_days: number }>;
    const existingScheduleDays = selectScheduleDays.all(cohort.id) as Array<{
      day_index: number;
      day_date: string;
      start_time: string | null;
      end_time: string | null;
    }>;
    const existingSlots = resolveCohortDateSlots({
      startDate: cohort.start_date,
      blocks: existingBlocks,
      period: cohort.period ?? 'Integral',
      startTime: cohort.start_time ?? null,
      endTime: cohort.end_time ?? null,
      scheduleDays: existingScheduleDays
    });
    const overlapDates = existingSlots
      .map((slot) => slot.day_date)
      .filter((dateIso) => newSlotByDate.has(dateIso));
    if (overlapDates.length === 0) {
      continue;
    }

    for (const overlapDate of overlapDates) {
      const newSlot = newSlotByDate.get(overlapDate);
      const existingSlot = existingSlots.find((slot) => slot.day_date === overlapDate);
      if (!newSlot || !existingSlot) continue;

      const hasPeriodConflict = hasTechnicianPeriodConflict(
        params.period,
        newSlot.start_time,
        newSlot.end_time,
        cohort.period ?? 'Integral',
        existingSlot.start_time,
        existingSlot.end_time
      );

      if (hasPeriodConflict) {
        return {
          id: cohort.id,
          code: cohort.code,
          name: cohort.name,
          conflictDate: overlapDate
        };
      }
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

export function registerCoreRoutes(app: Express) {
  app.use((_req, _res, next) => {
    try {
      syncConfirmedCohortExecutions();
    } catch (error) {
      console.error('Erro ao sincronizar execucao automatica de turmas:', errorMessage(error));
    }
    next();
  });

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
      where c.status in ('Ativo', 'Em_treinamento')
        and mt.code <> ?
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
      join company c on c.status in ('Ativo', 'Em_treinamento')
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
          select nullif(count(*), 0)
          from cohort_schedule_day csd_count
          where csd_count.cohort_id = c.id
        ), (
          select sum(cmb2.duration_days)
          from cohort_module_block cmb2
          where cmb2.cohort_id = c.id
        ), 1) as total_duration_days,
        coalesce((
          select group_concat(sd_entry, ' || ')
          from (
            select printf('%d::%s::%s::%s',
              csd.day_index,
              csd.day_date,
              coalesce(csd.start_time, ''),
              coalesce(csd.end_time, '')
            ) as sd_entry
            from cohort_schedule_day csd
            where csd.cohort_id = c.id
            order by csd.day_index asc
          )
        ), '') as schedule_days_raw
      from cohort c
      left join technician t on t.id = c.technician_id
      order by date(c.start_date) asc
    `).all();
  
    res.json(rows);
  });
  
  app.get('/calendar/activities', (_req, res) => {
    const rows = db.prepare(`
      select ca.*,
        coalesce((
          select group_concat(ca2.technician_id, '|')
          from (
            select cat.technician_id
            from calendar_activity_technician cat
            where cat.activity_id = ca.id
            order by cat.technician_id asc
          ) ca2
        ), '') as technician_ids_raw,
        coalesce((
          select group_concat(t2.name, ' | ')
          from (
            select t.name
            from calendar_activity_technician cat
            join technician t on t.id = cat.technician_id
            where cat.activity_id = ca.id
            order by t.name asc
          ) t2
        ), '') as technician_names,
        coalesce(ca.selected_dates, '') as selected_dates_raw,
        coalesce((
          select group_concat(cad_row, ' || ')
          from (
            select printf('%s::%d::%s::%s',
              cad.day_date,
              cad.all_day,
              coalesce(cad.start_time, ''),
              coalesce(cad.end_time, '')
            ) as cad_row
            from calendar_activity_day cad
            where cad.activity_id = ca.id
            order by cad.day_date asc
          )
        ), '') as day_schedules_raw,
        c.name as company_name
      from calendar_activity ca
      left join company c on c.id = ca.company_id
      order by date(ca.start_date) asc, coalesce(ca.start_time, '00:00') asc, ca.title asc
    `).all();
  
    return res.json(rows);
  });
  
  app.post('/calendar/activities', (req, res) => {
    const parsed = calendarActivityCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const payload = parsed.data;
    let normalizedDates: ReturnType<typeof normalizeActivityDatePayload>;
    try {
      normalizedDates = normalizeActivityDatePayload({
        startDate: payload.start_date,
        endDate: payload.end_date ?? payload.start_date,
        selectedDates: payload.selected_dates,
        dateSchedules: payload.date_schedules,
        defaultAllDay: payload.all_day ?? true,
        defaultStartTime: payload.start_time ?? null,
        defaultEndTime: payload.end_time ?? null
      });
    } catch (error) {
      return res.status(400).json({ message: errorMessage(error) });
    }
    const startDate = normalizedDates.startDate;
    const endDate = normalizedDates.endDate;
    const technicianIds = Array.from(new Set((payload.technician_ids ?? [])
      .concat(payload.technician_id ? [payload.technician_id] : [])
      .map((item) => item.trim())
      .filter(Boolean)));
    if (endDate < startDate) {
      return res.status(400).json({ message: 'Data final não pode ser menor que a data inicial.' });
    }
  
    const technicianExistsStmt = db.prepare('select id from technician where id = ?');
    for (const technicianId of technicianIds) {
      const technician = technicianExistsStmt.get(technicianId) as { id: string } | undefined;
      if (!technician) {
        return res.status(404).json({ message: 'Técnico não encontrado.' });
      }
    }
    if (payload.company_id) {
      const company = db.prepare('select id from company where id = ?').get(payload.company_id) as { id: string } | undefined;
      if (!company) {
        return res.status(404).json({ message: 'Cliente não encontrado.' });
      }
    }
    const conflictMessage = assertNoActivityTechnicianConflicts({
      technicianIds,
      schedules: normalizedDates.dateSchedules
    });
    if (conflictMessage) {
      return res.status(409).json({ message: conflictMessage });
    }
  
    const activityId = uuid('act');
    const nowIso = nowDateIso();
    const tx = db.transaction(() => {
      db.prepare(`
        insert into calendar_activity (
          id, title, activity_type, start_date, end_date, selected_dates, all_day, start_time, end_time,
          technician_id, company_id, status, notes, created_at, updated_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        activityId,
        payload.title.trim(),
        payload.activity_type,
        startDate,
        endDate,
        normalizedDates.selectedDatesRaw,
        normalizedDates.summaryAllDay ? 1 : 0,
        normalizedDates.summaryStartTime,
        normalizedDates.summaryEndTime,
        technicianIds[0] ?? null,
        payload.company_id ?? null,
        payload.status,
        payload.notes?.trim() || null,
        nowIso,
        nowIso
      );
  
      const insertTech = db.prepare(`
        insert into calendar_activity_technician (activity_id, technician_id)
        values (?, ?)
      `);
      technicianIds.forEach((technicianId) => insertTech.run(activityId, technicianId));
      const insertDay = db.prepare(`
        insert into calendar_activity_day (activity_id, day_date, all_day, start_time, end_time)
        values (?, ?, ?, ?, ?)
      `);
      normalizedDates.dateSchedules.forEach((schedule) => {
        insertDay.run(
          activityId,
          schedule.day_date,
          schedule.all_day ? 1 : 0,
          schedule.all_day ? null : schedule.start_time,
          schedule.all_day ? null : schedule.end_time
        );
      });
    });
    tx();
  
    return res.status(201).json({ id: activityId });
  });
  
  app.patch('/calendar/activities/:id', (req, res) => {
    const parsed = calendarActivityUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const existing = db.prepare(`
      select id, start_date, end_date, selected_dates, all_day, start_time, end_time, technician_id
      from calendar_activity
      where id = ?
    `).get(req.params.id) as {
      id: string;
      start_date: string;
      end_date: string;
      selected_dates: string | null;
      all_day: number;
      start_time: string | null;
      end_time: string | null;
      technician_id: string | null;
    } | undefined;
    if (!existing) {
      return res.status(404).json({ message: 'Atividade não encontrada.' });
    }

    const payload = parsed.data;
    const existingDateSchedulesRows = db.prepare(`
      select day_date, all_day, start_time, end_time
      from calendar_activity_day
      where activity_id = ?
      order by day_date asc
    `).all(req.params.id) as Array<{
      day_date: string;
      all_day: number;
      start_time: string | null;
      end_time: string | null;
    }>;
    const existingSelectedDates = uniqueSortedIsoDates((existing.selected_dates ?? '').split('|'));
    const existingDatesFromRange = iterateIsoDateRange(existing.start_date, existing.end_date || existing.start_date);
    const fallbackExistingDates = existingSelectedDates.length > 0 ? existingSelectedDates : existingDatesFromRange;
    const existingDateSchedules = existingDateSchedulesRows.length > 0
      ? existingDateSchedulesRows.map((row) => ({
        day_date: row.day_date,
        all_day: Number(row.all_day) === 1,
        start_time: row.start_time,
        end_time: row.end_time
      }))
      : fallbackExistingDates.map((dayDate) => ({
        day_date: dayDate,
        all_day: Number(existing.all_day) === 1,
        start_time: existing.start_time,
        end_time: existing.end_time
      }));

    const hasSelectedDatesPatch = Object.prototype.hasOwnProperty.call(payload, 'selected_dates');
    const hasDateSchedulesPatch = Object.prototype.hasOwnProperty.call(payload, 'date_schedules');
    const hasGlobalTimePatch = (
      Object.prototype.hasOwnProperty.call(payload, 'all_day') ||
      Object.prototype.hasOwnProperty.call(payload, 'start_time') ||
      Object.prototype.hasOwnProperty.call(payload, 'end_time')
    );
    let normalizedDates: ReturnType<typeof normalizeActivityDatePayload>;
    try {
      normalizedDates = normalizeActivityDatePayload({
        startDate: payload.start_date ?? existing.start_date,
        endDate: payload.end_date ?? existing.end_date,
        selectedDates: hasSelectedDatesPatch
          ? payload.selected_dates
          : (existingSelectedDates.length > 0 ? existingSelectedDates : undefined),
        dateSchedules: hasDateSchedulesPatch
          ? payload.date_schedules
          : (hasGlobalTimePatch ? undefined : existingDateSchedules),
        defaultAllDay: payload.all_day ?? (Number(existing.all_day) === 1),
        defaultStartTime: Object.prototype.hasOwnProperty.call(payload, 'start_time')
          ? (payload.start_time ?? null)
          : existing.start_time,
        defaultEndTime: Object.prototype.hasOwnProperty.call(payload, 'end_time')
          ? (payload.end_time ?? null)
          : existing.end_time
      });
    } catch (error) {
      return res.status(400).json({ message: errorMessage(error) });
    }
    const nextStartDate = normalizedDates.startDate;
    const nextEndDate = normalizedDates.endDate;
    if (nextEndDate < nextStartDate) {
      return res.status(400).json({ message: 'Data final não pode ser menor que a data inicial.' });
    }
    const nextTechnicianIds = payload.technician_ids
      ? Array.from(new Set(payload.technician_ids.map((item) => item.trim()).filter(Boolean)))
      : undefined;
    const hasLegacyTechnicianPatch = Object.prototype.hasOwnProperty.call(payload, 'technician_id');
    const hasTechnicianPatch = typeof nextTechnicianIds !== 'undefined' || hasLegacyTechnicianPatch;
    const normalizedLegacyTechnicianId = hasLegacyTechnicianPatch ? (payload.technician_id?.trim() || null) : null;
    const existingTechRows = db.prepare(`
      select technician_id
      from calendar_activity_technician
      where activity_id = ?
      order by technician_id asc
    `).all(req.params.id) as Array<{ technician_id: string }>;
    const existingTechnicianIds = existingTechRows.map((row) => row.technician_id).filter(Boolean);
    const finalTechnicianIds = nextTechnicianIds
      ? nextTechnicianIds
      : hasLegacyTechnicianPatch
        ? (normalizedLegacyTechnicianId ? [normalizedLegacyTechnicianId] : [])
        : existingTechnicianIds;
  
    const technicianExistsStmt = db.prepare('select id from technician where id = ?');
    const technicianIdsToValidate = new Set<string>();
    finalTechnicianIds.forEach((item) => technicianIdsToValidate.add(item));
    for (const technicianId of technicianIdsToValidate) {
      const technician = technicianExistsStmt.get(technicianId) as { id: string } | undefined;
      if (!technician) {
        return res.status(404).json({ message: 'Técnico não encontrado.' });
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'company_id') && payload.company_id) {
      const company = db.prepare('select id from company where id = ?').get(payload.company_id) as { id: string } | undefined;
      if (!company) {
        return res.status(404).json({ message: 'Cliente não encontrado.' });
      }
    }
    const conflictMessage = assertNoActivityTechnicianConflicts({
      technicianIds: finalTechnicianIds,
      schedules: normalizedDates.dateSchedules,
      excludeActivityId: req.params.id
    });
    if (conflictMessage) {
      return res.status(409).json({ message: conflictMessage });
    }
  
    const fields: string[] = [];
    const values: unknown[] = [];
    if (typeof payload.title === 'string') {
      fields.push('title = ?');
      values.push(payload.title.trim());
    }
    if (typeof payload.activity_type === 'string') {
      fields.push('activity_type = ?');
      values.push(payload.activity_type);
    }
    fields.push('start_date = ?');
    values.push(nextStartDate);
    fields.push('end_date = ?');
    values.push(nextEndDate);
    fields.push('selected_dates = ?');
    values.push(normalizedDates.selectedDatesRaw);
    fields.push('all_day = ?');
    values.push(normalizedDates.summaryAllDay ? 1 : 0);
    fields.push('start_time = ?');
    values.push(normalizedDates.summaryStartTime);
    fields.push('end_time = ?');
    values.push(normalizedDates.summaryEndTime);
    if (hasTechnicianPatch) {
      fields.push('technician_id = ?');
      if (nextTechnicianIds) {
        values.push(nextTechnicianIds[0] ?? null);
      } else {
        values.push(normalizedLegacyTechnicianId ?? null);
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'company_id')) {
      fields.push('company_id = ?');
      values.push(payload.company_id ?? null);
    }
    if (typeof payload.status === 'string') {
      fields.push('status = ?');
      values.push(payload.status);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'notes')) {
      fields.push('notes = ?');
      values.push(payload.notes?.trim() || null);
    }

    fields.push('updated_at = ?');
    values.push(nowDateIso());
    values.push(req.params.id);
    const tx = db.transaction(() => {
      db.prepare(`update calendar_activity set ${fields.join(', ')} where id = ?`).run(...values);
      db.prepare('delete from calendar_activity_day where activity_id = ?').run(req.params.id);
      const insertDay = db.prepare(`
        insert into calendar_activity_day (activity_id, day_date, all_day, start_time, end_time)
        values (?, ?, ?, ?, ?)
      `);
      normalizedDates.dateSchedules.forEach((schedule) => {
        insertDay.run(
          req.params.id,
          schedule.day_date,
          schedule.all_day ? 1 : 0,
          schedule.all_day ? null : schedule.start_time,
          schedule.all_day ? null : schedule.end_time
        );
      });
      if (nextTechnicianIds) {
        db.prepare('delete from calendar_activity_technician where activity_id = ?').run(req.params.id);
        const insertTech = db.prepare(`
          insert into calendar_activity_technician (activity_id, technician_id)
          values (?, ?)
        `);
        nextTechnicianIds.forEach((technicianId) => insertTech.run(req.params.id, technicianId));
      } else if (hasLegacyTechnicianPatch) {
        db.prepare('delete from calendar_activity_technician where activity_id = ?').run(req.params.id);
        if (normalizedLegacyTechnicianId) {
          db.prepare(`
            insert into calendar_activity_technician (activity_id, technician_id)
            values (?, ?)
          `).run(req.params.id, normalizedLegacyTechnicianId);
        }
      }
    });
    tx();
  
    return res.json({ ok: true });
  });
  
  app.delete('/calendar/activities/:id', (req, res) => {
    const exists = db.prepare('select id from calendar_activity where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!exists) {
      return res.status(404).json({ message: 'Atividade não encontrada.' });
    }
    db.prepare('delete from calendar_activity where id = ?').run(req.params.id);
    return res.json({ ok: true });
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
    const schedule_days = db.prepare(`
      select day_index, day_date, start_time, end_time
      from cohort_schedule_day
      where cohort_id = ?
      order by day_index asc
    `).all(req.params.id);
    const participantsRaw = db.prepare(`
      select
        cp.id,
        cp.company_id,
        c.name as company_name,
        cp.participant_name,
        cp.created_at,
        (
          select group_concat(cpm.module_id, '|')
          from cohort_participant_module cpm
          where cpm.participant_id = cp.id
        ) as module_ids_raw
      from cohort_participant cp
      join company c on c.id = cp.company_id
      where cp.cohort_id = ?
      order by c.name asc, cp.participant_name asc
    `).all(req.params.id) as Array<{
      id: string;
      company_id: string;
      company_name: string;
      participant_name: string;
      created_at: string;
      module_ids_raw: string | null;
    }>;
  
    const participants = participantsRaw.map((row) => ({
      id: row.id,
      company_id: row.company_id,
      company_name: row.company_name,
      participant_name: row.participant_name,
      created_at: row.created_at,
      module_ids: row.module_ids_raw
        ? row.module_ids_raw.split('|').map((item) => item.trim()).filter(Boolean)
        : []
    }));
  
    return res.json({ ...cohort, blocks, allocations, schedule_days, participants });
  });
  
  app.get('/cohorts/:id/certificate', async (req, res) => {
    const companyId = typeof req.query.company_id === 'string'
      ? req.query.company_id.trim()
      : '';
    const requestedModuleId = typeof req.query.module_id === 'string'
      ? req.query.module_id.trim()
      : '';
    if (!companyId) {
      return res.status(400).json({ message: 'Informe o parâmetro company_id para emitir o certificado.' });
    }
    if (!requestedModuleId) {
      return res.status(400).json({ message: 'Informe o parâmetro module_id para emitir certificado por módulo.' });
    }
  
    const cohort = db.prepare(`
      select c.id, c.code, c.name, c.technician_id, t.name as technician_name
      from cohort c
      left join technician t on t.id = c.technician_id
      where c.id = ?
    `).get(req.params.id) as {
      id: string;
      code: string;
      name: string;
      technician_id: string | null;
      technician_name: string | null;
    } | undefined;
  
    if (!cohort) {
      return res.status(404).json({ message: 'Turma não encontrada.' });
    }
  
    const company = db.prepare(`
      select id, name
      from company
      where id = ?
    `).get(companyId) as { id: string; name: string } | undefined;
  
    if (!company) {
      return res.status(404).json({ message: 'Empresa não encontrada.' });
    }
  
    const hasAllocation = db.prepare(`
      select 1 as ok
      from cohort_allocation
      where cohort_id = ? and company_id = ? and status <> 'Cancelado'
      limit 1
    `).get(req.params.id, companyId) as { ok: number } | undefined;
  
    if (!hasAllocation) {
      return res.status(400).json({ message: 'Esta empresa não possui alocação ativa nesta turma.' });
    }
  
    const moduleRows = db.prepare(`
      select
        a.module_id,
        mt.code as module_code,
        mt.name as module_name,
        coalesce(cmb.order_in_cohort, 9999) as order_in_cohort,
        coalesce(cmb.duration_days, 1) as duration_days
      from cohort_allocation a
      join module_template mt on mt.id = a.module_id
      left join cohort_module_block cmb on cmb.cohort_id = a.cohort_id and cmb.module_id = a.module_id
      where a.cohort_id = ? and a.company_id = ? and a.status <> 'Cancelado'
      group by a.module_id
      order by order_in_cohort asc, mt.name asc
    `).all(req.params.id, companyId) as Array<{
      module_id: string;
      module_code: string;
      module_name: string;
      order_in_cohort: number;
      duration_days: number;
    }>;
  
    if (moduleRows.length === 0) {
      return res.status(400).json({ message: 'Sem módulos ativos para esta empresa nesta turma.' });
    }
  
    const moduleRow = moduleRows.find((row) => row.module_id === requestedModuleId);
    if (!moduleRow) {
      return res.status(400).json({ message: 'Módulo informado não está ativo para esta empresa nesta turma.' });
    }
  
    const participants = db.prepare(`
      select cp.participant_name
      from cohort_participant cp
      join cohort_participant_module cpm on cpm.participant_id = cp.id
      where cp.cohort_id = ? and cp.company_id = ? and cpm.module_id = ?
      order by cp.participant_name asc
    `).all(req.params.id, companyId, requestedModuleId) as Array<{ participant_name: string }>;
  
    if (participants.length === 0) {
      return res.status(400).json({ message: 'Nenhum participante desta empresa está vinculado ao módulo selecionado.' });
    }
  
    const totalDays = Math.max(1, Number(moduleRow.duration_days) || 1);
    const totalHours = totalDays * 8;
    const trainingName = moduleShortLabel(moduleRow.module_name);
    const issueDateIso = nowDateIso();
    const certCode = [
      'CERT',
      normalizeCertToken(cohort.code || cohort.name || 'TURMA'),
      normalizeCertToken(company.name || 'EMPRESA'),
      normalizeCertToken(moduleRow.module_code || moduleRow.module_name || requestedModuleId),
      issueDateIso.replace(/-/g, '')
    ].filter(Boolean).join('-');
  
    const employeeCardsHtml = participants
      .map((participant, index) => {
        const position = String(index + 1).padStart(2, '0');
        return `
        <div class="employee-card">
          <div class="employee-num">${position}</div>
          <div class="employee-name">${escapeHtml(participant.participant_name)}</div>
          <div class="employee-role">Participante</div>
        </div>`;
      })
      .join('');
  
    try {
      let html = readCertificateTemplate();
      const tokens: Array<[string, string]> = [
        ['COMPANY_NAME', escapeHtml(company.name)],
        ['COURSE_NAME', escapeHtml(trainingName || cohort.name)],
        ['COURSE_HOURS', escapeHtml(`⏱ ${totalDays} diária(s) (${totalHours}h)`)],
        ['EMPLOYEES_GRID', employeeCardsHtml],
        ['TECHNICIAN_NAME', escapeHtml(cohort.technician_name ?? 'Sem técnico definido')],
        ['EMIT_DATE', escapeHtml(formatLongDatePtBr(issueDateIso))],
        ['CERT_CODE', escapeHtml(certCode)]
      ];
      tokens.forEach(([token, value]) => {
        html = html.split(`{{${token}}}`).join(value);
      });
  
      const format = typeof req.query.format === 'string'
        ? req.query.format.trim().toLowerCase()
        : 'pdf';
      const shouldDownload = String(req.query.download ?? '1') !== '0';
      const fileBase = `Certificado - ${normalizeFileLabelPart(company.name)} - ${normalizeFileLabelPart(trainingName || moduleRow.module_name)}`;
  
      if (format === 'html') {
        const encodedFileName = encodeURIComponent(`${fileBase}.html`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `${shouldDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${encodedFileName}`);
        return res.send(html);
      }
  
      const pdfHtml = applyPdfLayoutOverrides(html);
      const pdfBuffer = await renderPdfFromHtml(pdfHtml);
  
      const certificateDocumentTitle = fileBase;
      const certificateDocumentNotes = [
        '[CERTIFICADO_AUTOMATICO]',
        `Código: ${certCode}`,
        `Turma: ${cohort.code}`,
        `Empresa: ${company.name}`,
        `Módulo: ${trainingName}`,
        `Participantes: ${participants.map((item) => item.participant_name).join(' | ')}`,
        `Emitido em: ${formatLongDatePtBr(issueDateIso)}`
      ].join('\n');
      const certificateDataUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
      const existingCertificateDocument = db.prepare(`
        select id
        from internal_document
        where category = 'Certificados'
          and notes like ?
        limit 1
      `).get(`%Código: ${certCode}%`) as { id: string } | undefined;
  
      if (existingCertificateDocument) {
        db.prepare(`
          update internal_document
          set
            title = ?,
            category = ?,
            notes = ?,
            file_name = ?,
            mime_type = ?,
            file_data_base64 = ?,
            file_size_bytes = ?,
            updated_at = ?
          where id = ?
        `).run(
          certificateDocumentTitle,
          'Certificados',
          certificateDocumentNotes,
          `${fileBase}.pdf`,
          'application/pdf',
          certificateDataUrl,
          pdfBuffer.length,
          nowDateIso(),
          existingCertificateDocument.id
        );
      } else {
        db.prepare(`
          insert into internal_document (
            id, title, category, notes, file_name, mime_type, file_data_base64,
            file_size_bytes, created_at, updated_at
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          uuid('doc'),
          certificateDocumentTitle,
          'Certificados',
          certificateDocumentNotes,
          `${fileBase}.pdf`,
          'application/pdf',
          certificateDataUrl,
          pdfBuffer.length,
          nowDateIso(),
          nowDateIso()
        );
      }
  
      const encodedFileName = encodeURIComponent(`${fileBase}.pdf`);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${shouldDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${encodedFileName}`);
      return res.send(pdfBuffer);
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao gerar certificado.', detail: errorMessage(error) });
    }
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
    const timeWindowError = validateCohortTimeWindow(payload.period, payload.start_time ?? null, payload.end_time ?? null);
    if (timeWindowError) {
      return res.status(400).json({ message: timeWindowError });
    }
    const scheduleDaysError = validateScheduleDays(payload.period, payload.blocks, payload.schedule_days);
    if (scheduleDaysError) {
      return res.status(400).json({ message: scheduleDaysError });
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
      period: payload.period,
      startTime: payload.start_time ?? null,
      endTime: payload.end_time ?? null,
      scheduleDays: payload.schedule_days,
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
    const timeWindowError = validateCohortTimeWindow(payload.period, payload.start_time ?? null, payload.end_time ?? null);
    if (timeWindowError) {
      return res.status(400).json({ message: timeWindowError });
    }
    const scheduleDaysError = validateScheduleDays(payload.period, payload.blocks, payload.schedule_days);
    if (scheduleDaysError) {
      return res.status(400).json({ message: scheduleDaysError });
    }
  
    if (payload.technician_id && payload.status !== 'Cancelada') {
      const conflict = findTechnicianConflict({
        technicianId: payload.technician_id,
        startDate: payload.start_date,
        period: payload.period,
        startTime: payload.period === 'Meio_periodo' ? (payload.start_time ?? null) : null,
        endTime: payload.period === 'Meio_periodo' ? (payload.end_time ?? null) : null,
        scheduleDays: payload.schedule_days,
        blocks: payload.blocks
      });
      if (conflict) {
        return res.status(400).json({
          message: `Técnico já está alocado na turma ${conflict.code} - ${conflict.name} em ${formatDatePtBr(conflict.conflictDate)}.`
        });
      }
    }
  
    const cohortId = uuid('coh');
    const resolvedCode = resolveUniqueCohortCode(payload.code);
  
    const tx = db.transaction(() => {
      db.prepare(`
        insert into cohort (
          id, code, name, start_date, technician_id, status, capacity_companies, period, start_time, end_time, delivery_mode, notes
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cohortId,
        resolvedCode,
        payload.name,
        payload.start_date,
        payload.technician_id ?? null,
        payload.status,
        payload.capacity_companies,
        payload.period,
        payload.period === 'Meio_periodo' ? (payload.start_time ?? null) : null,
        payload.period === 'Meio_periodo' ? (payload.end_time ?? null) : null,
        payload.delivery_mode,
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
  
      if (payload.schedule_days && payload.schedule_days.length > 0) {
        const insertSchedule = db.prepare(`
          insert into cohort_schedule_day (id, cohort_id, day_index, day_date, start_time, end_time)
          values (?, ?, ?, ?, ?, ?)
        `);
        payload.schedule_days.forEach((day) => {
          insertSchedule.run(
            uuid('csd'),
            cohortId,
            day.day_index,
            day.day_date,
            day.start_time ?? null,
            day.end_time ?? null
          );
        });
      }
    });
  
    try {
      tx();
      return res.status(201).json({ id: cohortId, code: resolvedCode });
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
      select id, technician_id, start_date, status, period, start_time, end_time
      from cohort
      where id = ?
    `).get(req.params.id) as {
      id: string;
      technician_id: string | null;
      start_date: string;
      status: string;
      period: (typeof COHORT_PERIOD_VALUES)[number] | null;
      start_time: string | null;
      end_time: string | null;
    } | undefined;
    if (!existing) {
      return res.status(404).json({ message: 'Turma nao encontrada' });
    }
  
    const payload = parsed.data;
    const existingScheduleDays = db.prepare(`
      select day_index, day_date, start_time, end_time
      from cohort_schedule_day
      where cohort_id = ?
      order by day_index asc
    `).all(req.params.id) as Array<{
      day_index: number;
      day_date: string;
      start_time: string | null;
      end_time: string | null;
    }>;
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
    const nextPeriod = payload.period ?? (existing.period ?? 'Integral');
    const nextStartTime = Object.prototype.hasOwnProperty.call(payload, 'start_time')
      ? (payload.start_time ?? null)
      : (existing.start_time ?? null);
    const nextEndTime = Object.prototype.hasOwnProperty.call(payload, 'end_time')
      ? (payload.end_time ?? null)
      : (existing.end_time ?? null);
    const timeWindowError = validateCohortTimeWindow(nextPeriod, nextStartTime, nextEndTime);
    if (timeWindowError) {
      return res.status(400).json({ message: timeWindowError });
    }
    const nextBlocks = payload.blocks ?? db.prepare(`
      select start_day_offset, duration_days
      from cohort_module_block
      where cohort_id = ?
      order by order_in_cohort asc
    `).all(req.params.id) as Array<{ start_day_offset: number; duration_days: number }>;
    const nextScheduleDays = typeof payload.schedule_days !== 'undefined'
      ? payload.schedule_days
      : existingScheduleDays;
    const scheduleDaysError = validateScheduleDays(nextPeriod, nextBlocks, nextScheduleDays);
    if (scheduleDaysError) {
      return res.status(400).json({ message: scheduleDaysError });
    }
  
    if (nextTechnicianId && nextStatus !== 'Cancelada') {
      const conflict = findTechnicianConflict({
        technicianId: nextTechnicianId,
        startDate: nextStartDate,
        period: nextPeriod,
        startTime: nextPeriod === 'Meio_periodo' ? nextStartTime : null,
        endTime: nextPeriod === 'Meio_periodo' ? nextEndTime : null,
        scheduleDays: nextScheduleDays,
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
      if (key === 'blocks' || key === 'start_time' || key === 'end_time' || key === 'schedule_days') return;
      if (key === 'code' && typeof value === 'string') {
        fields.push('code = ?');
        values.push(resolveUniqueCohortCode(value, req.params.id));
        return;
      }
      fields.push(`${key} = ?`);
      values.push(value);
    });
  
    if (Object.prototype.hasOwnProperty.call(payload, 'period') || Object.prototype.hasOwnProperty.call(payload, 'start_time') || Object.prototype.hasOwnProperty.call(payload, 'end_time')) {
      if (nextPeriod !== 'Meio_periodo') {
        fields.push('start_time = ?');
        values.push(null);
        fields.push('end_time = ?');
        values.push(null);
      } else {
        fields.push('start_time = ?');
        values.push(nextStartTime);
        fields.push('end_time = ?');
        values.push(nextEndTime);
      }
    }
  
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
  
      if (typeof payload.schedule_days !== 'undefined') {
        db.prepare('delete from cohort_schedule_day where cohort_id = ?').run(req.params.id);
        if (payload.schedule_days.length > 0) {
          const insertSchedule = db.prepare(`
            insert into cohort_schedule_day (id, cohort_id, day_index, day_date, start_time, end_time)
            values (?, ?, ?, ?, ?, ?)
          `);
          payload.schedule_days.forEach((day) => {
            insertSchedule.run(
              uuid('csd'),
              req.params.id,
              day.day_index,
              day.day_date,
              day.start_time ?? null,
              day.end_time ?? null
            );
          });
        }
      } else if (payload.blocks) {
        db.prepare('delete from cohort_schedule_day where cohort_id = ?').run(req.params.id);
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
    if (!requireDestructiveConfirmation(req, res, 'excluir turma')) {
      return;
    }
  
    const exists = db.prepare('select id from cohort where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!exists) {
      return res.status(404).json({ message: 'Turma não encontrada' });
    }
  
    db.prepare('delete from cohort where id = ?').run(req.params.id);
    return res.json({ ok: true });
  });
  
  app.post('/cohorts/:id/participants', (req, res) => {
    const parsed = cohortParticipantCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const cohort = db.prepare('select id from cohort where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!cohort) {
      return res.status(404).json({ message: 'Turma nao encontrada' });
    }
  
    const company = db.prepare('select id from company where id = ?').get(parsed.data.company_id) as { id: string } | undefined;
    if (!company) {
      return res.status(404).json({ message: 'Empresa nao encontrada' });
    }
  
    try {
      const participantId = uuid('cpt');
      const activeModuleIds = activeCompanyModuleIdsInCohort(req.params.id, parsed.data.company_id);
      const insertParticipant = db.prepare(`
        insert into cohort_participant (id, cohort_id, company_id, participant_name, created_at)
        values (?, ?, ?, ?, ?)
      `);
      const insertParticipantModule = db.prepare(`
        insert or ignore into cohort_participant_module (participant_id, module_id)
        values (?, ?)
      `);
      const tx = db.transaction(() => {
        insertParticipant.run(
          participantId,
          req.params.id,
          parsed.data.company_id,
          parsed.data.participant_name.trim(),
          nowDateIso()
        );
        activeModuleIds.forEach((moduleId) => insertParticipantModule.run(participantId, moduleId));
      });
      tx();
      return res.status(201).json({ ok: true });
    } catch (error) {
      return res.status(400).json({ message: 'Nao foi possivel adicionar participante', detail: errorMessage(error) });
    }
  });
  
  app.delete('/cohorts/:id/participants/:participantId', (req, res) => {
    const exists = db.prepare(`
      select id
      from cohort_participant
      where id = ? and cohort_id = ?
    `).get(req.params.participantId, req.params.id) as { id: string } | undefined;
  
    if (!exists) {
      return res.status(404).json({ message: 'Participante nao encontrado na turma.' });
    }
  
    db.prepare('delete from cohort_participant where id = ?').run(req.params.participantId);
    return res.json({ ok: true });
  });
  
  function updateCohortParticipantModulesHandler(req: express.Request, res: express.Response) {
    const parsed = cohortParticipantModulesUpdateSchema.safeParse({
      module_ids: Array.isArray(req.body?.module_ids)
        ? req.body.module_ids
        : (Array.isArray(req.body?.moduleIds) ? req.body.moduleIds : [])
    });
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const participant = db.prepare(`
      select id, cohort_id, company_id
      from cohort_participant
      where id = ? and cohort_id = ?
    `).get(req.params.participantId, req.params.id) as {
      id: string;
      cohort_id: string;
      company_id: string;
    } | undefined;
  
    if (!participant) {
      return res.status(404).json({ message: 'Participante não encontrado na turma.' });
    }
  
    const allowedModuleIds = new Set(activeCompanyModuleIdsInCohort(req.params.id, participant.company_id));
    const requestedModuleIds = Array.from(new Set(parsed.data.module_ids.map((item) => item.trim()).filter(Boolean)));
    const invalidModuleId = requestedModuleIds.find((moduleId) => !allowedModuleIds.has(moduleId));
    if (invalidModuleId) {
      return res.status(400).json({ message: 'Existe módulo inválido para esta empresa nesta turma.' });
    }
  
    const insertParticipantModule = db.prepare(`
      insert into cohort_participant_module (participant_id, module_id)
      values (?, ?)
    `);
  
    const tx = db.transaction(() => {
      db.prepare('delete from cohort_participant_module where participant_id = ?').run(req.params.participantId);
      requestedModuleIds.forEach((moduleId) => insertParticipantModule.run(req.params.participantId, moduleId));
    });
  
    tx();
    return res.json({ ok: true, module_ids: requestedModuleIds });
  }
  
  app.patch('/cohorts/:id/participants/:participantId/modules', updateCohortParticipantModulesHandler);
  app.post('/cohorts/:id/participants/:participantId/modules', updateCohortParticipantModulesHandler);
  
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
  
      const participants = db.prepare(`
        select id
        from cohort_participant
        where cohort_id = ? and company_id = ?
      `).all(cohortId, payload.company_id) as Array<{ id: string }>;
      if (participants.length > 0) {
        const insertParticipantModule = db.prepare(`
          insert or ignore into cohort_participant_module (participant_id, module_id)
          values (?, ?)
        `);
        participants.forEach((participant) => {
          selectedBlocks.forEach((block) => {
            insertParticipantModule.run(participant.id, block.module_id);
          });
        });
      }
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
      select c.id, c.name, c.priority_level, c.priority,
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
      where c.status in ('Ativo', 'Em_treinamento')
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
        case c.priority_level
          when 'Alta' then 5
          when 'Normal' then 4
          when 'Baixa' then 3
          when 'Parado' then 2
          when 'Aguardando_liberacao' then 1
          else 0
        end desc,
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

  const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const portalAccessUpsertSchema = z.object({
    slug: z.string().trim().min(2).max(120),
    username: z.string().trim().min(1).max(120),
    password: z.string().trim().min(6).max(200).optional(),
    is_active: z.boolean().default(true),
    support_intro_text: z.string().trim().max(600).nullable().optional(),
    hidden_module_ids: z.array(z.string().trim().min(1).max(120)).max(500).optional(),
    module_date_overrides: z.array(z.object({
      module_id: z.string().trim().min(1).max(120),
      next_date: isoDateSchema
    })).max(500).optional()
  });

  function parsePortalModuleIdList(raw: string | null | undefined): string[] {
    if (!raw?.trim()) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      const ids = parsed
        .map((value) => typeof value === 'string' ? value.trim() : '')
        .filter((value) => value.length > 0);
      return Array.from(new Set(ids));
    } catch {
      return [];
    }
  }

  function parsePortalDateOverrides(raw: string | null | undefined) {
    if (!raw?.trim()) return {} as Record<string, string>;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {} as Record<string, string>;
      }
      const next: Record<string, string> = {};
      Object.entries(parsed as Record<string, unknown>).forEach(([moduleId, nextDate]) => {
        const normalizedModuleId = moduleId.trim();
        if (!normalizedModuleId || typeof nextDate !== 'string' || !isoDateSchema.safeParse(nextDate).success) {
          return;
        }
        next[normalizedModuleId] = nextDate;
      });
      return next;
    } catch {
      return {} as Record<string, string>;
    }
  }
  
  app.get('/companies', (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
    const priorityFilter = typeof req.query.priority_level === 'string' ? req.query.priority_level : '';
    const modalityFilter = typeof req.query.modality === 'string' ? req.query.modality : '';
    const thirdPartyFilterRaw = typeof req.query.is_third_party === 'string' ? req.query.is_third_party.trim() : '';
    const thirdPartyFilter = thirdPartyFilterRaw === '1' || thirdPartyFilterRaw.toLowerCase() === 'true'
      ? 1
      : thirdPartyFilterRaw === '0' || thirdPartyFilterRaw.toLowerCase() === 'false'
        ? 0
        : -1;
  
    const rows = db.prepare(`
      select c.id, c.name, c.status, c.priority_level, c.notes, c.is_third_party,
        c.contact_name, c.contact_phone, c.contact_email, c.modality,
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
      where (
        ? = ''
        or lower(c.name) like '%' || lower(?) || '%'
        or lower(coalesce(c.contact_name, '')) like '%' || lower(?) || '%'
        or lower(coalesce(c.contact_email, '')) like '%' || lower(?) || '%'
      )
        and (? = '' or c.status = ?)
        and (? = '' or c.priority_level = ?)
        and (? = '' or c.modality = ?)
        and (? = -1 or c.is_third_party = ?)
      group by c.id
      order by
        case c.priority_level
          when 'Alta' then 5
          when 'Normal' then 4
          when 'Baixa' then 3
          when 'Parado' then 2
          when 'Aguardando_liberacao' then 1
          else 0
        end desc,
        c.name asc
    `).all(
      search,
      search,
      search,
      search,
      statusFilter,
      statusFilter,
      priorityFilter,
      priorityFilter,
      modalityFilter,
      modalityFilter,
      thirdPartyFilter,
      thirdPartyFilter
    ) as Array<{
      id: string;
      name: string;
      status: string;
      priority_level: string;
      notes: string | null;
      is_third_party: number;
      contact_name: string | null;
      contact_phone: string | null;
      contact_email: string | null;
      modality: string;
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
        relationship_type: row.is_third_party ? 'Terceiro' : 'Nosso',
        priority: normalizeCompanyPriorityScore(row.priority_level),
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
      status: z.enum(COMPANY_STATUS_VALUES).default('Em_treinamento'),
      notes: z.string().nullable().optional(),
      priority_level: z.enum(COMPANY_PRIORITY_VALUES).default('Normal'),
      contact_name: z.string().nullable().optional(),
      contact_phone: z.string().nullable().optional(),
      contact_email: z.string().nullable().optional(),
      modality: z.enum(COMPANY_MODALITY_VALUES).default('Turma_Online'),
      relationship_type: z.enum(COMPANY_RELATION_VALUES).optional(),
      is_third_party: z.boolean().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const companyId = uuid('comp');
    const priorityLevel = normalizeCompanyPriorityLevel(parsed.data.priority_level);
    try {
      db.prepare(`
        insert into company (
          id, name, status, notes, priority, priority_level, contact_name, contact_phone, contact_email, modality, is_third_party
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        companyId,
        parsed.data.name.trim(),
        normalizeCompanyStatus(parsed.data.status),
        parsed.data.notes?.trim() || null,
        normalizeCompanyPriorityScore(priorityLevel),
        priorityLevel,
        parsed.data.contact_name?.trim() || null,
        parsed.data.contact_phone?.trim() || null,
        parsed.data.contact_email?.trim() || null,
        normalizeCompanyModality(parsed.data.modality),
        (typeof parsed.data.is_third_party === 'boolean'
          ? parsed.data.is_third_party
          : normalizeCompanyRelation(parsed.data.relationship_type) === 'Terceiro') ? 1 : 0
      );
  
      ensureCompanyDefaultRows(companyId);
      return res.status(201).json({ id: companyId });
    } catch (error) {
      return res.status(400).json({ message: 'Não foi possível criar cliente', detail: errorMessage(error) });
    }
  });
  
  app.delete('/companies/:id', (req, res) => {
    if (!requireDestructiveConfirmation(req, res, 'excluir cliente')) {
      return;
    }
  
    const exists = db.prepare('select id from company where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!exists) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }
  
    db.prepare('delete from company where id = ?').run(req.params.id);
    return res.json({ ok: true });
  });
  
  app.patch('/companies/:id/priority', (req, res) => {
    const schema = z.object({
      priority: z.number().int().min(0).max(100).optional(),
      priority_level: z.enum(COMPANY_PRIORITY_VALUES).optional()
    }).superRefine((data, context) => {
      if (typeof data.priority === 'undefined' && typeof data.priority_level === 'undefined') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['priority_level'],
          message: 'Informe prioridade por nível.'
        });
      }
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const priorityLevel = normalizeCompanyPriorityLevel(
      parsed.data.priority_level ?? (typeof parsed.data.priority === 'number' ? priorityLevelFromNumeric(parsed.data.priority) : 'Normal')
    );
    const result = db.prepare(`
      update company
      set priority_level = ?, priority = ?
      where id = ?
    `).run(priorityLevel, normalizeCompanyPriorityScore(priorityLevel), req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'Empresa nao encontrada' });
    }
  
    return res.json({ ok: true });
  });
  
  app.patch('/companies/:id', (req, res) => {
    const schema = z.object({
      name: z.string().min(2).optional(),
      status: z.enum(COMPANY_STATUS_VALUES).optional(),
      notes: z.string().nullable().optional(),
      priority_level: z.enum(COMPANY_PRIORITY_VALUES).optional(),
      contact_name: z.string().nullable().optional(),
      contact_phone: z.string().nullable().optional(),
      contact_email: z.string().nullable().optional(),
      modality: z.enum(COMPANY_MODALITY_VALUES).optional(),
      relationship_type: z.enum(COMPANY_RELATION_VALUES).optional(),
      is_third_party: z.boolean().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const payload = parsed.data;
    const fields: string[] = [];
    const values: unknown[] = [];
  
    if (typeof payload.name !== 'undefined') {
      fields.push('name = ?');
      values.push(payload.name.trim());
    }
    if (typeof payload.status !== 'undefined') {
      fields.push('status = ?');
      values.push(normalizeCompanyStatus(payload.status));
    }
    if (typeof payload.notes !== 'undefined') {
      fields.push('notes = ?');
      values.push(payload.notes?.trim() || null);
    }
    if (typeof payload.priority_level !== 'undefined') {
      const priorityLevel = normalizeCompanyPriorityLevel(payload.priority_level);
      fields.push('priority_level = ?');
      values.push(priorityLevel);
      fields.push('priority = ?');
      values.push(normalizeCompanyPriorityScore(priorityLevel));
    }
    if (typeof payload.contact_name !== 'undefined') {
      fields.push('contact_name = ?');
      values.push(payload.contact_name?.trim() || null);
    }
    if (typeof payload.contact_phone !== 'undefined') {
      fields.push('contact_phone = ?');
      values.push(payload.contact_phone?.trim() || null);
    }
    if (typeof payload.contact_email !== 'undefined') {
      fields.push('contact_email = ?');
      values.push(payload.contact_email?.trim() || null);
    }
    if (typeof payload.modality !== 'undefined') {
      fields.push('modality = ?');
      values.push(normalizeCompanyModality(payload.modality));
    }
    if (typeof payload.relationship_type !== 'undefined') {
      fields.push('is_third_party = ?');
      values.push(normalizeCompanyRelation(payload.relationship_type) === 'Terceiro' ? 1 : 0);
    }
    if (typeof payload.is_third_party === 'boolean') {
      fields.push('is_third_party = ?');
      values.push(payload.is_third_party ? 1 : 0);
    }
  
    if (fields.length === 0) {
      return res.json({ ok: true });
    }
  
    values.push(req.params.id);
    try {
      const result = db.prepare(`update company set ${fields.join(', ')} where id = ?`).run(...values);
      if (result.changes === 0) {
        return res.status(404).json({ message: 'Empresa nao encontrada' });
      }
      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ message: 'Nao foi possivel atualizar cliente', detail: errorMessage(error) });
    }
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
    const companyPayload = {
      ...(company as Record<string, unknown>),
      relationship_type: (company as { is_third_party?: number }).is_third_party ? 'Terceiro' : 'Nosso'
    };
  
    const timeline = db.prepare(`
      select mt.id as module_id, mt.code, mt.name, mt.category, mt.duration_days,
        coalesce(cmp.status, 'Nao_iniciado') as status,
        cmp.completed_at,
        cmp.notes as progress_notes,
        cmp.custom_duration_days,
        cmp.custom_units,
        coalesce(cmp.custom_duration_days, mt.duration_days) as effective_duration_days,
        coalesce(cma.is_enabled, 1) as is_enabled,
        (
          select a2.cohort_id
          from cohort_allocation a2
          join cohort c2 on c2.id = a2.cohort_id
          where a2.company_id = ?
            and a2.module_id = mt.id
            and a2.status <> 'Cancelado'
          order by date(c2.start_date) desc, c2.code desc
          limit 1
        ) as last_cohort_id,
        (
          select c2.code
          from cohort_allocation a2
          join cohort c2 on c2.id = a2.cohort_id
          where a2.company_id = ?
            and a2.module_id = mt.id
            and a2.status <> 'Cancelado'
          order by date(c2.start_date) desc, c2.code desc
          limit 1
        ) as last_cohort_code,
        (
          select c2.name
          from cohort_allocation a2
          join cohort c2 on c2.id = a2.cohort_id
          where a2.company_id = ?
            and a2.module_id = mt.id
            and a2.status <> 'Cancelado'
          order by date(c2.start_date) desc, c2.code desc
          limit 1
        ) as last_cohort_name,
        (
          select c2.status
          from cohort_allocation a2
          join cohort c2 on c2.id = a2.cohort_id
          where a2.company_id = ?
            and a2.module_id = mt.id
            and a2.status <> 'Cancelado'
          order by date(c2.start_date) desc, c2.code desc
          limit 1
        ) as last_cohort_status
      from module_template mt
      left join company_module_progress cmp on cmp.module_id = mt.id and cmp.company_id = ?
      left join company_module_activation cma on cma.module_id = mt.id and cma.company_id = ?
      order by mt.code asc
    `).all(
      req.params.id,
      req.params.id,
      req.params.id,
      req.params.id,
      req.params.id,
      req.params.id
    );
  
    const optionals = db.prepare(`
      select om.id, om.code, om.name, om.category, om.duration_days,
        coalesce(cop.status, 'Planejado') as status
      from optional_module om
      left join company_optional_progress cop
        on cop.optional_module_id = om.id and cop.company_id = ?
      order by om.code asc
    `).all(req.params.id);
  
    const history = db.prepare(`
      select a.id as allocation_id, a.cohort_id, a.status, a.entry_day, a.executed_at,
        c.code as cohort_code, c.name as cohort_name, c.status as cohort_status, c.start_date,
        mt.code as module_code, mt.name as module_name
      from cohort_allocation a
      join cohort c on c.id = a.cohort_id
      join module_template mt on mt.id = a.module_id
      where a.company_id = ?
      order by date(c.start_date) desc, a.entry_day asc
    `).all(req.params.id);
  
    res.json({ company: companyPayload, timeline, optionals, history });
  });

  app.get('/companies/:id/portal-access', (req, res) => {
    const company = db.prepare('select id from company where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!company) {
      return res.status(404).json({ message: 'Empresa nao encontrada' });
    }

    const row = db.prepare(`
      select
        pc.slug,
        pc.is_active,
        pc.support_intro_text,
        pc.hidden_module_ids_json,
        pc.module_date_overrides_json,
        pu.username
      from portal_client pc
      left join portal_user pu on pu.portal_client_id = pc.id
      where pc.company_id = ?
      order by pu.is_active desc, datetime(pu.updated_at) desc
      limit 1
    `).get(req.params.id) as
      | {
        slug: string;
        is_active: number;
        username: string | null;
        support_intro_text: string | null;
        hidden_module_ids_json: string | null;
        module_date_overrides_json: string | null;
      }
      | undefined;

    if (!row) {
      return res.json({
        slug: null,
        username: null,
        is_active: false,
        support_intro_text: null,
        hidden_module_ids: [],
        module_date_overrides: []
      });
    }

    const hiddenModuleIds = parsePortalModuleIdList(row.hidden_module_ids_json);
    const moduleDateOverrides = parsePortalDateOverrides(row.module_date_overrides_json);

    return res.json({
      slug: row.slug,
      username: row.username,
      is_active: Number(row.is_active) === 1,
      support_intro_text: row.support_intro_text ?? null,
      hidden_module_ids: hiddenModuleIds,
      module_date_overrides: Object.entries(moduleDateOverrides).map(([module_id, next_date]) => ({
        module_id,
        next_date
      }))
    });
  });

  app.put('/companies/:id/portal-access', async (req, res) => {
    const company = db.prepare('select id from company where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!company) {
      return res.status(404).json({ message: 'Empresa nao encontrada' });
    }

    const parsed = portalAccessUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const payload = parsed.data;
    const nowIso = new Date().toISOString();
    const normalizedSlug = payload.slug.trim().toLowerCase();
    const normalizedUsername = payload.username.trim();
    const normalizedSupportIntroText = payload.support_intro_text?.trim() || null;
    const hiddenModuleIds = Array.from(new Set((payload.hidden_module_ids ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0)));
    const moduleDateOverrideMap = (payload.module_date_overrides ?? []).reduce((acc, entry) => {
      const moduleId = entry.module_id.trim();
      if (!moduleId) return acc;
      acc[moduleId] = entry.next_date;
      return acc;
    }, {} as Record<string, string>);
    const hiddenModuleIdsJson = JSON.stringify(hiddenModuleIds);
    const moduleDateOverridesJson = JSON.stringify(moduleDateOverrideMap);

    try {
      const passwordCandidate = payload.password?.trim() ?? '';
      const passwordHash = passwordCandidate ? await hashPassword(passwordCandidate) : null;

      const tx = db.transaction(() => {
        const existingClient = db.prepare(`
          select id
          from portal_client
          where company_id = ?
          limit 1
        `).get(req.params.id) as { id: string } | undefined;

        const portalClientId = existingClient?.id ?? uuid('pcli');
        if (existingClient) {
          db.prepare(`
            update portal_client
            set slug = ?, is_active = ?, support_intro_text = ?, hidden_module_ids_json = ?, module_date_overrides_json = ?, updated_at = ?
            where id = ?
          `).run(
            normalizedSlug,
            payload.is_active ? 1 : 0,
            normalizedSupportIntroText,
            hiddenModuleIdsJson,
            moduleDateOverridesJson,
            nowIso,
            portalClientId
          );
        } else {
          db.prepare(`
            insert into portal_client (
              id, company_id, slug, is_active, support_intro_text, hidden_module_ids_json, module_date_overrides_json, created_at, updated_at
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            portalClientId,
            req.params.id,
            normalizedSlug,
            payload.is_active ? 1 : 0,
            normalizedSupportIntroText,
            hiddenModuleIdsJson,
            moduleDateOverridesJson,
            nowIso,
            nowIso
          );
        }

        const existingUser = db.prepare(`
          select id, password_hash
          from portal_user
          where portal_client_id = ?
            and username = ?
          limit 1
        `).get(portalClientId, normalizedUsername) as { id: string; password_hash: string } | undefined;

        const currentUser = db.prepare(`
          select id, password_hash
          from portal_user
          where portal_client_id = ?
          order by is_active desc, datetime(updated_at) desc
          limit 1
        `).get(portalClientId) as { id: string; password_hash: string } | undefined;

        const resolvedPasswordHash = passwordHash
          ?? existingUser?.password_hash
          ?? currentUser?.password_hash
          ?? null;
        if (!resolvedPasswordHash) {
          throw new Error('Informe a senha do portal para concluir o cadastro inicial.');
        }

        db.prepare(`
          update portal_user
          set is_active = 0, updated_at = ?
          where portal_client_id = ?
        `).run(nowIso, portalClientId);

        if (existingUser) {
          db.prepare(`
            update portal_user
            set username = ?, password_hash = ?, is_active = 1, updated_at = ?
            where id = ?
          `).run(normalizedUsername, resolvedPasswordHash, nowIso, existingUser.id);
        } else {
          db.prepare(`
            insert into portal_user (
              id, portal_client_id, username, password_hash, is_active, last_login_at, created_at, updated_at
            ) values (?, ?, ?, ?, 1, null, ?, ?)
          `).run(uuid('pusr'), portalClientId, normalizedUsername, resolvedPasswordHash, nowIso, nowIso);
        }

        return portalClientId;
      });

      const portalClientId = tx();
      return res.json({ ok: true, portal_client_id: portalClientId });
    } catch (error) {
      return res.status(400).json({
        message: 'Nao foi possivel atualizar acesso do portal',
        detail: errorMessage(error)
      });
    }
  });
  
  app.patch('/companies/:companyId/progress/:moduleId', (req, res) => {
    const schema = z.object({
      status: z.enum(['Nao_iniciado', 'Planejado', 'Em_execucao', 'Concluido']).optional(),
      completed_at: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      custom_duration_days: z.number().int().positive().nullable().optional(),
      custom_units: z.number().int().nonnegative().nullable().optional()
    }).superRefine((data, context) => {
      if (
        typeof data.status === 'undefined'
        && typeof data.completed_at === 'undefined'
        && typeof data.notes === 'undefined'
        && typeof data.custom_duration_days === 'undefined'
        && typeof data.custom_units === 'undefined'
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['status'],
          message: 'Nenhum campo informado para atualização.'
        });
      }
    });
  
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const current = db.prepare(`
      select status, completed_at, notes, custom_duration_days, custom_units
      from company_module_progress
      where company_id = ? and module_id = ?
    `).get(req.params.companyId, req.params.moduleId) as {
      status: ModuleProgressStatus;
      completed_at: string | null;
      notes: string | null;
      custom_duration_days: number | null;
      custom_units: number | null;
    } | undefined;
  
    const nextStatus = (parsed.data.status ?? current?.status ?? 'Nao_iniciado') as ModuleProgressStatus;
    let nextCompletedAt = current?.completed_at ?? null;
    if (typeof parsed.data.status !== 'undefined') {
      nextCompletedAt = nextStatus === 'Concluido'
        ? (parsed.data.completed_at ?? current?.completed_at ?? nowDateIso())
        : null;
    } else if (typeof parsed.data.completed_at !== 'undefined') {
      nextCompletedAt = parsed.data.completed_at ?? null;
    }
  
    const nextNotes = typeof parsed.data.notes !== 'undefined'
      ? parsed.data.notes ?? null
      : (current?.notes ?? null);
    const nextCustomDuration = typeof parsed.data.custom_duration_days !== 'undefined'
      ? parsed.data.custom_duration_days
      : (current?.custom_duration_days ?? null);
    const nextCustomUnits = typeof parsed.data.custom_units !== 'undefined'
      ? parsed.data.custom_units
      : (current?.custom_units ?? null);
  
    if (typeof parsed.data.status !== 'undefined' && !hasModuleEnabled(req.params.companyId, req.params.moduleId)) {
      return res.status(400).json({ message: 'Módulo está desativado para esta empresa.' });
    }
  
    db.prepare(`
      insert into company_module_progress (id, company_id, module_id, status, completed_at, notes, custom_duration_days, custom_units)
      values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(company_id, module_id)
      do update set
        status = excluded.status,
        completed_at = excluded.completed_at,
        notes = excluded.notes,
        custom_duration_days = excluded.custom_duration_days,
        custom_units = excluded.custom_units
    `).run(
      uuid('prog'),
      req.params.companyId,
      req.params.moduleId,
      nextStatus,
      nextCompletedAt,
      nextNotes,
      nextCustomDuration ?? null,
      nextCustomUnits ?? null
    );
  
    res.json({
      ok: true,
      status: nextStatus,
      completed_at: nextCompletedAt,
      notes: nextNotes,
      custom_duration_days: nextCustomDuration,
      custom_units: nextCustomUnits
    });
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
    if (!requireDestructiveConfirmation(req, res, 'excluir programa de licença')) {
      return;
    }
  
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
  
  app.get('/internal-documents', (_req, res) => {
    const rows = db.prepare(`
      select id, title, category, notes, file_name, mime_type, file_size_bytes, created_at, updated_at
      from internal_document
      order by date(updated_at) desc, title asc
    `).all();
    return res.json(rows);
  });
  
  app.post('/internal-documents', (req, res) => {
    const parsed = internalDocumentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    try {
      const payload = parsed.data;
      const decoded = decodeDataUrl(payload.file_data_base64);
      const documentId = uuid('doc');
      const nowIso = nowDateIso();
  
      db.prepare(`
        insert into internal_document (
          id, title, category, notes, file_name, mime_type, file_data_base64,
          file_size_bytes, created_at, updated_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        documentId,
        payload.title.trim(),
        payload.category?.trim() || null,
        payload.notes?.trim() || null,
        payload.file_name.trim(),
        payload.mime_type.trim() || decoded.mimeType,
        payload.file_data_base64,
        decoded.buffer.length,
        nowIso,
        nowIso
      );
  
      return res.status(201).json({ id: documentId });
    } catch (error) {
      return res.status(400).json({ message: 'Não foi possível cadastrar documento.', detail: errorMessage(error) });
    }
  });
  
  app.get('/internal-documents/:id/download', (req, res) => {
    const row = db.prepare(`
      select file_name, mime_type, file_data_base64
      from internal_document
      where id = ?
    `).get(req.params.id) as {
      file_name: string;
      mime_type: string;
      file_data_base64: string;
    } | undefined;
  
    if (!row) {
      return res.status(404).json({ message: 'Documento não encontrado.' });
    }
  
    try {
      const decoded = decodeDataUrl(row.file_data_base64);
      const mimeType = row.mime_type?.trim() || decoded.mimeType || 'application/octet-stream';
      const encodedFileName = encodeURIComponent(row.file_name);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
      return res.send(decoded.buffer);
    } catch (error) {
      return res.status(500).json({ message: 'Arquivo corrompido.', detail: errorMessage(error) });
    }
  });
  
  app.delete('/internal-documents/:id', (req, res) => {
    if (!requireDestructiveConfirmation(req, res, 'excluir documento interno')) {
      return;
    }
  
    const exists = db.prepare('select id from internal_document where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!exists) {
      return res.status(404).json({ message: 'Documento não encontrado.' });
    }
  
    db.prepare('delete from internal_document where id = ?').run(req.params.id);
    return res.json({ ok: true });
  });
  
  app.get('/licenses', (_req, res) => {
    const rows = db.prepare(`
      select l.id, l.company_id, c.name as company_name,
        l.program_id, coalesce(lp.name, l.name) as program_name,
        l.user_name, l.module_list, l.license_identifier,
        (
          select group_concat(clm.module_id, '|')
          from company_license_module clm
          where clm.license_id = l.id
        ) as module_ids_raw,
        (
          select group_concat(mt.name, ' | ')
          from company_license_module clm2
          join module_template mt on mt.id = clm2.module_id
          where clm2.license_id = l.id
          order by mt.code asc
        ) as module_list_from_modules,
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
      module_ids_raw: string | null;
      module_list_from_modules: string | null;
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
        module_ids: row.module_ids_raw
          ? row.module_ids_raw.split('|').map((item) => item.trim()).filter(Boolean)
          : [],
        module_list: row.module_list_from_modules ?? row.module_list ?? '',
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
    const moduleSelection = normalizeLicenseModuleSelection({
      module_ids: payload.module_ids,
      module_list: payload.module_list
    });
  
    const nowIso = nowDateIso();
    const id = uuid('lic');
    try {
      const tx = db.transaction(() => {
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
          moduleSelection.moduleListText,
          payload.license_identifier.trim(),
          payload.renewal_cycle,
          payload.expires_at,
          payload.notes ?? null,
          nowIso,
          nowIso
        );
        syncLicenseModules(id, moduleSelection.moduleIds);
      });
      tx();
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
  
    let moduleSelection: { moduleIds: string[]; moduleListText: string } | null = null;
    if (typeof parsed.data.module_ids !== 'undefined' || typeof parsed.data.module_list !== 'undefined') {
      if ((parsed.data.module_ids?.length ?? 0) === 0 && !parsed.data.module_list?.trim()) {
        return res.status(400).json({ message: 'Informe ao menos um módulo da licença.' });
      }
      moduleSelection = normalizeLicenseModuleSelection({
        module_ids: parsed.data.module_ids,
        module_list: parsed.data.module_list
      });
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
    if (moduleSelection) {
      fields.push('module_list = ?');
      values.push(moduleSelection.moduleListText);
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
      const tx = db.transaction(() => {
        db.prepare(`update company_license set ${fields.join(', ')} where id = ?`).run(...values);
        if (moduleSelection) {
          syncLicenseModules(req.params.id, moduleSelection.moduleIds);
        }
      });
      tx();
      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ message: 'Não foi possível atualizar licença', detail: errorMessage(error) });
    }
  });
  
  app.delete('/licenses/:id', (req, res) => {
    if (!requireDestructiveConfirmation(req, res, 'excluir licença')) {
      return;
    }
  
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
      select t.id, t.name, t.availability_notes, t.hourly_cost,
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
      hourly_cost: z.number().min(0).nullable().optional(),
      module_ids: z.array(z.string()).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const technicianId = uuid('tech');
    const tx = db.transaction(() => {
      db.prepare(`
        insert into technician (id, name, availability_notes, hourly_cost)
        values (?, ?, ?, ?)
      `).run(
        technicianId,
        parsed.data.name.trim(),
        parsed.data.availability_notes ?? null,
        parsed.data.hourly_cost ?? null
      );
  
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
      hourly_cost: z.number().min(0).nullable().optional(),
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
    if (Object.prototype.hasOwnProperty.call(payload, 'hourly_cost')) {
      fields.push('hourly_cost = ?');
      values.push(payload.hourly_cost ?? null);
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
    if (!requireDestructiveConfirmation(req, res, 'excluir técnico')) {
      return;
    }
  
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
  
  app.get('/implementation/kanban', (_req, res) => {
    const columns = db.prepare(`
      select id, title, color, position, created_at, updated_at
      from implementation_kanban_column
      order by position asc, created_at asc
    `).all() as Array<{
      id: string;
      title: string;
      color: string | null;
      position: number;
      created_at: string;
      updated_at: string;
    }>;
  
    if (columns.length === 0) {
      const nowIso = nowDateIso();
      const insert = db.prepare(`
        insert into implementation_kanban_column (id, title, color, position, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?)
      `);
      IMPLEMENTATION_KANBAN_DEFAULT_COLUMNS.forEach((column, index) => {
        insert.run(column.id, column.title, column.color, index, nowIso, nowIso);
      });
    }
  
    const hydratedColumns = (columns.length === 0
      ? db.prepare(`
        select id, title, color, position, created_at, updated_at
        from implementation_kanban_column
        order by position asc, created_at asc
      `).all()
      : columns) as Array<{
        id: string;
        title: string;
        color: string | null;
        position: number;
        created_at: string;
        updated_at: string;
      }>;
  
    const cards = db.prepare(`
      select
        id,
        title,
        description,
        column_id,
        client_name,
        license_name,
        module_name,
        technician_id,
        subcategory,
        support_resolution,
        support_third_party_notes,
        support_handoff_target,
        support_handoff_date,
        priority,
        due_date,
        attachment_image_data_url,
        position,
        created_at,
        updated_at
      from implementation_kanban_card
      order by position asc, created_at asc
    `).all() as Array<{
      id: string;
      title: string;
      description: string | null;
      column_id: string | null;
      client_name: string | null;
      license_name: string | null;
      module_name: string | null;
      technician_id: string | null;
      subcategory: (typeof KANBAN_SUBCATEGORY_VALUES)[number] | null;
      support_resolution: string | null;
      support_third_party_notes: string | null;
      support_handoff_target: (typeof KANBAN_SUPPORT_HANDOFF_VALUES)[number] | null;
      support_handoff_date: string | null;
      priority: string;
      due_date: string | null;
      attachment_image_data_url: string | null;
      position: number;
      created_at: string;
      updated_at: string;
    }>;
  
    const columnById = new Map(hydratedColumns.map((column) => [column.id, column]));
    const today = new Date(`${nowDateIso()}T00:00:00`);
    const cardsWithSupportAlerts = cards.map((card) => {
      let support_alert_level: 'none' | 'stale' | 'done' = 'none';
      let support_alert_message: string | null = null;
  
      if (card.subcategory === 'Suporte') {
        const columnTitle = (columnById.get(card.column_id ?? '')?.title ?? '').toLowerCase();
        const isConcluded = columnTitle.includes('conclu');
        const hasSupportResolution = Boolean(card.support_resolution?.trim());
        if (isConcluded) {
          if (!hasSupportResolution) {
            support_alert_level = 'done';
            support_alert_message = 'Suporte concluído sem resolução registrada.';
          }
        } else {
          const updatedAt = new Date(`${card.updated_at}T00:00:00`);
          if (!Number.isNaN(updatedAt.getTime())) {
            const diffMs = today.getTime() - updatedAt.getTime();
            const diffDays = Math.floor(diffMs / 86_400_000);
            if (diffDays >= 2) {
              support_alert_level = 'stale';
              support_alert_message = `Suporte sem atualização há ${diffDays} dia(s).`;
            }
          }
        }
      }
  
      return {
        ...card,
        support_alert_level,
        support_alert_message
      };
    });
  
    res.json({
      columns: hydratedColumns.map((column) => ({
        ...column,
        cards: cardsWithSupportAlerts.filter((card) => card.column_id === column.id)
      }))
    });
  });
  
  app.post('/implementation/kanban/cards', (req, res) => {
    const parsed = kanbanCardCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const payload = parsed.data;
    const column = db.prepare('select id from implementation_kanban_column where id = ?').get(payload.column_id) as { id: string } | undefined;
    if (!column) {
      return res.status(404).json({ message: 'Coluna não encontrada.' });
    }
    if (payload.technician_id) {
      const technician = db.prepare('select id from technician where id = ?').get(payload.technician_id) as { id: string } | undefined;
      if (!technician) {
        return res.status(404).json({ message: 'Técnico não encontrado.' });
      }
    }
  
    const cardId = uuid('kbn');
    const nowIso = nowDateIso();
    const supportHandoffTarget = payload.subcategory === 'Suporte'
      ? (payload.support_handoff_target ?? null)
      : null;
    const supportHandoffDate = supportHandoffTarget === 'Sao_Paulo'
      ? (payload.support_handoff_date ?? nowIso)
      : null;
    const nextPositionRow = db.prepare(`
      select coalesce(max(position), -1) + 1 as next_position
      from implementation_kanban_card
      where column_id = ?
    `).get(payload.column_id) as { next_position: number };
  
    try {
      db.prepare(`
        insert into implementation_kanban_card (
          id, title, description, status, column_id, client_name, license_name, module_name, technician_id, subcategory,
          support_resolution, support_third_party_notes, support_handoff_target, support_handoff_date, priority, due_date,
          attachment_image_data_url, position, created_at, updated_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cardId,
        payload.title.trim(),
        payload.description?.trim() || null,
        'Todo',
        payload.column_id,
        payload.client_name?.trim() || null,
        payload.license_name?.trim() || null,
        payload.module_name?.trim() || null,
        payload.technician_id?.trim() || null,
        payload.subcategory ?? null,
        payload.support_resolution?.trim() || null,
        payload.support_third_party_notes?.trim() || null,
        supportHandoffTarget,
        supportHandoffDate,
        payload.priority ?? 'Normal',
        payload.due_date ?? null,
        payload.attachment_image_data_url ?? null,
        nextPositionRow.next_position,
        nowIso,
        nowIso
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Falha ao criar cartão.';
      return res.status(500).json({ message: 'Erro ao criar cartão.', detail });
    }
  
    return res.status(201).json({ id: cardId });
  });
  
  app.patch('/implementation/kanban/cards/:id', (req, res) => {
    const parsed = kanbanCardUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const exists = db.prepare(`
      select id, subcategory, support_handoff_target, support_handoff_date
      from implementation_kanban_card
      where id = ?
    `).get(req.params.id) as {
      id: string;
      subcategory: (typeof KANBAN_SUBCATEGORY_VALUES)[number] | null;
      support_handoff_target: (typeof KANBAN_SUPPORT_HANDOFF_VALUES)[number] | null;
      support_handoff_date: string | null;
    } | undefined;
    if (!exists) {
      return res.status(404).json({ message: 'Card não encontrado' });
    }
  
    const payload = parsed.data;
    const nextSubcategory = Object.prototype.hasOwnProperty.call(payload, 'subcategory')
      ? (payload.subcategory ?? null)
      : (exists.subcategory ?? null);
    const isSupportCard = nextSubcategory === 'Suporte';
    const requestedHandoffTarget = Object.prototype.hasOwnProperty.call(payload, 'support_handoff_target')
      ? (payload.support_handoff_target ?? null)
      : (exists.support_handoff_target ?? null);
    const requestedHandoffDate = Object.prototype.hasOwnProperty.call(payload, 'support_handoff_date')
      ? (payload.support_handoff_date ?? null)
      : (exists.support_handoff_date ?? null);
    let normalizedHandoffTarget = isSupportCard ? requestedHandoffTarget : null;
    let normalizedHandoffDate = isSupportCard ? requestedHandoffDate : null;
    if (normalizedHandoffTarget === 'Sao_Paulo' && !normalizedHandoffDate) {
      normalizedHandoffDate = nowDateIso();
    }
    if (normalizedHandoffTarget !== 'Sao_Paulo') {
      normalizedHandoffDate = null;
    }
  
    const fields: string[] = [];
    const values: unknown[] = [];
  
    if (typeof payload.title === 'string') {
      fields.push('title = ?');
      values.push(payload.title.trim());
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
      fields.push('description = ?');
      values.push(payload.description?.trim() || null);
    }
    if (typeof payload.column_id === 'string') {
      const column = db.prepare('select id from implementation_kanban_column where id = ?').get(payload.column_id) as { id: string } | undefined;
      if (!column) {
        return res.status(404).json({ message: 'Coluna não encontrada.' });
      }
      fields.push('column_id = ?');
      values.push(payload.column_id);
    }
    if (typeof payload.position === 'number') {
      fields.push('position = ?');
      values.push(payload.position);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'client_name')) {
      fields.push('client_name = ?');
      values.push(payload.client_name?.trim() || null);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'license_name')) {
      fields.push('license_name = ?');
      values.push(payload.license_name?.trim() || null);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'module_name')) {
      fields.push('module_name = ?');
      values.push(payload.module_name?.trim() || null);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'technician_id')) {
      const technicianId = payload.technician_id?.trim() || null;
      if (technicianId) {
        const technician = db.prepare('select id from technician where id = ?').get(technicianId) as { id: string } | undefined;
        if (!technician) {
          return res.status(404).json({ message: 'Técnico não encontrado.' });
        }
      }
      fields.push('technician_id = ?');
      values.push(technicianId);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'subcategory')) {
      fields.push('subcategory = ?');
      values.push(payload.subcategory ?? null);
      if (payload.subcategory !== 'Suporte') {
        fields.push('support_resolution = ?');
        values.push(null);
        fields.push('support_third_party_notes = ?');
        values.push(null);
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'support_resolution')) {
      fields.push('support_resolution = ?');
      values.push(payload.support_resolution?.trim() || null);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'support_third_party_notes')) {
      fields.push('support_third_party_notes = ?');
      values.push(payload.support_third_party_notes?.trim() || null);
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, 'subcategory') ||
      Object.prototype.hasOwnProperty.call(payload, 'support_handoff_target') ||
      Object.prototype.hasOwnProperty.call(payload, 'support_handoff_date')
    ) {
      fields.push('support_handoff_target = ?');
      values.push(normalizedHandoffTarget);
      fields.push('support_handoff_date = ?');
      values.push(normalizedHandoffDate);
    }
    if (typeof payload.priority === 'string') {
      fields.push('priority = ?');
      values.push(payload.priority);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'due_date')) {
      fields.push('due_date = ?');
      values.push(payload.due_date ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'attachment_image_data_url')) {
      fields.push('attachment_image_data_url = ?');
      values.push(payload.attachment_image_data_url ?? null);
    }
  
    fields.push('updated_at = ?');
    values.push(nowDateIso());
    values.push(req.params.id);
  
    db.prepare(`update implementation_kanban_card set ${fields.join(', ')} where id = ?`).run(...values);
    return res.json({ ok: true });
  });
  
  app.post('/implementation/kanban/reorder', (req, res) => {
    const parsed = kanbanBoardReorderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const columns = db.prepare('select id from implementation_kanban_column').all() as Array<{ id: string }>;
    const columnIdSet = new Set(columns.map((column) => column.id));
    if (parsed.data.columns.some((column) => !columnIdSet.has(column.column_id))) {
      return res.status(400).json({ message: 'Board inválido: contém coluna inexistente.' });
    }
  
    const cards = db.prepare('select id from implementation_kanban_card').all() as Array<{ id: string }>;
    const cardIdSet = new Set(cards.map((card) => card.id));
    const providedCardIds = parsed.data.columns.flatMap((column) => column.card_ids);
    if (providedCardIds.some((cardId) => !cardIdSet.has(cardId))) {
      return res.status(400).json({ message: 'Board inválido: contém card inexistente.' });
    }
    if (new Set(providedCardIds).size !== providedCardIds.length) {
      return res.status(400).json({ message: 'Board inválido: card duplicado entre colunas.' });
    }
  
    const tx = db.transaction(() => {
      const update = db.prepare(`
        update implementation_kanban_card
        set column_id = ?, position = ?, updated_at = ?
        where id = ?
      `);
      const nowIso = nowDateIso();
      parsed.data.columns.forEach((column) => {
        column.card_ids.forEach((cardId, index) => {
          update.run(column.column_id, index, nowIso, cardId);
        });
      });
    });
  
    tx();
    return res.json({ ok: true });
  });
  
  app.post('/implementation/kanban/columns', (req, res) => {
    const parsed = kanbanColumnCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const payload = parsed.data;
    const columnId = uuid('kcol');
    const nextPosition = db.prepare(`
      select coalesce(max(position), -1) + 1 as next_position
      from implementation_kanban_column
    `).get() as { next_position: number };
    const nowIso = nowDateIso();
    db.prepare(`
      insert into implementation_kanban_column (id, title, color, position, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?)
    `).run(
      columnId,
      payload.title.trim(),
      payload.color ?? '#7b8ea8',
      nextPosition.next_position,
      nowIso,
      nowIso
    );
  
    return res.status(201).json({ id: columnId });
  });
  
  app.patch('/implementation/kanban/columns/:id', (req, res) => {
    const parsed = kanbanColumnUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const exists = db.prepare('select id from implementation_kanban_column where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!exists) {
      return res.status(404).json({ message: 'Coluna não encontrada.' });
    }
  
    const payload = parsed.data;
    const fields: string[] = [];
    const values: unknown[] = [];
    if (typeof payload.title === 'string') {
      fields.push('title = ?');
      values.push(payload.title.trim());
    }
    if (typeof payload.color === 'string') {
      fields.push('color = ?');
      values.push(payload.color);
    }
    if (typeof payload.position === 'number') {
      fields.push('position = ?');
      values.push(payload.position);
    }
    fields.push('updated_at = ?');
    values.push(nowDateIso());
    values.push(req.params.id);
  
    db.prepare(`update implementation_kanban_column set ${fields.join(', ')} where id = ?`).run(...values);
    return res.json({ ok: true });
  });
  
  app.post('/implementation/kanban/columns/reorder', (req, res) => {
    const parsed = kanbanColumnReorderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const columns = db.prepare('select id from implementation_kanban_column').all() as Array<{ id: string }>;
    const existingColumnIdSet = new Set(columns.map((column) => column.id));
    if (parsed.data.column_ids.some((columnId) => !existingColumnIdSet.has(columnId))) {
      return res.status(400).json({ message: 'Ordem inválida: coluna não encontrada.' });
    }
    if (new Set(parsed.data.column_ids).size !== parsed.data.column_ids.length) {
      return res.status(400).json({ message: 'Ordem inválida: coluna duplicada.' });
    }
  
    const tx = db.transaction(() => {
      const update = db.prepare(`
        update implementation_kanban_column
        set position = ?, updated_at = ?
        where id = ?
      `);
      const nowIso = nowDateIso();
      parsed.data.column_ids.forEach((columnId, index) => {
        update.run(index, nowIso, columnId);
      });
    });
    tx();
    return res.json({ ok: true });
  });
  
  app.delete('/implementation/kanban/columns/:id', (req, res) => {
    if (!requireDestructiveConfirmation(req, res, 'excluir coluna do kanban')) {
      return;
    }
  
    const exists = db.prepare('select id from implementation_kanban_column where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!exists) {
      return res.status(404).json({ message: 'Coluna não encontrada.' });
    }
  
    const cardCount = db.prepare(`
      select count(*) as count
      from implementation_kanban_card
      where column_id = ?
    `).get(req.params.id) as { count: number };
    if (cardCount.count > 0) {
      return res.status(400).json({ message: 'Coluna possui cards. Mova ou exclua os cards antes de remover a coluna.' });
    }
  
    const totalColumns = db.prepare('select count(*) as count from implementation_kanban_column').get() as { count: number };
    if (totalColumns.count <= 1) {
      return res.status(400).json({ message: 'O kanban precisa de pelo menos uma coluna.' });
    }
  
    db.prepare('delete from implementation_kanban_column where id = ?').run(req.params.id);
    return res.json({ ok: true });
  });
  
  app.delete('/implementation/kanban/cards/:id', (req, res) => {
    if (!requireDestructiveConfirmation(req, res, 'excluir card do kanban')) {
      return;
    }
  
    const exists = db.prepare('select id from implementation_kanban_card where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!exists) {
      return res.status(404).json({ message: 'Card não encontrado' });
    }
  
    db.prepare('delete from implementation_kanban_card where id = ?').run(req.params.id);
    return res.json({ ok: true });
  });
  
  app.get('/recruitment/candidates', (_req, res) => {
    const rows = db.prepare(`
      select id, name, process_status, stage, strengths, concerns, specialties,
        equipment_notes, career_plan, notes, created_at, updated_at
      from recruitment_candidate
      order by
        case process_status
          when 'Aprovado' then 1
          when 'Em_processo' then 2
          when 'Stand_by' then 3
          when 'Banco_de_talentos' then 4
          when 'Reprovado' then 5
          else 9
        end asc,
        date(updated_at) desc,
        name asc
    `).all();
    res.json(rows);
  });
  
  app.post('/recruitment/candidates', (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      process_status: z.enum(RECRUITMENT_STATUS_VALUES).default('Em_processo'),
      stage: z.enum(RECRUITMENT_STAGE_VALUES).default('Triagem'),
      strengths: z.string().nullable().optional(),
      concerns: z.string().nullable().optional(),
      specialties: z.string().nullable().optional(),
      equipment_notes: z.string().nullable().optional(),
      career_plan: z.string().nullable().optional(),
      notes: z.string().nullable().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const id = uuid('cand');
    const nowIso = nowDateIso();
    try {
      db.prepare(`
        insert into recruitment_candidate (
          id, name, process_status, stage, strengths, concerns, specialties,
          equipment_notes, career_plan, notes, created_at, updated_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        parsed.data.name.trim(),
        parsed.data.process_status,
        parsed.data.stage,
        parsed.data.strengths?.trim() || null,
        parsed.data.concerns?.trim() || null,
        parsed.data.specialties?.trim() || null,
        parsed.data.equipment_notes?.trim() || null,
        parsed.data.career_plan?.trim() || null,
        parsed.data.notes?.trim() || null,
        nowIso,
        nowIso
      );
      return res.status(201).json({ id });
    } catch (error) {
      return res.status(400).json({ message: 'Não foi possível cadastrar candidato', detail: errorMessage(error) });
    }
  });
  
  app.patch('/recruitment/candidates/:id', (req, res) => {
    const schema = z.object({
      name: z.string().min(2).optional(),
      process_status: z.enum(RECRUITMENT_STATUS_VALUES).optional(),
      stage: z.enum(RECRUITMENT_STAGE_VALUES).optional(),
      strengths: z.string().nullable().optional(),
      concerns: z.string().nullable().optional(),
      specialties: z.string().nullable().optional(),
      equipment_notes: z.string().nullable().optional(),
      career_plan: z.string().nullable().optional(),
      notes: z.string().nullable().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
  
    const fields: string[] = [];
    const values: unknown[] = [];
    if (typeof parsed.data.name !== 'undefined') {
      fields.push('name = ?');
      values.push(parsed.data.name.trim());
    }
    if (typeof parsed.data.process_status !== 'undefined') {
      fields.push('process_status = ?');
      values.push(parsed.data.process_status);
    }
    if (typeof parsed.data.stage !== 'undefined') {
      fields.push('stage = ?');
      values.push(parsed.data.stage);
    }
    if (typeof parsed.data.strengths !== 'undefined') {
      fields.push('strengths = ?');
      values.push(parsed.data.strengths?.trim() || null);
    }
    if (typeof parsed.data.concerns !== 'undefined') {
      fields.push('concerns = ?');
      values.push(parsed.data.concerns?.trim() || null);
    }
    if (typeof parsed.data.specialties !== 'undefined') {
      fields.push('specialties = ?');
      values.push(parsed.data.specialties?.trim() || null);
    }
    if (typeof parsed.data.equipment_notes !== 'undefined') {
      fields.push('equipment_notes = ?');
      values.push(parsed.data.equipment_notes?.trim() || null);
    }
    if (typeof parsed.data.career_plan !== 'undefined') {
      fields.push('career_plan = ?');
      values.push(parsed.data.career_plan?.trim() || null);
    }
    if (typeof parsed.data.notes !== 'undefined') {
      fields.push('notes = ?');
      values.push(parsed.data.notes?.trim() || null);
    }
  
    if (fields.length === 0) {
      return res.json({ ok: true });
    }
  
    fields.push('updated_at = ?');
    values.push(nowDateIso());
    values.push(req.params.id);
  
    try {
      const result = db.prepare(`update recruitment_candidate set ${fields.join(', ')} where id = ?`).run(...values);
      if (result.changes === 0) {
        return res.status(404).json({ message: 'Candidato não encontrado' });
      }
      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ message: 'Não foi possível atualizar candidato', detail: errorMessage(error) });
    }
  });
  
  app.delete('/recruitment/candidates/:id', (req, res) => {
    if (!requireDestructiveConfirmation(req, res, 'excluir candidato')) {
      return;
    }
  
    const exists = db.prepare('select id from recruitment_candidate where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!exists) {
      return res.status(404).json({ message: 'Candidato não encontrado' });
    }
  
    db.prepare('delete from recruitment_candidate where id = ?').run(req.params.id);
    return res.json({ ok: true });
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
    if (!requireDestructiveConfirmation(req, res, 'excluir módulo')) {
      return;
    }
  
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
      confirmation_phrase: z.string().optional(),
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
  
    if (!hasDestructiveConfirmation(parsed.data.confirmation_phrase)) {
      return res.status(400).json({
        message: `Confirmação obrigatória ausente. Digite exatamente ${DESTRUCTIVE_CONFIRMATION_PHRASE} para aplicar base atual.`
      });
    }
  
    const { clients, modules } = parsed.data;
    const summary = {
      clients_upserted: 0,
      modules_upserted: 0,
      progress_rows_created: 0
    };
  
      const tx = db.transaction(() => {
        const upsertCompany = db.prepare(`
        insert into company (id, name, status, notes, priority, priority_level, modality)
        values (?, ?, 'Em_treinamento', null, 70, 'Normal', 'Turma_Online')
        on conflict(name) do update set
          status = 'Em_treinamento',
          priority = 70,
          priority_level = 'Normal',
          modality = 'Turma_Online'
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
  
  app.post('/admin/bootstrap-real-scenario', (req, res) => {
    const schema = z.object({
      confirmation_phrase: z.string().optional()
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    if (!hasDestructiveConfirmation(parsed.data.confirmation_phrase)) {
      return res.status(400).json({
        message: `Confirmação obrigatória ausente. Digite exatamente ${DESTRUCTIVE_CONFIRMATION_PHRASE} para prosseguir.`
      });
    }
  
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
        insert into company (id, name, status, notes, priority, priority_level, modality)
        values (?, ?, 'Em_treinamento', null, 70, 'Normal', 'Turma_Online')
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
      reset_data: z.boolean().optional(),
      confirmation_phrase: z.string().optional()
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
    const shouldResetData = parsed.data.reset_data ?? false;
    if (shouldResetData && !hasDestructiveConfirmation(parsed.data.confirmation_phrase)) {
      return res.status(400).json({
        message: `Confirmação obrigatória ausente. Digite exatamente ${DESTRUCTIVE_CONFIRMATION_PHRASE} para limpar e importar.`
      });
    }
  
    try {
      const summary = importWorkbook(absolutePath, { resetData: shouldResetData });
      return res.json({ ok: true, summary });
    } catch (error) {
      return res.status(500).json({ message: 'Falha ao importar planilha', detail: errorMessage(error) });
    }
  });
}
