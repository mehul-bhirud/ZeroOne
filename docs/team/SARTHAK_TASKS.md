# Sarthak — D3 Frontend Core — Tasks

> **Timing note:** This document is being generated after 9:00 AM. The 9:00–10:00 block is compressed; the goal remains a first commit by 10:00 AM regardless of actual start time. Treat that first commit as immediately due.

**Role summary:** Own the shared design system, authentication UI, Org Setup, Asset Registration & Directory, Asset Passport, and Allocation & Transfer experience.

## Ownership

- Branch: `feature/fe-core`
- Owned paths:
  - `/frontend/src/design-system`
  - `/frontend/src/auth`
  - `/frontend/src/screens/{org-setup, asset-registry, allocation}`

Do not edit outside these paths without handing the change to the owner. Flag changes to shared files such as `package.json`, `API_CONTRACT.md`, `schema.sql`, shared route configuration, `README.md`, or `CHANGELOG.md` before editing.

## Operating Rules

- At the start of every hour block, run `git pull --rebase origin main`.
- Run the application and relevant tests before every push.
- Commit at least once per hour.
- Use `type(scope): description`.
- Open or update pull requests at 11:00 AM, 1:00 PM, 3:00 PM, and 4:00 PM.
- Merge through a regular merge commit after rotating teammate review.
- Run `/update-docs-and-commit` at 11:00 AM, 1:00 PM, and 3:00 PM.
- Never push directly to `main`.
- At a merge conflict, stop and resolve it with the conflicting file's owner.

## 9:00–10:00 — Design System and Screen Scaffolding

Start: `git pull --rebase origin main`

- [ ] Define shared tokens using `#0B0F14` background, `#141A21` surface, and `#1E262F` raised surface.
- [ ] Build one `<StatusChip>` component and one color scale reused identically across the asset row, kanban card, audit checklist, and dashboard for all 7 asset, 6 maintenance, and 5 booking states.
- [ ] Create shared button, input, form-field, table, modal, toast, skeleton, empty-state, and error-summary primitives.
- [ ] Scaffold owned Auth, Org Setup, Asset Registry, Asset Passport, and Allocation screen entry points.

**Commit:** `feat(ui): add dark design system and status chips`

**Handoff:** Notify Yuvraj as soon as `<StatusChip>` and the three surface tokens are exported; his screens must import them.

## 10:00–11:00 — Login and Signup UI

Start: `git pull --rebase origin main`

- [ ] Build Login with email and password validation, pending state, actionable errors, and session restoration through `GET /auth/me`.
- [ ] Build Signup for `POST /auth/signup` with no role picker and copy stating signup creates an Employee account.
- [ ] Add the forgot-password interaction for `POST /auth/forgot-password` without exposing account existence.
- [ ] Bind to Vishvesh's Auth shapes and verify the form cannot submit a role.

**Commit:** `feat(auth-ui): build employee-only authentication screens`

**Handoff:** At 11:00 run `/update-docs-and-commit`; share authenticated-layout assumptions with Yuvraj and report contract mismatches before changing client code.

## 11:00–12:00 — Org Setup: Departments and Categories

Start: `git pull --rebase origin main`

- [ ] Build the three-tab Org Setup shell for Departments, Categories, and Employee Directory with Admin-only actions.
- [ ] Build the Department tree with parent hierarchy, head, status, create, and update operations.
- [ ] Build the AssetCategory list and field-builder for `AssetCategory.custom_fields`.
- [ ] Add skeletons, search, empty invitations, validation feedback, and success toasts.

**Commit:** `feat(org-setup): build departments and category management`

**Handoff:** Confirm category `custom_fields` assumptions with Vishvesh and provide Yuvraj a stable Department selector if needed.

## 12:00–1:00 — Employee Directory and Deactivation Entry

Start: `git pull --rebase origin main`

- [ ] Build the Employee Directory using `GET /employees` with search, department, role, and status filters.
- [ ] Build Admin-only role assignment through `PATCH /employees/:id`; expose role assignment nowhere else.
- [ ] Add Deactivate through `PATCH /employees/:id/deactivate` with confirmation and pending states.
- [ ] Route `EXIT_CLEARANCE_REQUIRED` `409` details to Yuvraj's Exit Clearance screen without replacing the backend message.

