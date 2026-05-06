# Calendar Visual Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional vivid calendar mode per internal user, plus admin-managed technician colors used by cohorts and activities.

**Architecture:** Store the user preference in `internal_user.preferences_json` and the technician color in `technician.calendar_color`. Expose both through the existing auth/admin/technician APIs, then render extra CSS classes/styles only when the current user has the vivid preference enabled.

**Tech Stack:** Express + SQLite backend, React frontend, CSS modules via global stylesheet, node:test for backend tests.

---

### Task 1: Backend Data And API

**Files:**
- Modify: `apps/backend/src/db.ts`
- Modify: `apps/backend/src/internalAuth.ts`
- Modify: `apps/backend/src/coreRoutes.ts`
- Test: `apps/backend/src/internalAuth.test.ts` or existing backend route tests

- [x] Add `preferences_json` to `internal_user` and `calendar_color` to `technician`.
- [x] Normalize `calendar_vivid_mode` as a boolean inside internal user DTOs and auth session payload.
- [x] Accept `preferences.calendar_vivid_mode` in create/update internal user.
- [x] Accept `calendar_color` in create/update technician.
- [x] Include technician color in `/technicians`, `/calendar/cohorts`, and `/calendar/activities`.
- [x] Run focused backend tests and backend build.

### Task 2: Frontend Admin Controls

**Files:**
- Modify: `apps/frontend/src/auth/session.ts`
- Modify: `apps/frontend/src/pages/AdminPage.tsx`
- Modify: `apps/frontend/src/services/api.ts`

- [x] Add `preferences.calendar_vivid_mode` to the internal session user type.
- [x] Add checkbox for vivid calendar mode in user create/edit forms.
- [x] Add admin color selector for technicians and save via existing technician update endpoint.
- [x] Keep defaults off and neutral.

### Task 3: Calendar Rendering

**Files:**
- Modify: `apps/frontend/src/pages/CalendarPage.tsx`
- Modify: `apps/frontend/src/styles.css`

- [x] Read current internal user from `internalSessionStore`.
- [x] Add vivid class to calendar page when preference is enabled.
- [x] Apply technician color to cohort cards and activity cards.
- [x] Keep existing default styles untouched when vivid mode is off.
- [x] Run frontend build.
