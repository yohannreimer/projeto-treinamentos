# Licencas Alertas de Vencimento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make license expirations visible in the sidebar and license page using a single 15-day attention window for every renewal cycle.

**Architecture:** Keep the license alert calculation in the backend so the sidebar and Licencas page share one rule. Add a light summary endpoint for navigation, keep `GET /licenses` as the complete page payload, and extend the existing nav badge pattern with a secondary detail line. The frontend polls the license summary alongside the existing operational alert polling.

**Tech Stack:** Express, zod, better-sqlite3, node:test, React, Vite, TypeScript, Vitest, Testing Library.

---

## File Structure

- Modify `apps/backend/src/coreRoutes.ts`: centralize license alert decoration, change alert window to 15 days, add `GET /licenses/alerts-summary`.
- Modify `apps/backend/src/licenses.test.ts`: cover 15-day alert behavior and summary counts.
- Modify `apps/frontend/src/types/index.ts`: add license alert summary types.
- Modify `apps/frontend/src/services/api.ts`: add `licenseAlertsSummary()`.
- Modify `apps/frontend/src/auth/navigation.ts`: add nav item detail text support.
- Modify `apps/frontend/src/App.tsx`: fetch license alert summary and attach badge/detail to the Licencas nav item.
- Modify `apps/frontend/src/components/Layout.tsx`: render secondary nav detail text.
- Modify `apps/frontend/src/components/Layout.test.tsx`: verify secondary nav detail rendering.
- Modify `apps/frontend/src/pages/LicensesPage.tsx`: update top summary cards to the 15-day model.
- Modify `apps/frontend/src/pages/LicensesPage.test.tsx`: verify the 15-day summary language on the page.
- Modify `apps/frontend/src/styles.css`: style the sidebar detail line and the clearer license summary cards.

---

### Task 1: Backend Alert Contract Tests

**Files:**
- Modify: `apps/backend/src/licenses.test.ts`

- [ ] **Step 1: Update the existing renewal-cycle test expectation**

In `apps/backend/src/licenses.test.ts`, inside `test('licenses support intermediate renewal cycles with matching renewal duration', async () => { ... })`, replace the two alert assertions after `GET /licenses`:

```ts
  assert.equal(list.body.rows[0].alert_window_days, 15);
  assert.equal(list.body.rows[0].warning_message, 'Renovação bimestral em 7 dia(s).');
```

This confirms the renewal duration stays bimestral while the alert window becomes 15 days.

- [ ] **Step 2: Add a failing summary test**

Append this test to `apps/backend/src/licenses.test.ts`:

```ts
test('license alert summary uses a 15 day window for every renewal cycle', async () => {
  const dbPath = assignTestDbPath('licenses-alert-summary-15-days');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });
  const authHeader = await loginWithLicensesPermission(app);
  seedLicenseFixtures();

  const today = nowDateIso();
  const insertLicense = db.prepare(`
    insert into company_license (
      id, company_id, name, program_id, user_name, module_list, license_identifier,
      renewal_cycle, expires_at, notes, last_renewed_at, created_at, updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, null, null, ?, ?)
  `);

  insertLicense.run(
    'license-expired',
    'company-license-test',
    'TopSolid Teste',
    'program-license-test',
    'Usuario Expirado',
    'TopSolid Teste',
    'LIC-EXP',
    'Mensal',
    addDaysIso(today, -1),
    today,
    today
  );
  insertLicense.run(
    'license-annual-15',
    'company-license-test',
    'TopSolid Teste',
    'program-license-test',
    'Usuario Anual',
    'TopSolid Teste',
    'LIC-ANUAL-15',
    'Anual',
    addDaysIso(today, 15),
    today,
    today
  );
  insertLicense.run(
    'license-monthly-16',
    'company-license-test',
    'TopSolid Teste',
    'program-license-test',
    'Usuario Mensal',
    'TopSolid Teste',
    'LIC-MENSAL-16',
    'Mensal',
    addDaysIso(today, 16),
    today,
    today
  );

  const list = await request(app).get('/licenses').set(authHeader);
  assert.equal(list.status, 200);
  const annual = list.body.rows.find((row: any) => row.id === 'license-annual-15');
  const monthly = list.body.rows.find((row: any) => row.id === 'license-monthly-16');
  assert.equal(annual.alert_window_days, 15);
  assert.equal(annual.alert_level, 'Atenção');
  assert.equal(monthly.alert_window_days, 15);
  assert.equal(monthly.alert_level, 'Ok');

  const summary = await request(app).get('/licenses/alerts-summary').set(authHeader);
  assert.equal(summary.status, 200);
  assert.equal(summary.body.expired_count, 1);
  assert.equal(summary.body.due_soon_count, 1);
  assert.equal(summary.body.total_attention, 2);
  assert.equal(summary.body.next_expiration_at, addDaysIso(today, -1));
  assert.deepEqual(
    summary.body.urgent_items.map((item: any) => item.id),
    ['license-expired', 'license-annual-15']
  );

  cleanupDbFiles(dbPath);
});
```

