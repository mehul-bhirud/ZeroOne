---
trigger: always_on
---

#GEMINI.md

## 1. Git Workflow

- `main` is protected — no direct commits or pushes from anyone, human or agent.
- Four long-lived branches are used for the day:
  - Vishvesh: `feature/data-layer`
  - Mehul: `feature/domain-logic`
  - Sarthak: `feature/fe-core`
  - Yuvraj: `feature/fe-features`
- At the start of every hour block, before writing code, run `git pull --rebase origin main` on the assigned branch.
- Commit granularly: one commit per completed sub-task where practical, and at least one commit per hour per person. The hourly minimum is non-negotiable.
- Commit format is exactly `type(scope): description`, using Conventional Commit types `feat`, `fix`, `chore`, `test`, `docs`, or `refactor`.
- Open pull requests at 11:00 AM, 1:00 PM, 3:00 PM, and the final 4:00 PM checkpoint. Each PR targets `main`, states what changed, why it changed, and dependencies, and receives a rotating teammate review before merge.
- Never force-push to `main`. Force-pushing an owned feature branch to clean history before a PR is allowed.
- Merge via a regular merge commit, not squash. Squashing erases the hourly individual-contribution trail being judged. Do not delete the remote branches after merge.
- Run the application and relevant tests locally before every push.
- On a merge conflict, stop, pull in the owner of the conflicting file for a two-minute sync, and do not force through alone.

Folder ownership is the primary merge-conflict prevention mechanism:

| Owner    | Paths                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Vishvesh | `/db/migrations`, `/db/seed`, `/auth` (backend)                                                                      |
| Mehul    | `/services`, `/domain`, `/jobs`, `/tests`                                                                            |
| Sarthak  | `/frontend/src/design-system`, `/frontend/src/auth`, `/frontend/src/screens/{org-setup, asset-registry, allocation}` |
| Yuvraj   | `/frontend/src/screens/{dashboard, booking, maintenance, audit, exit-clearance, reports, notifications}`             |

Shared files include `package.json`, `API_CONTRACT.md`, `schema.sql` when more than one person needs to touch it, shared root configuration, and shared documentation. Flag the intended change in the team channel before editing; never silently push a shared-file change.

## 2. Project Goals

The MVP is a working, database-backed AssetFlow system covering all ten screens: Login/Signup, Dashboard, Org Setup, Asset Registration & Directory, Asset Allocation & Transfer, Resource Booking, Maintenance Management, Asset Audit, Reports & Analytics, and Activity Logs & Notifications.

The MVP must demonstrate employee-only signup, Admin-controlled role assignment, sequence-generated `asset_tag`, asset registration, allocation and return, double-allocation prevention, transfers, booking overlap prevention with legal back-to-back bookings, approval-driven maintenance, audit closure, confirmed-missing Assets becoming Lost, searchable lifecycle history, append-only `ActivityLog`, and backend RBAC.

Stretch goals, built only after the core and full required test suite are green:

1. Exit Clearance enforced by a PostgreSQL trigger.
2. Ghost Asset Radar backed by `v_ghost_risk`.
3. Database-enforced invariants demonstrated under concurrent requests.

The scoring priorities are database design weighted highest, modularity, a working end-to-end demo against real PostgreSQL data, security/RBAC, usability and actionable validation, whether each teammate can explain their own code, and a genuine multi-person commit graph with real PRs and reviews. Feature count is not the primary objective.

## 3. Project Architecture

PostgreSQL is the source of truth. Enforce business rules in the database wherever PostgreSQL can express them accurately, especially when concurrency matters.

Required database mechanisms:

- PostgreSQL `SEQUENCE` for `asset_tag`.
- Partial unique index for one active Allocation per Asset.
- `EXCLUDE USING gist` for non-overlapping Bookings.
- PostgreSQL trigger for Exit Clearance.
- `CITEXT` for case-insensitive `User.email` uniqueness.
- `JSONB` with a `GIN` index for `AssetCategory.custom_fields`.
- SQL views for analytics, including `v_ghost_risk`.
- Append-only `ActivityLog`.

Use `timestamptz` for `Booking.start_time` and `Booking.end_time`. Enable `btree_gist` before the booking exclusion constraint, and also enable `pg_trgm` and `citext`. Use raw SQL for constraint-heavy pieces that an ORM cannot faithfully express.

Expose a REST backend conforming to `/docs/API_CONTRACT.md`, with `/api/v1` as the base path and Bearer-token authentication. Keep route handling, domain transitions, service orchestration, data access, and error mapping modular. Never expose raw PostgreSQL errors. Scope Department Head access at the backend query or repository layer, not by hiding buttons.

Use React for the frontend with one shared design system. Reuse the same interaction, loading, error, empty-state, and status patterns across all screens.

Folder ownership:

| Owner    | Paths                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Vishvesh | `/db/migrations`, `/db/seed`, `/auth` (backend)                                                                      |
| Mehul    | `/services`, `/domain`, `/jobs`, `/tests`                                                                            |
| Sarthak  | `/frontend/src/design-system`, `/frontend/src/auth`, `/frontend/src/screens/{org-setup, asset-registry, allocation}` |
| Yuvraj   | `/frontend/src/screens/{dashboard, booking, maintenance, audit, exit-clearance, reports, notifications}`             |

A person must not edit outside owned paths for convenience. Cross-owner changes require a handoff to the owner.

