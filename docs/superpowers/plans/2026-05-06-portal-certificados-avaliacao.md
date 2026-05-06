# Portal Certificados e Avaliação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client portal Certificates tab where deliverable certificates download directly and training certificates require one company-level evaluation per cohort/module before first download.

**Architecture:** The portal backend owns the certificate list, evaluation gate, and download authorization under `/portal/api`. Certificate PDF generation is shared with the existing internal certificate generator so filenames and document persistence stay consistent. The frontend adds a normal portal-styled certificates list and a full-page premium evaluation form.

**Tech Stack:** Express, better-sqlite3, Zod, React, React Router, Vite, TypeScript, existing portal auth/session APIs.

---

### Task 1: Database and Backend Contract

**Files:**
- Modify: `apps/backend/src/db.ts`
- Modify: `apps/backend/src/portal/routes.ts`
- Test: `apps/backend/src/portal/certificates.test.ts`

- [ ] **Step 1: Add `portal_certificate_evaluation` schema**

Create the table in `initDb()` near other portal tables:

```sql
create table if not exists portal_certificate_evaluation (
  id text primary key,
  company_id text not null,
  portal_client_id text not null,
  cohort_id text,
  module_id text not null,
  respondent_name text not null,
  answers_json text not null,
  created_at text not null,
  updated_at text not null,
  unique(company_id, cohort_id, module_id),
  foreign key(company_id) references company(id) on delete cascade,
  foreign key(portal_client_id) references portal_client(id) on delete cascade,
  foreign key(cohort_id) references cohort(id) on delete cascade,
  foreign key(module_id) references module_template(id) on delete cascade
);
```

Add an index:

```sql
create index if not exists idx_portal_certificate_evaluation_lookup
  on portal_certificate_evaluation(company_id, cohort_id, module_id);
```

- [ ] **Step 2: Add backend tests**

Create tests that seed a portal client, one concluded training allocation, one concluded deliverable module, and assert:

```ts
const list = await request(app)
  .get('/portal/api/certificates')
  .set('Authorization', `Bearer ${token}`);
assert.equal(list.body.items.find((item: any) => item.certificate_type === 'training').download_available, false);
assert.equal(list.body.items.find((item: any) => item.certificate_type === 'deliverable').download_available, true);
```

Add a POST test for evaluation:

```ts
const save = await request(app)
  .post(`/portal/api/certificates/${trainingId}/evaluation`)
  .set('Authorization', `Bearer ${token}`)
  .send({ respondent_name: 'Ana Martins', answers: { q1: 5, q2: 4 } });
assert.equal(save.status, 201);
```

Then assert the list returns `download_available: true`.

- [ ] **Step 3: Implement certificate list helpers**

In `portal/routes.ts`, encode certificate ids as:

```ts
function encodePortalCertificateId(parts: { type: 'training' | 'deliverable'; cohortId?: string | null; moduleId: string }) {
  return Buffer.from(JSON.stringify(parts), 'utf8').toString('base64url');
}
```

Read:

- training certificates from executed/concluded cohort allocations where module progress is `Concluido`;
- deliverable certificates from concluded `company_module_progress` joined to `module_template.delivery_mode = 'entregavel'`;
- evaluations from `portal_certificate_evaluation`.

- [ ] **Step 4: Add portal routes**

Add:

```ts
router.get('/certificates', requirePortalAuth, ...)
router.get('/certificates/:certificateId/evaluation', requirePortalAuth, ...)
router.post('/certificates/:certificateId/evaluation', requirePortalAuth, ...)
router.get('/certificates/:certificateId/download', requirePortalAuth, ...)
```

Download must return `403` for training certificates with no evaluation and allow deliverables directly.

### Task 2: Shared Certificate Generation

**Files:**
- Modify: `apps/backend/src/coreRoutes.ts`
- Modify: `apps/backend/src/portal/routes.ts`

- [ ] **Step 1: Export a shared generator from `coreRoutes.ts`**

Extract the existing `/companies/:companyId/modules/:moduleId/certificate` generation into:

```ts
export async function buildCompanyModuleCertificate(args: {
  companyId: string;
  moduleId: string;
  format?: 'pdf' | 'html';
  download?: boolean;
}): Promise<{ buffer: Buffer | string; contentType: string; fileName: string }>;
```

Keep the filename as:

```ts
`Certificado - ${normalizeFileLabelPart(company.name)} - ${normalizeFileLabelPart(moduleFileLabel)}.pdf`
```

- [ ] **Step 2: Use the shared generator in portal download**

In the portal download route, after authorization/evaluation checks:

```ts
const certificate = await buildCompanyModuleCertificate({
  companyId: context.company_id,
  moduleId: resolved.module_id,
  format: 'pdf',
  download: true
});
res.setHeader('Content-Type', certificate.contentType);
res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(certificate.fileName)}`);
return res.send(certificate.buffer);
```

### Task 3: Frontend Portal Certificates

**Files:**
- Modify: `apps/frontend/src/portal/types.ts`
- Modify: `apps/frontend/src/portal/api.ts`
- Modify: `apps/frontend/src/portal/PortalShell.tsx`
- Create: `apps/frontend/src/portal/pages/PortalCertificatesPage.tsx`
- Create: `apps/frontend/src/portal/pages/PortalCertificateEvaluationPage.tsx`
- Modify: `apps/frontend/src/styles.css`
- Test: `apps/frontend/src/portal/__tests__/PortalCertificatesPage.test.tsx`

- [ ] **Step 1: Add types and API methods**

Add `PortalCertificateItem`, `PortalCertificateEvaluation`, and client methods:

```ts
certificates: () => Promise<{ items: PortalCertificateItem[] }>;
certificateEvaluation: (certificateId: string) => Promise<PortalCertificateEvaluation>;
submitCertificateEvaluation: (certificateId: string, payload: PortalCertificateEvaluationSubmitPayload) => Promise<{ ok: boolean }>;
certificateDownloadUrl: (certificateId: string) => string;
```

- [ ] **Step 2: Add portal routes and nav**

Add nav link `Certificados`, route `certificados`, and route `certificados/:certificateId/avaliacao`.

- [ ] **Step 3: Build list page**

Render normal portal panel styling with cards:

- training pending: `Responder avaliação`;
- training released: `Baixar PDF`;
- deliverable released: `Baixar PDF`.

- [ ] **Step 4: Build evaluation page**

Render full-page premium dark evaluation styling inside portal main, with locked metadata and required `Respondido por`.

- [ ] **Step 5: Add CSS**

Use current portal styles for the list and scoped `.portal-evaluation-*` styles for the premium page.

### Task 4: Verification

**Files:**
- All touched files

- [ ] **Step 1: Backend build**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --workspace apps/backend run build
```

Expected: `tsc` exits `0`.

- [ ] **Step 2: Frontend build**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --workspace apps/frontend run build
```

Expected: `tsc -b && vite build` exits `0`.

- [ ] **Step 3: Targeted tests**

Run targeted portal/frontend tests where possible. If native SQLite fails, report the exact `better-sqlite3` mismatch.

- [ ] **Step 4: Manual localhost check**

Keep backend on `4000` and frontend on `5174`, then verify the portal nav shows `Certificados`.