- [ ] **Step 3: Run backend tests to verify RED**

Run:

```bash
cd apps/backend && npm test -- src/licenses.test.ts
```

Expected: FAIL because `alert_window_days` still differs by cycle and `/licenses/alerts-summary` does not exist.

---

### Task 2: Backend Shared Alert Calculation

**Files:**
- Modify: `apps/backend/src/coreRoutes.ts`
- Modify: `apps/backend/src/licenses.test.ts`

- [ ] **Step 1: Add shared alert types and constant**

In `apps/backend/src/coreRoutes.ts`, near the existing `type LicenseRenewalCycle` and `renewalAlertWindowDays`, replace the old alert-window function with a single constant and shared row types:

```ts
type LicenseRenewalCycle = 'Mensal' | 'Bimestral' | 'Trimestral' | 'Semestral' | 'Anual';
type LicenseAlertLevel = 'Ok' | 'Atenção' | 'Expirada';

const LICENSE_ALERT_WINDOW_DAYS = 15;

type RawLicenseRow = {
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
  renewal_cycle: LicenseRenewalCycle;
  expires_at: string;
  notes: string | null;
  last_renewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type NormalizedLicenseRow = RawLicenseRow & {
  user_name: string;
  module_ids: string[];
  module_list: string;
  license_identifier: string;
  alert_window_days: number;
  days_until_expiration: number;
  alert_level: LicenseAlertLevel;
  warning_message: string | null;
};

function renewalAlertWindowDays(_renewalCycle: LicenseRenewalCycle): number {
  return LICENSE_ALERT_WINDOW_DAYS;
}
```

- [ ] **Step 2: Extract the license query and decoration helpers**

Add these helpers immediately before the current `app.get('/licenses', (_req, res) => { ... })` route:

```ts
function selectLicenseRows(): RawLicenseRow[] {
  return db.prepare(`
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
  `).all() as RawLicenseRow[];
}

function normalizeLicenseRows(rows: RawLicenseRow[], today = nowDateIso()): NormalizedLicenseRow[] {
  return rows.map((row) => {
    const alertWindowDays = renewalAlertWindowDays(row.renewal_cycle);
    const daysUntilExpiration = dayDiff(today, row.expires_at);
    const alertLevel: LicenseAlertLevel = daysUntilExpiration < 0
      ? 'Expirada'
      : daysUntilExpiration <= alertWindowDays
        ? 'Atenção'
        : 'Ok';
    const warningMessage = alertLevel === 'Expirada'
      ? `Licença expirada há ${Math.abs(daysUntilExpiration)} dia(s).`
      : alertLevel === 'Atenção'
        ? `Renovação ${renewalCycleLabelLower(row.renewal_cycle)} em ${daysUntilExpiration} dia(s).`
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
}
```

- [ ] **Step 3: Add a summary builder**

Add this helper below `normalizeLicenseRows`:

