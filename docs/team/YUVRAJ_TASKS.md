# Yuvraj — D4 Frontend Features — Tasks

> **Timing note:** This document is being generated after 9:00 AM. The 9:00–10:00 block is compressed; the goal remains a first commit by 10:00 AM regardless of actual start time. Treat that first commit as immediately due.

**Role summary:** Own the Dashboard, Resource Booking, Maintenance, Audit, Exit Clearance, Reports and heatmap, notification bell, and ActivityLog frontend experiences.

## Ownership

- Branch: `feature/fe-features`
- Owned paths:
  - `/frontend/src/screens/{dashboard, booking, maintenance, audit, exit-clearance, reports, notifications}`

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

## 9:00–10:00 — Feature Routes and Navigation Shell

Start: `git pull --rebase origin main`

- [ ] Scaffold owned entry points for Dashboard, Booking, Maintenance, Audit, Exit Clearance, Reports, and Notifications.
- [ ] Build the feature navigation shell and role-aware visibility for Admin, Asset Manager, Department Head, and Employee without treating hidden navigation as authorization.
- [ ] Add loading, empty, error, and unavailable placeholders that can be replaced by real API data without changing screen structure.
- [ ] Prepare every owned screen to import Sarthak's tokens, controls, toasts, skeletons, and `<StatusChip>`.

**Commit:** `chore(fe-features): scaffold feature routes and navigation`

**Handoff:** Confirm route ownership with Sarthak before touching shared routing and import his design system as soon as available.

## 10:00–11:00 — Dashboard

Start: `git pull --rebase origin main`

- [ ] Build KPI cards using `GET /dashboard/kpis` for available Assets, allocated Assets, maintenance today, active Bookings, pending Transfers, and upcoming returns.
- [ ] Build a visually separate overdue-return section with links to the relevant Asset or Allocation action.
- [ ] Add role-aware quick actions for register, allocate, book, maintain, and audit.
- [ ] Import the shared `<StatusChip>` and exact layered-slate tokens; do not recreate them locally.

**Commit:** `feat(dashboard): add KPI and overdue views`

**Handoff:** At 11:00 run `/update-docs-and-commit`; confirm KPI fields with Mehul and SQL-view output with Vishvesh.

## 11:00–12:00 — Resource Booking and Check-In

Start: `git pull --rebase origin main`

- [ ] Build the resource timeline using `GET /bookings?asset_id=&from=&to=` and the form for `POST /bookings`.
- [ ] Handle `BOOKING_OVERLAP` by showing the conflicting Booking and instructing the user to select another time.
- [ ] Build check-in through `POST /bookings/:id/checkin` and cancellation through `POST /bookings/:id/cancel`.
- [ ] Build rescheduling as cancellation plus replacement creation and prove back-to-back is accepted while overlap is rejected.

**Commit:** `feat(booking-ui): build booking calendar and check-in flows`

**Handoff:** Use Mehul's conflict response and Vishvesh's seeded bookable Assets.

## 12:00–1:00 — Maintenance Kanban

Start: `git pull --rebase origin main`

- [ ] Build the request form for `POST /maintenance-requests` with Asset, issue, priority, and photo URL.
- [ ] Build a button-driven kanban for Pending, Approved, Rejected, Technician Assigned, In Progress, and Resolved with the shared `<StatusChip>`.
- [ ] Connect approve, reject, assign-technician, start, and resolve actions to canonical endpoints.
- [ ] Display the server's actionable `409` for illegal transitions, including start-before-approval.

**Commit:** `feat(maintenance-ui): build approval-driven maintenance kanban`

**Handoff:** At 1:00 run `/update-docs-and-commit`; confirm transitions with Mehul and use Sarthak's Passport link pattern.

## 1:00–2:00 — Audit Cycle and Discrepancy UI

Start: `git pull --rebase origin main`

