# Vishvesh — D1 Data — Tasks

> **Timing note:** This document is being generated after 9:00 AM. The 9:00–10:00 block is compressed; the goal remains a first commit by 10:00 AM regardless of actual start time. Treat that first commit as immediately due.

**Role summary:** Own the PostgreSQL schema, migrations, constraints, Exit Clearance trigger, seed generator, authentication backend, RBAC, ERD, and final database verification.

## Ownership

- Branch: `feature/data-layer`
- Owned paths:
  - `/db/migrations`
  - `/db/seed`
  - `/auth (backend)`

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

## 9:00–10:00 — Database Scaffolding and ERD

Start: `git pull --rebase origin main`

- [ ] Draft the ERD using the canonical `User`, `Department`, `AssetCategory`, `Asset`, `Allocation`, `TransferRequest`, `Booking`, `MaintenanceRequest`, `AuditCycle`, `AuditAssignment`, `AuditFinding`, `Notification`, and `ActivityLog` entities.
- [ ] Create migration scaffolding and an extensions migration enabling `btree_gist`, `pg_trgm`, and `citext` in the required order.
- [ ] Create schema v0 with canonical field names, foreign-key placeholders, lifecycle status support, and `timestamptz` for `Booking.start_time` and `Booking.end_time`.
- [ ] Apply the initial migration to a new empty PostgreSQL database.

**Commit:** `chore(data): scaffold migrations and draft ERD`

**Handoff:** Publish canonical schema names and migration order to Mehul, and send initial relationships to Sarthak and Yuvraj.

## 10:00–11:00 — Canonical Schema and Hard Constraints

Start: `git pull --rebase origin main`

- [ ] Complete keys, foreign keys, checks, `User.email` as `CITEXT`, and `AssetCategory.custom_fields` as `JSONB` with a `GIN` index.
- [ ] Add the PostgreSQL `SEQUENCE` that generates `asset_tag` values such as `AF-0001`; never use `COUNT(*) + 1`.
- [ ] Add the partial unique index that permits only one active `Allocation` per `Asset` while allowing reallocation after `returned_at` is set.
- [ ] Add the `EXCLUDE USING gist` constraint that blocks overlapping active `Booking` ranges while allowing back-to-back times.

**Commit:** `feat(db): add canonical schema and custody constraints`

**Handoff:** At 11:00 run `/update-docs-and-commit`, push, open the PR, and share constraint names and PostgreSQL error codes with Mehul; the constraint behavior unblocks Yuvraj.

## 11:00–12:00 — Authentication and RBAC Backend

Start: `git pull --rebase origin main`

- [ ] Implement `POST /auth/signup` so it always creates `User.role = employee` and rejects client-supplied elevated roles.
- [ ] Implement `POST /auth/login`, `POST /auth/forgot-password`, and `GET /auth/me` with secure password hashing and Bearer-token handling.
- [ ] Add RBAC middleware for `admin`, `asset_manager`, `department_head`, and `employee`, including backend department-scoping hooks.
- [ ] Add tests for case-insensitive email uniqueness and for signup self-elevation rejection.

**Commit:** `feat(auth): add employee-only signup JWT and RBAC`

**Handoff:** Notify Sarthak when Auth responses are stable and give Mehul the middleware interface for protected workflows.

## 12:00–1:00 — Seed Generator and Append-Only History

Start: `git pull --rebase origin main`

- [ ] Build a repeatable seed generator using dates relative to the current time, with Departments, Users, role assignments, AssetCategories, and Assets.
- [ ] Generate Allocations, overdue returns, upcoming Bookings, maintenance histories, AuditCycles, AuditFindings, Notifications, and ActivityLog rows.
- [ ] Include bookable Assets, overlap test fixtures, confirmed-missing audit data, and Assets whose `last_verified_at` makes Ghost Asset Radar non-empty.
- [ ] Enforce append-only behavior for `ActivityLog` and verify application credentials cannot update or delete existing entries.