```ts
function buildLicenseAlertPayload(normalized: NormalizedLicenseRow[]) {
  const expired = normalized.filter((row) => row.alert_level === 'Expirada');
  const dueSoon = normalized.filter((row) => row.alert_level === 'Atenção');
  const urgentRows = [...expired, ...dueSoon].sort((left, right) => {
    if (left.alert_level !== right.alert_level) {
      return left.alert_level === 'Expirada' ? -1 : 1;
    }
    return left.expires_at.localeCompare(right.expires_at);
  });

  return {
    expired,
    dueSoon,
    alerts: {
      expired,
      due_soon: dueSoon,
      monthly_due_soon: dueSoon.filter((row) => row.renewal_cycle === 'Mensal'),
      annual_due_soon: dueSoon.filter((row) => row.renewal_cycle === 'Anual'),
      total_attention: expired.length + dueSoon.length
    },
    summary: {
      expired_count: expired.length,
      due_soon_count: dueSoon.length,
      total_attention: expired.length + dueSoon.length,
      next_expiration_at: urgentRows[0]?.expires_at ?? null,
      urgent_items: urgentRows.slice(0, 5).map((row) => ({
        id: row.id,
        company_name: row.company_name,
        user_name: row.user_name,
        license_identifier: row.license_identifier,
        renewal_cycle: row.renewal_cycle,
        expires_at: row.expires_at,
        alert_level: row.alert_level,
        days_until_expiration: row.days_until_expiration,
        warning_message: row.warning_message
      }))
    }
  };
}
```

- [ ] **Step 4: Refactor `GET /licenses` and add `GET /licenses/alerts-summary`**

Replace the current `app.get('/licenses', (_req, res) => { ... })` route with:

```ts
  app.get('/licenses', (_req, res) => {
    const normalized = normalizeLicenseRows(selectLicenseRows());
    const alertPayload = buildLicenseAlertPayload(normalized);

    return res.json({
      rows: normalized,
      alerts: alertPayload.alerts,
      summary: alertPayload.summary
    });
  });

  app.get('/licenses/alerts-summary', (_req, res) => {
    const normalized = normalizeLicenseRows(selectLicenseRows());
    const alertPayload = buildLicenseAlertPayload(normalized);
    return res.json(alertPayload.summary);
  });
```

Keep `monthly_due_soon` and `annual_due_soon` in `GET /licenses` for compatibility with existing frontend code while moving the primary UI to `due_soon_count`.

- [ ] **Step 5: Run backend tests to verify GREEN**

Run:

```bash
cd apps/backend && npm test -- src/licenses.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit backend contract**

Run:

```bash
git add apps/backend/src/coreRoutes.ts apps/backend/src/licenses.test.ts
git commit -m "feat: add license alert summary"
```

---

### Task 3: Frontend API and Sidebar Data

**Files:**
- Modify: `apps/frontend/src/types/index.ts`
- Modify: `apps/frontend/src/services/api.ts`
- Modify: `apps/frontend/src/auth/navigation.ts`
- Modify: `apps/frontend/src/App.tsx`

- [ ] **Step 1: Add frontend summary types**

In `apps/frontend/src/types/index.ts`, after `export type LicenseRow`, add:

```ts
export type LicenseAlertSummaryItem = {
  id: string;
  company_name: string;
  user_name: string;
  license_identifier: string;
  renewal_cycle: LicenseRow['renewal_cycle'];
  expires_at: string;
  alert_level: LicenseRow['alert_level'];
  days_until_expiration: number;
  warning_message: string | null;
};

export type LicenseAlertSummary = {
  expired_count: number;
  due_soon_count: number;
  total_attention: number;
  next_expiration_at: string | null;
  urgent_items: LicenseAlertSummaryItem[];
};
```

- [ ] **Step 2: Add the API call**

In `apps/frontend/src/services/api.ts`, add `licenseAlertsSummary` immediately before `licenses`:

```ts
  licenseAlertsSummary: () => req('/licenses/alerts-summary'),
  licenses: () => req('/licenses'),
```

- [ ] **Step 3: Add secondary nav detail support**

In `apps/frontend/src/auth/navigation.ts`, extend `AppNavItem`:

```ts
export type AppNavItem = {
  to: string;
  label: string;
  permissions: InternalPermission[];
  roles?: InternalRole[];
  badgeCount?: number;
  badgeDetail?: string;
};
```

- [ ] **Step 4: Import the summary type in App**

In `apps/frontend/src/App.tsx`, add:

```ts
import type { LicenseAlertSummary } from './types';
```

- [ ] **Step 5: Add summary state and formatter**

In `InternalApp`, near `kanbanAlertCounts`, add:

```ts
  const [licenseAlertSummary, setLicenseAlertSummary] = useState<LicenseAlertSummary | null>(null);
