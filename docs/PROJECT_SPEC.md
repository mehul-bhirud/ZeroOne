# AssetFlow Project Specification

## Vision

AssetFlow is an enterprise Asset & Resource Management System for any organization that manages equipment, furniture, vehicles, shared spaces, or other physical resources. It replaces spreadsheets and paper logs with a trustworthy operating record of what the organization owns, who holds it, where it is, its condition, and its complete lifecycle.

The product is industry-agnostic. It must work for offices, schools, hospitals, factories, agencies, and other organizations without requiring industry-specific schema migrations. PostgreSQL is the source of truth, and critical custody, booking, and offboarding rules are enforced at the database level wherever possible.

## Non-Goals

AssetFlow does not include:

- Purchasing or procurement workflows.
- Invoicing.
- Accounting, journal entries, or depreciation.
- Odoo API or Odoo module integration unless a specific implemented feature explicitly calls for it.
- Firebase, Supabase, or MongoDB Atlas.
- Unnecessary third-party service dependencies.
- Hard deletion of assets.

`Asset.acquisition_cost` is informational and may be used in reports and risk calculations. It is not linked to accounting.

## Roles and Permissions

| Role | Permissions |
|---|---|
| Admin | Manage departments and categories; configure audit cycles; view the Employee Directory; assign or change roles; initiate employee deactivation; access organization-wide analytics. |
| Asset Manager | Register and update assets; allocate assets; approve transfers; approve maintenance; approve audit discrepancies; approve returns. |
| Department Head | View the department's assets; approve department allocation and transfer requests; book shared resources for the department. |
| Employee | View personally assigned assets; book shared resources; raise maintenance requests; initiate returns; initiate transfers. |

### Role Assignment Rule

`POST /auth/signup` always creates a `User` with `role = employee`. Signup has no role selector, and the backend must reject any attempt to supply an elevated role. An Admin may promote an Employee to Department Head or Asset Manager only through the Employee Directory using `PATCH /employees/:id`.

The Employee Directory is the only place roles are ever assigned. Self-elevation is never permitted.

## Canonical Entities

These names and fields are canonical and must be used identically across the database, backend, frontend, API, tests, and documentation.

- `User(id, name, email[citext], password_hash, role[admin|asset_manager|department_head|employee], department_id, status[active|inactive])`
- `Department(id, name, parent_department_id?, head_user_id?, status)`
- `AssetCategory(id, name, custom_fields[jsonb])`
- `Asset(id, name, category_id, asset_tag, serial_number, acquisition_date, acquisition_cost, condition, location, is_bookable, status, photo_url, last_verified_at)`
- `Allocation(id, asset_id, holder_type, holder_id, expected_return_date, allocated_at, returned_at?, return_condition_notes)`
- `TransferRequest(id, asset_id, from_holder, to_holder, status, requested_by, approved_by)`
- `Booking(id, asset_id, booked_by, start_time[timestamptz], end_time[timestamptz], status)`
- `MaintenanceRequest(id, asset_id, raised_by, issue_description, priority, photo_url, status, technician)`
- `AuditCycle(id, scope_department_id?, scope_location?, date_range_start, date_range_end, status, created_by)`
- `AuditAssignment(id, audit_cycle_id, auditor_id)`
- `AuditFinding(id, audit_cycle_id, asset_id, result, notes)`
- `Notification(id, user_id, type, message, read)`
- `ActivityLog(id, actor_id, action, entity_type, entity_id, metadata[jsonb])` — append-only.

## Product Screens

1. **Login / Signup** — Authenticates users, supports forgot-password, and clearly states that signup creates an Employee account only.
2. **Dashboard** — Shows KPIs, overdue returns, active bookings, pending transfers, upcoming returns, maintenance activity, quick actions, and ghost-asset risk.
3. **Org Setup** — Admin-only screen with Departments, Categories, and Employee Directory tabs for hierarchy, custom fields, role assignment, and deactivation.
4. **Asset Registration & Directory** — Registers assets, displays sequence-generated tags, supports search/filter/sort, and opens the Asset Passport.
5. **Asset Allocation & Transfer** — Allocates assets, records expected return dates, manages returns, blocks double-allocation, and supports approved transfers.
6. **Resource Booking** — Shows availability, creates non-overlapping bookings, supports check-in, cancellation, and rescheduling through canonical booking operations.
7. **Maintenance Management** — Raises and processes maintenance requests through approval, technician assignment, work, and resolution.
8. **Asset Audit** — Creates scoped cycles, assigns auditors, records findings, produces discrepancy reports, and closes completed cycles.
9. **Reports & Analytics** — Provides utilization, maintenance-frequency, department-allocation, booking-heatmap, ghost-risk, and export reports backed by SQL views.
10. **Activity Logs & Notifications** — Shows user notifications and the append-only record of who performed each action, on which entity, and when.

## Asset Lifecycle States

Asset statuses are:

1. Available
2. Allocated
3. Reserved
4. Under Maintenance
5. Lost
6. Retired
7. Disposed