- [ ] Build AuditCycle creation through `POST /audit-cycles` with department, location, and date range.
- [ ] Build auditor assignment through `POST /audit-cycles/:id/auditors` and findings through `PATCH /audit-cycles/:id/findings`.
- [ ] Build the Verified, Missing, and Damaged audit checklist using the shared `<StatusChip>`.
- [ ] Build close confirmation and discrepancy report through `POST /audit-cycles/:id/close` and `GET /audit-cycles/:id/discrepancy-report`, listing Assets that become Lost.

**Commit:** `feat(audit-ui): build cycle findings and close confirmation`

**Handoff:** Confirm `assets_marked_lost` with Mehul and seeded AuditCycle identifiers with Vishvesh; keep an entry point for Ghost Radar.

## 2:00–3:00 — Exit Clearance, Notifications, and ActivityLog

Start: `git pull --rebase origin main`

- [ ] Build Exit Clearance from the `EXIT_CLEARANCE_REQUIRED` `409` returned by `PATCH /employees/:id/deactivate`.
- [ ] Render each blocking Allocation and upcoming Booking with return, transfer, or cancellation action and retry deactivation.
- [ ] Build the notification bell with `GET /notifications` and `PATCH /notifications/:id/read`.
- [ ] Build the ActivityLog view with actor, action, entity type, entity identifier, timestamp, search, and filters.

**Commit:** `feat(clearance-ui): add exit checklist and notifications`

**Handoff:** At 3:00 run `/update-docs-and-commit`; validate the payload with Vishvesh and Mehul, and confirm Sarthak passes it unchanged.

## 3:00–4:00 — Reports, Heatmap, Export, and Ghost Radar

Start: `git pull --rebase origin main`

- [ ] Build utilization, maintenance-frequency, and department-allocation-summary report views.
- [ ] Build the 7×24 heatmap using `GET /reports/booking-heatmap` and confirm seeded usage is visibly non-uniform.
- [ ] Add CSV export through `GET /reports/export`, preserving active filters.
- [ ] Add Ghost Asset Radar using `GET /reports/ghost-risk`, show count and acquisition value, and create a scoped AuditCycle from its action.

**Commit:** `feat(reports): add analytics heatmap export and ghost radar`

**Handoff:** At 4:00 open or update the final PR, obtain review, merge with a regular merge commit, and freeze. Yuvraj presents Booking, Maintenance, Audit, Exit Clearance, Ghost Radar, heatmap, and notifications.

## 4:00–4:30 — Hard Freeze, Test, Seed, and Documentation

- [ ] **HARD FEATURE FREEZE:** add no new functionality.
- [ ] Rebase, run the app against clean seed, run relevant frontend and full suites, and make only regression or correctness fixes.
- [ ] Review Dashboard, Booking, Maintenance, Audit, Exit Clearance, Reports, Ghost Radar, Notification, and ActivityLog evidence for the README; send approved material to the shared-file editor.
- [ ] Run Asset Manager and Department Head smoke tests, verify loading, empty, `403`, and demo-critical `409` states, and confirm green.

**Commit:** `docs(final): finalize README evidence and test output`

**Handoff:** Confirm Dashboard and Reports are non-empty, Booking has a reliable overlap example, Ghost Radar starts an AuditCycle, and Exit Clearance has a seeded blocked User.

## 4:30–5:00 — Rehearsal and Backup Recording

- [ ] Rehearse the complete demo twice with all four teammates speaking.
- [ ] Personally present Booking overlap and check-in, Maintenance, Audit closure, Ghost Radar, Exit Clearance, heatmap, and Notification or ActivityLog evidence.
- [ ] Record the backup demo and verify video and audio playback.

**Commit:** `docs(demo): finalize rehearsal runbook and backup video reference`

**Final check:** Be ready to explain every Dashboard query, Booking interaction, maintenance transition, audit action, Exit Clearance item, report visualization, and notification behavior committed from `feature/fe-features`.