```

Add this helper above `InternalApp`:

```ts
function formatLicenseAlertDetail(summary: LicenseAlertSummary | null): string | undefined {
  if (!summary || summary.total_attention <= 0) return undefined;
  if (summary.expired_count > 0 && summary.due_soon_count > 0) {
    return `${summary.expired_count} vencida(s) - ${summary.due_soon_count} ate 15 dias`;
  }
  if (summary.expired_count > 0) {
    return `${summary.expired_count} vencida(s)`;
  }
  return `${summary.due_soon_count} ate 15 dias`;
}
```

- [ ] **Step 6: Attach license badge data to nav items**

Replace the `navItemsWithAlerts` memo with:

```ts
  const navItemsWithAlerts = useMemo(() => navItems.map((item) => {
    if (item.to === '/implementacao') {
      return { ...item, badgeCount: kanbanAlertCounts.implementation };
    }
    if (item.to === '/suporte') {
      return { ...item, badgeCount: kanbanAlertCounts.support };
    }
    if (item.to === '/licencas' && licenseAlertSummary && licenseAlertSummary.total_attention > 0) {
      return {
        ...item,
        badgeCount: licenseAlertSummary.total_attention,
        badgeDetail: formatLicenseAlertDetail(licenseAlertSummary)
      };
    }
    return item;
  }), [navItems, kanbanAlertCounts, licenseAlertSummary]);
```

- [ ] **Step 7: Fetch license summary in the existing polling effect**

Inside the polling `useEffect`, reset both alert states when there is no session:

```ts
    if (!session || !user) {
      setKanbanAlertCounts({ implementation: 0, support: 0 });
      setLicenseAlertSummary(null);
      return;
    }
```

Replace the `loadKanbanAlertCounts` function with:

```ts
    const loadOperationalAlertCounts = () => {
      const canViewLicenses = user.permissions.includes('licenses');

      Promise.all([
        api.implementationKanban(),
        canViewLicenses ? api.licenseAlertsSummary() : Promise.resolve(null)
      ])
        .then(([kanbanResponse, licenseSummaryResponse]: [any, unknown]) => {
          if (cancelled) return;
          const cards = (kanbanResponse.columns ?? []).flatMap((column: any) => column.cards ?? []);
          setKanbanAlertCounts({
            implementation: cards.filter((card: any) => card.subcategory !== 'Suporte' && card.support_alert_level !== 'none').length,
            support: cards.filter((card: any) => card.subcategory === 'Suporte' && card.support_alert_level !== 'none').length
          });
          setLicenseAlertSummary(canViewLicenses ? licenseSummaryResponse as LicenseAlertSummary : null);
        })
        .catch(() => {
          if (!cancelled) {
            setKanbanAlertCounts({ implementation: 0, support: 0 });
            setLicenseAlertSummary(null);
          }
        });
    };

    loadOperationalAlertCounts();
    const intervalId = window.setInterval(loadOperationalAlertCounts, 60_000);