**Commit:** `feat(employee-directory): add role assignment and deactivation flow`

**Handoff:** At 1:00 run `/update-docs-and-commit`; Yuvraj is unblocked for Exit Clearance. Provide navigation state and the exact response object.

## 1:00–2:00 — Asset Registration and Directory

Start: `git pull --rebase origin main`

- [ ] Build Asset registration for name, category, serial number, acquisition date, acquisition cost, condition, location, bookable flag, and photo URL.
- [ ] Treat `asset_tag` as server-generated from a PostgreSQL `SEQUENCE`; never calculate the next value in the client.
- [ ] Build the directory against `GET /assets?search=&category=&status=&department=&location=` with search, filtering, sorting, and `<StatusChip>`.
- [ ] Add actionable errors, skeletons, and `No assets yet. Register your first one.`

**Commit:** `feat(asset-registry): build registration and searchable directory`

**Handoff:** Share the Asset summary row and filter conventions with Yuvraj for Dashboard, Audit, Maintenance, and Reports.

## 2:00–3:00 — Asset Passport

Start: `git pull --rebase origin main`

- [ ] Build the full Asset Passport using `GET /assets/:id` with Asset details, status, location, category, custody, and `last_verified_at`.
- [ ] Render a chronological timeline from Allocations, TransferRequests, Bookings, MaintenanceRequests, AuditFindings, and ActivityLog.
- [ ] Use the shared `<StatusChip>` and visually distinguish `asset_tag`, serial number, and timestamps.
- [ ] Add permitted updates through `PATCH /assets/:id`, keeping Retired and Disposed as transitions rather than deletion.

**Commit:** `feat(asset-passport): add lifecycle and custody timeline`

**Handoff:** At 3:00 run `/update-docs-and-commit`; provide Yuvraj the stable link pattern for opening an Asset Passport.

## 3:00–4:00 — Allocation, Return, and Transfer UI

Start: `git pull --rebase origin main`

- [ ] Build Allocation creation through `POST /allocations`, including holder selection and `expected_return_date`.
- [ ] Handle `ASSET_ALREADY_ALLOCATED` by showing the current holder and `AF-0114 is with Priya Shah. Request a transfer instead.`
- [ ] Build TransferRequest creation plus approve and reject interactions through canonical endpoints.
- [ ] Build return initiation and Asset Manager approval through `POST /allocations/:id/return` with `return_condition_notes`.

**Commit:** `feat(allocation-ui): complete allocation transfer and return flows`

**Handoff:** At 4:00 open or update the final PR, obtain review, merge with a regular merge commit, and freeze. Sarthak presents Signup, role assignment, registry, conflict UI, transfer, and Passport.

## 4:00–4:30 — Hard Freeze, Test, Seed, and Documentation

- [ ] **HARD FEATURE FREEZE:** add no new functionality.
- [ ] Rebase, run the app against clean seed, run relevant frontend and full suites, and make only regression or correctness fixes.
- [ ] Review design-system, Auth, Org Setup, Asset Registry, Passport, and Allocation evidence for the README; send approved material to the shared-file editor.
- [ ] Run Admin and Employee smoke tests, verify loading, empty, validation, `403`, and demo-critical `409` states, and confirm green.

**Commit:** `docs(final): finalize README evidence and test output`

**Handoff:** Confirm shared `<StatusChip>`, tokens, and UI primitives are stable and Yuvraj's screens still import them.

## 4:30–5:00 — Rehearsal and Backup Recording

- [ ] Rehearse the complete demo twice with all four teammates speaking.
- [ ] Personally present Signup without role picker, Admin role assignment, Asset registration, double-allocation conflict, Transfer Request, and Asset Passport.
- [ ] Record the backup demo and verify video and audio playback.

**Commit:** `docs(demo): finalize rehearsal runbook and backup video reference`

**Final check:** Be ready to explain every design-system primitive, Auth interaction, Org Setup decision, Asset form, Passport timeline, and custody conflict state committed from `feature/fe-core`.
