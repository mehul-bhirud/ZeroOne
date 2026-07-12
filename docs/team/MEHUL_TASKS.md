# Mehul — D2 Domain — Tasks

> **Timing note:** This document is being generated after 9:00 AM. The 9:00–10:00 block is compressed; the goal remains a first commit by 10:00 AM regardless of actual start time. Treat that first commit as immediately due.

**Role summary:** Own the domain state machines, service workflows, audit-log writes, notification triggers, jobs, central error mapper, and business-rule test suite.

## Ownership

- Branch: `feature/domain-logic`
- Owned paths:
  - `/services`
  - `/domain`
  - `/jobs`
  - `/tests`

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

## 9:00–10:00 — Domain and Service Scaffolding

Start: `git pull --rebase origin main`

- [ ] Create service-layer stubs matching every resource and operation in `/docs/API_CONTRACT.md` without changing endpoint names.
- [ ] Create reusable domain result, authorization, validation, transition, and business-conflict error types.
- [ ] Create the state-machine framework for Asset, MaintenanceRequest, Booking, TransferRequest, and AuditCycle.
- [ ] Create the test harness and database-test lifecycle for service and constraint integration tests.

**Commit:** `chore(domain): scaffold services workflows and tests`

**Handoff:** Publish service interfaces to Sarthak and Yuvraj and confirm database constraint names with Vishvesh.

## 10:00–11:00 — Asset Lifecycle, Allocation, and Transfer

Start: `git pull --rebase origin main`

- [ ] Implement the Asset lifecycle state machine for Available, Allocated, Reserved, Under Maintenance, Lost, Retired, and Disposed.
- [ ] Implement Allocation creation and return orchestration, including expected return dates and Asset Manager return approval.
- [ ] Map the active-Allocation conflict to `409` with the current holder and `/transfer-requests` as the next action.
- [ ] Implement TransferRequest creation, approval, rejection, transactional handoff, ActivityLog writes, and notifications.

**Commit:** `feat(custody): implement allocation and transfer workflows`

**Handoff:** At 11:00 run `/update-docs-and-commit`; Sarthak is unblocked for Allocation conflict, transfer, and return UI. Provide success and `409` fixtures.

## 11:00–12:00 — Booking Workflow and Overlap Handling

Start: `git pull --rebase origin main`

- [ ] Implement Booking list, creation, cancellation, and check-in services using canonical endpoints.
- [ ] Rely on Vishvesh's exclusion constraint for concurrency-safe overlap prevention rather than check-then-insert.
- [ ] Map overlap failures to `409` with the conflicting Booking and an actionable message while allowing back-to-back times.
- [ ] Implement rescheduling as cancellation followed by replacement creation.

**Commit:** `feat(booking): implement overlap-safe booking workflows`

**Handoff:** Yuvraj is unblocked for the timeline, conflict state, check-in, cancellation, and rescheduling. Provide overlapping and back-to-back fixtures.

## 12:00–1:00 — Maintenance Workflow

Start: `git pull --rebase origin main`

- [ ] Implement the MaintenanceRequest state machine for Pending, Approved, Rejected, Technician Assigned, In Progress, and Resolved.
- [ ] Enforce that an Asset cannot enter Under Maintenance before approval.
- [ ] Implement technician assignment, start, resolve, rejection, and the resolved Asset transition back to an appropriate state.
- [ ] Write ActivityLog entries and Notifications for maintenance creation and transitions.

**Commit:** `feat(maintenance): enforce approval-driven maintenance workflow`

**Handoff:** At 1:00 run `/update-docs-and-commit`; Yuvraj is unblocked to connect the kanban. Share allowed transitions and illegal-transition examples.

## 1:00–2:00 — Audit Cycle and Discrepancy Logic

Start: `git pull --rebase origin main`

- [ ] Implement AuditCycle creation with department, location, and date range plus AuditAssignment creation.
- [ ] Implement AuditFinding updates for Verified, Missing, and Damaged with role and auditor checks.
- [ ] Implement discrepancy aggregation and locking for a closed AuditCycle.
- [ ] Implement closure so confirmed-missing Assets become Lost and ActivityLog and Notifications are written.

**Commit:** `feat(audit): implement cycles findings and discrepancy closure`

**Handoff:** Yuvraj is unblocked for cycle creation, auditors, findings, discrepancy preview, and close confirmation. Provide `assets_marked_lost` fixtures.

## 2:00–3:00 — Errors, Notifications, and Jobs

Start: `git pull --rebase origin main`

- [ ] Complete the central error mapper for `400`, `401`, `403`, and `409`, including demo-critical conflicts.
- [ ] Centralize ActivityLog writes for actor, action, entity type, entity identifier, and JSONB metadata.
- [ ] Complete Notification triggers for allocation, transfer, booking, maintenance, overdue return, audit discrepancy, and Exit Clearance.
- [ ] Implement the overdue-detection job for Allocations and required Booking status maintenance without adding non-canonical public endpoints.

**Commit:** `feat(platform): add errors notifications and overdue jobs`

**Handoff:** At 3:00 run `/update-docs-and-commit`; give both frontend owners one stable error shape and confirm seed data produces overdue results.

## 3:00–4:00 — Named Tests and Workflow Freeze

Start: `git pull --rebase origin main`

- [ ] Complete `cannot allocate an asset that is already held` and `cannot book an overlapping slot and allows a back-to-back slot`.
- [ ] Complete `cannot enter Under Maintenance before maintenance approval` and `cannot deactivate an employee with active custody or upcoming bookings`.
- [ ] Complete `closing an audit cycle marks confirmed-missing assets as Lost` and RBAC smoke coverage for all four roles.
- [ ] Run the full service and integration suite against the clean seed and fix only correctness, security, contract, or regression defects.

**Commit:** `test(domain): cover business rules and freeze workflows`

**Handoff:** At 4:00 open or update the final PR, obtain review, merge with a regular merge commit, and freeze. Mehul presents state machines, errors, and tests.

## 4:00–4:30 — Hard Freeze, Test, Seed, and Documentation

- [ ] **HARD FEATURE FREEZE:** add no new functionality.
- [ ] Rebase, run clean migration and seed, run the full suite, and make only regression or correctness fixes needed for green.
- [ ] Review workflow assumptions, state machines, API error examples, and named test output for the README; send approved text to the shared-file editor.
- [ ] Run Asset Manager and Department Head smoke tests, verify forbidden paths return `403`, and confirm the suite is green.

**Commit:** `docs(final): finalize README evidence and test output`

**Handoff:** Confirm every demo-critical `409` is actionable, every mutation writes ActivityLog data, and the test command is reliable.

## 4:30–5:00 — Rehearsal and Backup Recording

- [ ] Rehearse the complete demo twice with all four teammates speaking.
- [ ] Personally present double-allocation and booking-conflict service behavior, a maintenance or audit state-machine guard, and the named green tests.
- [ ] Record the backup demo and verify video and audio playback.

**Commit:** `docs(demo): finalize rehearsal runbook and backup video reference`

**Final check:** Be ready to explain every transition, transaction boundary, notification trigger, error mapping, scheduled job, and test committed from `feature/domain-logic`.