Available, Allocated, Reserved, and Under Maintenance are active operational states. Lost, Retired, and Disposed are exceptional or terminal outcomes. Confirmed-missing assets become Lost when an AuditCycle closes. Assets that leave service become Retired or Disposed rather than being hard-deleted. Every lifecycle transition must remain visible in the Asset Passport and `ActivityLog`.

## Key Business Rules

### BR-01 — Double-Allocation Is Blocked

An Asset may have no more than one active Allocation. If an allocation is attempted for an already-held Asset, the API returns `409`, identifies the current holder, and offers a Transfer Request instead.

Required named test: `cannot allocate an asset that is already held`

Example error: `AF-0114 is with Priya Shah. Request a transfer instead.`

### BR-02 — Booking Overlap Is Blocked

Bookings for the same Asset must not overlap. The database uses a half-open range, so 09:00–10:00 followed by 10:00–11:00 is legal, while 09:00–10:00 overlapping 09:30–10:30 is rejected with `409`.

Required named test: `cannot book an overlapping slot and allows a back-to-back slot`

### BR-03 — Maintenance Requires Approval

A MaintenanceRequest cannot move an Asset to Under Maintenance before the request is approved. Approval is the event that permits the status transition.

Required named test: `cannot enter Under Maintenance before maintenance approval`

### BR-04 — Employee Deactivation Requires Exit Clearance

A `User` cannot transition from active to inactive while the employee has an active Allocation or an upcoming Booking. The API returns `409` with an Exit Clearance checklist. A PostgreSQL trigger enforces the same rule against direct API or SQL paths.

Required named test: `cannot deactivate an employee with active custody or upcoming bookings`

### BR-05 — Audit Closure Marks Missing Assets as Lost

Closing an AuditCycle locks its findings and transitions each Asset with a confirmed Missing AuditFinding to Lost.

Required named test: `closing an audit cycle marks confirmed-missing assets as Lost`

## Differentiators

Build these only when the core product and required tests are green.

### 1. Exit Clearance

When an Admin tries to deactivate an Employee who still holds assets or has upcoming bookings, the operation is blocked and a checklist identifies each unresolved Allocation and Booking with a return, transfer, or cancellation action. A PostgreSQL trigger provides the hard guarantee.

Demo statement: `You cannot lose an asset by firing someone. The database will not let you.`

### 2. Ghost Asset Radar

A SQL view named `v_ghost_risk` surfaces Assets whose `last_verified_at` is at least 90 days old or otherwise meets the view's unverified rule. The UI shows the count and acquisition value of at-risk Assets, and one action creates an AuditCycle scoped to exactly those Assets.

Demo statement: `Every EAM sells you an audit module. Ours tells you what to audit.`

### 3. Database-Enforced Invariants

Critical concurrency-sensitive rules live in PostgreSQL:

- A partial unique index guarantees one active Allocation per Asset.
- `EXCLUDE USING gist` prevents overlapping active Bookings for the same Asset.
- The Exit Clearance trigger blocks deactivation while custody or future reservations remain open.

These constraints must remain correct under concurrent requests and must not be replaced with check-then-insert logic.

Demo statement: `We did not make double-booking unlikely. We made it unstorable.`

## Design and Technical Decisions

### PostgreSQL Decisions

- `asset_tag` is generated from a PostgreSQL `SEQUENCE`, such as `AF-0001`; never use `COUNT(*) + 1`.
- `Booking.start_time` and `Booking.end_time` use `timestamptz`, not `timestamp`.
- `CREATE EXTENSION btree_gist` must run before the booking `EXCLUDE USING gist` constraint.
- Enable `pg_trgm` and `citext`.
- `User.email` uses `CITEXT` for case-insensitive uniqueness.
- `AssetCategory.custom_fields` uses `JSONB` with a `GIN` index.
- Analytics are SQL views, not JavaScript aggregation loops.
- Raw SQL is expected for constraint-heavy functionality that an ORM cannot express faithfully.
- `ActivityLog` is append-only.
- Assets are never hard-deleted.

### Interface Style

Use a dark, layered-slate visual system:

- Background: `#0B0F14`
- Surface: `#141A21`
- Raised surface: `#1E262F`

One `<StatusChip>` component and one color scale must be reused identically across the asset row, kanban card, audit checklist, and dashboard for all 7 asset states, 6 maintenance states, and 5 booking states.

Asset states: Available, Allocated, Reserved, Under Maintenance, Lost, Retired, Disposed.

Maintenance states: Pending, Approved, Rejected, Technician Assigned, In Progress, Resolved.

Booking states: Upcoming, Ongoing, Completed, Cancelled, No Show.

Avoid AI-design tells:

- No cream + serif + terracotta.
- No near-black + acid-green.
- No broadsheet hairlines.

### Product Copy

Errors state what happened and what to do next.

Example: `AF-0114 is with Priya Shah. Request a transfer instead.`

Empty states are invitations.

Example: `No assets yet. Register your first one.`

Use loading skeletons, toasts, search, filtering, and sorting consistently. Mobile responsiveness is bonus-tier and must not displace required desktop functionality.

## Demo One-Liner

> 10–30% of a company's asset register doesn't physically exist, and most departing-employee equipment loss comes from the same root cause: nothing enforces custody. AssetFlow makes custody a database invariant.