## 4. Design Style Guidelines

Use a dark, layered-slate visual system:

- Background: `#0B0F14`
- Surface: `#141A21`
- Raised surface: `#1E262F`

Do not substitute pure black for the layered surfaces.

One `<StatusChip>` component and one color scale must be reused identically across the asset row, kanban card, audit checklist, and dashboard for all 7 asset states, 6 maintenance states, and 5 booking states.

Asset states: Available, Allocated, Reserved, Under Maintenance, Lost, Retired, Disposed.

Maintenance states: Pending, Approved, Rejected, Technician Assigned, In Progress, Resolved.

Booking states: Upcoming, Ongoing, Completed, Cancelled, No Show.

No screen may create an independent status-badge implementation.

Avoid AI-design tells:

- No cream + serif + terracotta.
- No near-black + acid-green.
- No broadsheet hairlines.

The interface should look like an operational asset system: structured, legible, useful, and consistent.

## 5. User Experience Guidelines

Every error must state what happened and what the user can do next.

Preferred: `AF-0114 is with Priya Shah. Request a transfer instead.`

Avoid generic messages such as `Something went wrong`, `Invalid request`, or `Operation failed`.

Empty states must invite the next action.

Preferred: `No assets yet. Register your first one.`

Use loading skeletons for screens and lists, toasts for completed mutations and recoverable failures, field-specific validation near inputs, preserved form values after validation errors, and disabled destructive or invalid actions while requests are pending.

Search, filter, and sort data-heavy screens, including Employee Directory, Asset Directory, Bookings, Maintenance, Audit findings, Reports, and ActivityLog.

Mobile responsiveness is bonus-tier only. Required desktop functionality, business-rule feedback, and demo stability take priority.

## 6. Constraints and Policies

Do not implement purchasing, invoicing, accounting, journal entries, depreciation, Odoo API or module integration unless a specific feature explicitly requires it, Firebase, Supabase, MongoDB Atlas, or unnecessary third-party dependencies.

Never hard-delete an Asset. An Asset leaves active use by transitioning to Retired or Disposed. Lost remains a recorded lifecycle state. History is the product.

`ActivityLog` is append-only. Application code must not expose update or delete operations for existing ActivityLog records.

Signup creates an Employee account only. The signup request does not accept an elevated role. Roles are assigned only by an Admin through the Employee Directory, using the canonical `PATCH /employees/:id` operation. Hiding role controls in the frontend is insufficient; the backend must reject self-elevation.

AI-assisted code is allowed, but nothing may be committed unless the committer can explain what it does, why it is implemented that way, its failure cases, its control flow, and how to modify or debug it. Code the committer cannot explain must not enter the repository.

## 7. Repo Etiquette

- Do not edit outside your owned folders, even for a quick fix. Flag it and hand it to the owner.
- Do not silently modify shared files.
- Keep the four remote hackathon branches after merge.
- Delete stale local branches after their work is fully merged and no longer needed; do not delete the remote contribution branches.
- Maintain a standard `.gitignore` for dependencies, build artifacts, environment files, logs, local databases, editor files, and operating-system artifacts.
- Never commit credentials, Bearer tokens, database passwords, or production secrets.
- Create a branch before any major structural change.
- Run the application and relevant tests before every push.
- Keep commits focused on one coherent change.
- Do not mix unrelated formatting changes into feature commits.
- Coordinate file moves or directory renames before performing them.
- Resolve merge conflicts with the conflicting file's owner.

## 8. General Testing Instructions

Required named tests:

1. `cannot allocate an asset that is already held`
2. `cannot book an overlapping slot and allows a back-to-back slot`
3. `cannot enter Under Maintenance before maintenance approval`
4. `cannot deactivate an employee with active custody or upcoming bookings`
5. `closing an audit cycle marks confirmed-missing assets as Lost`

These tests must prove behavior through the service and database path, not only isolated frontend conditions.

Before every push:

1. Run the relevant unit and integration tests.
2. Run the application locally.
3. Exercise the changed happy path.
4. Exercise at least one failure path.
5. Confirm the failure returns an actionable message.

Run at least one manual smoke test as Admin, Asset Manager, Department Head, and Employee. Confirm permitted actions work and forbidden actions return `403` from the backend.

The full suite must be green by 4:00 PM as a hard feature-freeze gate. The 4:00–4:30 PM stabilization block may rerun the suite, reproduce clean migration and seed, and fix regressions, but may not add features.

## 9. Documentation

Create `/docs` at the repository root containing:

- `PROJECT_SPEC.md`
- `API_CONTRACT.md`
- The two original hackathon PDFs

Update documentation whenever a milestone changes an assumption made by the specification or API contract.

Maintain root `README.md` and `CHANGELOG.md`. The README must include project overview, setup, ERD, architecture summary, assumptions and clarifications, test instructions and final output, demo instructions, and known limitations.

Define and use an `/update-docs-and-commit` routine:

1. Re-read the relevant section of `/docs/PROJECT_SPEC.md` and `/docs/API_CONTRACT.md`.
2. Update the specification or contract if the implementation legitimately changed an assumption, after notifying the affected owner.
3. Add a one-line `CHANGELOG.md` entry.
4. Only then commit, push, and open or update the PR.

Run this routine at minimum at the 11:00 AM, 1:00 PM, and 3:00 PM sync checkpoints. If the tooling supports custom agent commands, register `/update-docs-and-commit` as an actual command.