```

---

### Task 4: Sidebar Rendering and Tests

**Files:**
- Modify: `apps/frontend/src/components/Layout.tsx`
- Modify: `apps/frontend/src/components/Layout.test.tsx`
- Modify: `apps/frontend/src/styles.css`

- [ ] **Step 1: Write a layout test for nav detail**

Add this test to `apps/frontend/src/components/Layout.test.tsx`:

```ts
  test('renders nav badge detail when an item has operational alerts', () => {
    render(
      <MemoryRouter initialEntries={['/calendario']}>
        <Layout
          loggedUser="Equipe Holand"
          navItems={[
            {
              to: '/licencas',
              label: 'Licenças',
              permissions: ['licenses'],
              badgeCount: 8,
              badgeDetail: '2 vencida(s) - 6 ate 15 dias'
            }
          ]}
        >
          <div>Conteúdo</div>
        </Layout>
      </MemoryRouter>
    );

    expect(screen.getByText('Licenças')).toBeInTheDocument();
    expect(screen.getByText('2 vencida(s) - 6 ate 15 dias')).toBeInTheDocument();
    expect(screen.getByLabelText('8 pendência(s)')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the layout test to verify RED**

Run:

```bash
cd apps/frontend && npm test -- src/components/Layout.test.tsx
```

Expected: FAIL because `badgeDetail` is not rendered.

- [ ] **Step 3: Render the detail line in Layout**

In `apps/frontend/src/components/Layout.tsx`, replace:

```tsx
              <span>{item.label}</span>
```

with:

```tsx
              <span className="nav-item-copy">
                <span>{item.label}</span>
                {item.badgeDetail ? <small>{item.badgeDetail}</small> : null}
              </span>
```

- [ ] **Step 4: Add sidebar styles**

In `apps/frontend/src/styles.css`, below `.nav-item`, add:

```css
.nav-item-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.nav-item-copy > span,
.nav-item-copy > small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-item-copy > small {
  color: #884235;
  font-size: 0.68rem;
  font-weight: 800;
}
```

Then add this below `.nav-item-alert-badge`:

```css
.nav-item:has(.nav-item-alert-badge) {
  background: #fff8f6;
  border-color: #f2c7bf;
}
```

- [ ] **Step 5: Run the layout test to verify GREEN**

Run:

```bash
cd apps/frontend && npm test -- src/components/Layout.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit sidebar integration**

Run:

```bash
git add apps/frontend/src/types/index.ts apps/frontend/src/services/api.ts apps/frontend/src/auth/navigation.ts apps/frontend/src/App.tsx apps/frontend/src/components/Layout.tsx apps/frontend/src/components/Layout.test.tsx apps/frontend/src/styles.css
git commit -m "feat: show license alerts in sidebar"
```

---

### Task 5: Licenses Page Summary Panel

**Files:**
- Modify: `apps/frontend/src/pages/LicensesPage.tsx`
- Modify: `apps/frontend/src/pages/LicensesPage.test.tsx`
- Modify: `apps/frontend/src/styles.css`

- [ ] **Step 1: Update test defaults to the new alert fields**

In `apps/frontend/src/pages/LicensesPage.test.tsx`, keep the existing mock shape but use the 15-day language in new tests. Add this test inside `describe('LicensesPage'...)`:

```ts
  test('shows the 15 day license attention summary', async () => {
    mockedApi.licenses.mockResolvedValue({
      rows: [],
      alerts: {
        expired: [
          {
            id: 'license-expired',
            company_id: 'company-1',
            company_name: 'Cliente Teste',
            program_id: 'program-600',
            program_name: 'TopSolid Cam Essential Milling',
            user_name: 'Operador',
            module_ids: [],
            module_list: 'TopSolid Cam Essential Milling',
            license_identifier: 'LIC-EXP',
            renewal_cycle: 'Mensal',
            expires_at: '2026-05-30',
            notes: null,
            last_renewed_at: null,
            created_at: '2026-05-01',
            updated_at: '2026-05-01',
            alert_window_days: 15,
            days_until_expiration: -1,
            alert_level: 'Expirada',
            warning_message: 'Licença expirada há 1 dia(s).'
          }
        ],
        due_soon: [
          {
            id: 'license-due',
            company_id: 'company-1',
            company_name: 'Cliente Teste',
            program_id: 'program-600',
            program_name: 'TopSolid Cam Essential Milling',
            user_name: 'Operador',
            module_ids: [],
            module_list: 'TopSolid Cam Essential Milling',
            license_identifier: 'LIC-DUE',
            renewal_cycle: 'Anual',
            expires_at: '2026-06-15',
            notes: null,
            last_renewed_at: null,
            created_at: '2026-05-01',
            updated_at: '2026-05-01',
            alert_window_days: 15,
            days_until_expiration: 15,
            alert_level: 'Atenção',
            warning_message: 'Renovação anual em 15 dia(s).'
          }
        ],
        monthly_due_soon: [],
        annual_due_soon: [],
        total_attention: 2
      }
    });

    render(
      <MemoryRouter>
        <LicensesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Vencidas')).toBeInTheDocument();
    expect(screen.getByText('Vencem em até 15 dias')).toBeInTheDocument();
    expect(screen.getByText('Próximo vencimento')).toBeInTheDocument();
    expect(screen.getByText('30/05/2026')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the page test to verify RED**

Run:

```bash
cd apps/frontend && npm test -- src/pages/LicensesPage.test.tsx
```

Expected: FAIL because the summary labels still mention cycle-specific windows.

- [ ] **Step 3: Add derived summary values in LicensesPage**

In `apps/frontend/src/pages/LicensesPage.tsx`, after `sortedAttentionRows`, add:

```tsx
  const expiredCount = alerts.expired.length;
  const dueSoonCount = (alerts.due_soon ?? []).length;
  const nextAttentionRow = sortedAttentionRows[0] ?? null;
```

- [ ] **Step 4: Replace the top stats grid labels**

Replace the current four `mini-stat` articles at the top of `LicensesPage` with:

```tsx
      <div className="stats-grid licenses-alert-summary">
        <article className={`mini-stat ${expiredCount > 0 ? 'mini-stat-danger' : ''}`}>
          <span>Vencidas</span>
          <strong>{expiredCount}</strong>
        </article>
        <article className={`mini-stat ${dueSoonCount > 0 ? 'mini-stat-warning' : ''}`}>
          <span>Vencem em até 15 dias</span>
          <strong>{dueSoonCount}</strong>
        </article>
        <article className={`mini-stat ${alerts.total_attention > 0 ? 'mini-stat-warning' : ''}`}>
          <span>Total em atenção</span>
          <strong>{alerts.total_attention}</strong>
        </article>
        <article className="mini-stat">
          <span>Próximo vencimento</span>
          <strong>{nextAttentionRow ? formatDate(nextAttentionRow.expires_at) : 'Sem alertas'}</strong>
        </article>
      </div>
```

- [ ] **Step 5: Keep status sorting severity-first**

In `sortedAttentionRows`, replace the sort block for `attentionSortKey === 'alert_level'` with:

```ts
      if (attentionSortKey === 'alert_level') {
        return (alertRank(b.alert_level) - alertRank(a.alert_level)) * direction;
      }
```

Keep the default `attentionSortKey` as `expires_at`; expired dates naturally sort before future dates.

- [ ] **Step 6: Add focused visual styles**

In `apps/frontend/src/styles.css`, near the existing `.licenses-page .table-readable-grid`, add:

```css
.licenses-alert-summary .mini-stat {
  border-color: #d8dde1;
}

.licenses-alert-summary .mini-stat-danger {
  border-color: #f2c7bf;
  background: #fff5f3;
}

.licenses-alert-summary .mini-stat-warning {
  border-color: #f0d6a0;
  background: #fff9ed;
}
```

- [ ] **Step 7: Run the page test to verify GREEN**

Run:

```bash
cd apps/frontend && npm test -- src/pages/LicensesPage.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit page summary**

Run:

```bash
git add apps/frontend/src/pages/LicensesPage.tsx apps/frontend/src/pages/LicensesPage.test.tsx apps/frontend/src/styles.css
git commit -m "feat: clarify license expiration summary"
```

---

### Task 6: Full Verification

**Files:**
- Verify: backend and frontend packages.

- [ ] **Step 1: Run backend license tests**

Run:

```bash
cd apps/backend && npm test -- src/licenses.test.ts
```

Expected: PASS.

- [ ] **Step 2: Build backend**

Run:

```bash
cd apps/backend && npm run build
```

Expected: PASS.

- [ ] **Step 3: Run frontend focused tests**

Run:

```bash
cd apps/frontend && npm test -- src/components/Layout.test.tsx src/pages/LicensesPage.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Build frontend**

Run:

```bash
cd apps/frontend && npm run build
```

Expected: PASS.

- [ ] **Step 5: Inspect the diff**

Run:

```bash
git diff -- apps/backend/src/coreRoutes.ts apps/backend/src/licenses.test.ts apps/frontend/src/types/index.ts apps/frontend/src/services/api.ts apps/frontend/src/auth/navigation.ts apps/frontend/src/App.tsx apps/frontend/src/components/Layout.tsx apps/frontend/src/components/Layout.test.tsx apps/frontend/src/pages/LicensesPage.tsx apps/frontend/src/pages/LicensesPage.test.tsx apps/frontend/src/styles.css
```

Expected: Changes are limited to the 15-day license alert rule, summary endpoint, sidebar badge/detail, and Licencas page summary.

- [ ] **Step 6: Final commit if previous commits were skipped**

If the task commits were skipped during implementation, run:

```bash
git add apps/backend/src/coreRoutes.ts apps/backend/src/licenses.test.ts apps/frontend/src/types/index.ts apps/frontend/src/services/api.ts apps/frontend/src/auth/navigation.ts apps/frontend/src/App.tsx apps/frontend/src/components/Layout.tsx apps/frontend/src/components/Layout.test.tsx apps/frontend/src/pages/LicensesPage.tsx apps/frontend/src/pages/LicensesPage.test.tsx apps/frontend/src/styles.css
git commit -m "feat: surface license expiration alerts"
```