**Commit:** `feat(seed): generate realistic relative demo data`

**Handoff:** At 1:00 run `/update-docs-and-commit`. The seed generator unblocks everyone; share the command, credentials, representative `asset_tag` values, and expected counts.

## 1:00–2:00 — Exit Clearance Trigger

Start: `git pull --rebase origin main`

- [ ] Add a PostgreSQL trigger on `User.status` that blocks active-to-inactive transition while the User has an active Allocation or upcoming Booking.
- [ ] Ensure the trigger exposes enough actionable context for a `409` Exit Clearance checklist instead of a generic database error.
- [ ] Add direct-database verification proving API bugs or direct SQL updates cannot bypass the rule.
- [ ] Verify deactivation succeeds after Allocations are returned or transferred and upcoming Bookings are cancelled.

**Commit:** `feat(clearance): enforce exit clearance on deactivation`

**Handoff:** Give Mehul the trigger error signature and Yuvraj the blocked-deactivation payload shape.

## 2:00–3:00 — Analytics Views and Ghost Asset Radar

Start: `git pull --rebase origin main`

- [ ] Create `v_ghost_risk` using `Asset.last_verified_at` to surface Assets unverified for at least 90 days.
- [ ] Create SQL views for utilization, maintenance frequency, department allocation summary, booking heatmap, dashboard KPIs, and ghost risk.
- [ ] Verify analytics run in SQL rather than JavaScript loops and support department or organization scoping.
- [ ] Confirm the seed produces visible ghost-risk counts, acquisition value, and a shaped heatmap.

**Commit:** `feat(reports): add analytics and ghost risk views`

**Handoff:** At 3:00 run `/update-docs-and-commit`; send Yuvraj stable view columns and confirm with Mehul how Ghost Radar creates an AuditCycle.

## 3:00–4:00 — Clean Migration and Database Proof

Start: `git pull --rebase origin main`

- [ ] Run the full migration chain against a new empty database, then run the seed generator without manual repair.
- [ ] Verify the sequence, `CITEXT`, `JSONB` `GIN` index, partial Allocation uniqueness, Booking exclusion, Exit Clearance trigger, and append-only ActivityLog.
- [ ] Run a two-session concurrency test proving competing Allocation or Booking writes cannot both succeed.
- [ ] Finalize ERD evidence and provide migration, constraint, trigger, and test excerpts for the README.

**Commit:** `test(db): verify migrations constraints and RBAC`

**Handoff:** At 4:00 open or update the final PR, obtain review, merge with a regular merge commit, and freeze features. Vishvesh presents the ERD and database invariants.

## 4:00–4:30 — Hard Freeze, Test, Seed, and Documentation

- [ ] **HARD FEATURE FREEZE:** add no new functionality.
- [ ] Rebase, run clean migration and seed, run the full suite, and make only regression or correctness fixes needed for green.
- [ ] Review ERD, database assumptions, migration commands, and constraint output for the README; send approved text to the shared-file editor.
- [ ] Run Admin and database smoke paths, confirm all four branches in the Git graph, and verify the suite is green.

**Commit:** `docs(final): finalize README evidence and test output`

**Handoff:** Confirm a fresh database can migrate, seed, authenticate, allocate, book, block deactivation, and render non-empty analytics.

## 4:30–5:00 — Rehearsal and Backup Recording

- [ ] Rehearse the complete demo twice with all four teammates speaking.
- [ ] Personally present the ERD, sequence-generated `asset_tag`, partial Allocation index, Booking `EXCLUDE USING gist`, and Exit Clearance trigger.
- [ ] Record the backup demo and verify video and audio playback.

**Commit:** `docs(demo): finalize rehearsal runbook and backup video reference`

**Final check:** Be ready to explain every migration, constraint, trigger, seed assumption, authentication decision, and RBAC guard committed from `feature/data-layer`.
