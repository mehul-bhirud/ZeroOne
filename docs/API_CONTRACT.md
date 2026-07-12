# AssetFlow API Contract

> **Contract lock:** This file is locked after the 9:00–10:00 AM scaffolding hour. After 10:00 AM, any proposed endpoint, request shape, response shape, field, status code, or semantic change must be flagged to the frontend or backend owner on the other side before editing this file. No side may silently change the contract.

## Conventions

- Base path: `/api/v1`
- Authentication: `Authorization: Bearer <token>`
- JSON request and response bodies unless an export explicitly returns a file.
- `200` successful read or state change.
- `201` successful creation.
- `400` validation error.
- `401` unauthenticated: missing, invalid, or expired Bearer token.
- `403` authenticated but role-forbidden or outside allowed scope.
- `409` business-rule conflict.
- Raw PostgreSQL errors never reach the browser.
- Errors state what happened and what the caller should do next.

Standard error shape:

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Actionable human-readable message",
    "details": {}
  }
}
```

## Auth

### `POST /auth/signup`

- Request: `{ name, email, password, department_id? }`
- Response `201`: `{ access_token, user: User }`
- Behavior: creates `User.role = employee` and `User.status = active`; a role field is not accepted.
- Errors: `400` invalid input; `409` email already registered.

### `POST /auth/login`

- Request: `{ email, password }`
- Response `200`: `{ access_token, user: User }`
- Errors: `400` malformed or missing credentials; `401` incorrect credentials or inactive User.

### `POST /auth/forgot-password`

- Request: `{ email }`
- Response `200`: `{ accepted: true }`
- Behavior: returns the same accepted response whether or not the email exists.
- Errors: `400` malformed email.

### `GET /auth/me`

- Request: Bearer token.
- Response `200`: `{ user: User }`
- Errors: `401` token missing, invalid, expired, or linked to an inactive User.

## Departments

### `GET /departments`

- Request: optional hierarchy or status filters.
- Response `200`: `{ departments: Department[] }`
- Errors: `400` invalid filter; `401` unauthenticated; `403` requested scope is forbidden.

### `POST /departments`

- Request: `{ name, parent_department_id?, head_user_id?, status }`
- Response `201`: `{ department: Department }`
- Errors: `400` invalid fields; `401` unauthenticated; `403` not Admin; `409` duplicate or conflicting hierarchy data.

### `PATCH /departments`

- Request: `{ id, name?, parent_department_id?, head_user_id?, status? }`
- Response `200`: `{ department: Department }`
- Errors: `400` invalid fields or hierarchy cycle; `401` unauthenticated; `403` not Admin; `409` update conflicts with an existing Department or active dependency.

## Categories

### `GET /categories`

- Request: optional search or status filters.
- Response `200`: `{ categories: AssetCategory[] }`
- Errors: `400` invalid filter; `401` unauthenticated; `403` category configuration is forbidden.

### `POST /categories`

- Request: `{ name, custom_fields }`
- Response `201`: `{ category: AssetCategory }`
- Errors: `400` invalid name or `custom_fields`; `401` unauthenticated; `403` not Admin; `409` category already exists.

### `PATCH /categories`

- Request: `{ id, name?, custom_fields? }`
- Response `200`: `{ category: AssetCategory }`
- Errors: `400` invalid field definition; `401` unauthenticated; `403` not Admin; `409` update conflicts with an existing category or dependency.

## Employees

### `GET /employees`

- Request: optional department, role, status, search, and pagination filters.
- Response `200`: `{ employees: User[] }`
- Errors: `400` invalid filter; `401` unauthenticated; `403` Employee Directory access forbidden.

### `PATCH /employees/:id`

- Request: `{ role?, department_id?, status? }`
- Response `200`: `{ employee: User }`
- Behavior: Admin-only role promotion and reassignment; this is the only role-assignment endpoint.
- Errors: `400` invalid role, department, or status; `401` unauthenticated; `403` not Admin; `409` requested change conflicts with an active dependency.

### `PATCH /employees/:id/deactivate`

- Request: `{ reason? }`
- Response `200`: `{ employee: User, clearance_complete: true }`
- Errors: `400` invalid request; `401` unauthenticated; `403` not Admin; `409` active Allocations or upcoming Bookings require Exit Clearance.
- Demo-critical `409`:

```json
{
  "error": {
    "code": "EXIT_CLEARANCE_REQUIRED",
    "message": "Employee still has active custody or upcoming bookings. Complete the clearance checklist and retry deactivation.",
    "details": {
      "employee": "User",
      "active_allocations": "Allocation[]",
      "upcoming_bookings": "Booking[]",
      "checklist": "object[]"
    }
  }
}
```

## Assets

### `GET /assets?search=&category=&status=&department=&location=`

- Request: optional `search`, `category`, `status`, `department`, `location`, sorting, and pagination.
- Response `200`: `{ assets: Asset[], total, filters }`
- Errors: `400` invalid filter or pagination; `401` unauthenticated; `403` requested department scope forbidden.

### `POST /assets`

- Request: `{ name, category_id, serial_number, acquisition_date, acquisition_cost, condition, location, is_bookable, photo_url? }`
- Response `201`: `{ asset: Asset }`
- Behavior: `asset_tag` is generated by a PostgreSQL `SEQUENCE`.
- Errors: `400` invalid input; `401` unauthenticated; `403` not Asset Manager or Admin; `409` duplicate serial number or another registration conflict.

### `GET /assets/:id`

- Request: Asset identifier.
- Response `200`: `{ asset: Asset, allocations: Allocation[], transfer_requests: TransferRequest[], bookings: Booking[], maintenance_requests: MaintenanceRequest[], audit_findings: AuditFinding[], activity: ActivityLog[] }`
- Behavior: returns the full Asset Passport.
- Errors: `400` malformed identifier; `401` unauthenticated; `403` Asset scope forbidden.

### `PATCH /assets/:id`

- Request: allowed subset of `{ name, category_id, serial_number, acquisition_date, acquisition_cost, condition, location, is_bookable, status, photo_url, last_verified_at }`
- Response `200`: `{ asset: Asset }`
- Behavior: retire or dispose instead of hard-delete.
- Errors: `400` invalid field or lifecycle transition; `401` unauthenticated; `403` update forbidden; `409` active custody, booking, maintenance, audit, or uniqueness conflict.

## Allocations and Transfers

### `POST /allocations`

- Request: `{ asset_id, holder_type, holder_id, expected_return_date }`
- Response `201`: `{ allocation: Allocation }`
- Errors: `400` invalid Asset, holder, or date; `401` unauthenticated; `403` allocation forbidden; `409` Asset already has an active Allocation.
- Demo-critical `409`:

```json
{
  "error": {
    "code": "ASSET_ALREADY_ALLOCATED",
    "message": "AF-0114 is with Priya Shah. Request a transfer instead.",
    "details": {
      "asset": "Asset",
      "current_allocation": "Allocation",
      "current_holder": "object",
      "transfer_request_path": "/transfer-requests"
    }
  }
}
```

### `POST /allocations/:id/return`

- Request: `{ return_condition_notes, action?: "request" | "approve" }`
- Response `200`: `{ allocation: Allocation, asset: Asset }`
- Behavior: an Employee may initiate a return; an Asset Manager approves and completes it.
- Errors: `400` invalid input or Allocation state; `401` unauthenticated; `403` action forbidden; `409` already returned or incompatible return state.

### `POST /transfer-requests`

- Request: `{ asset_id, from_holder, to_holder }`
- Response `201`: `{ transfer_request: TransferRequest }`
- Behavior: `requested_by` comes from the authenticated User.
- Errors: `400` invalid Asset or holder; `401` unauthenticated; `403` request forbidden; `409` active duplicate request or source no longer holds Asset.

### `PATCH /transfer-requests/:id/approve`

- Request: `{ approved_by? }`
- Response `200`: `{ transfer_request: TransferRequest, previous_allocation: Allocation, new_allocation: Allocation }`
- Behavior: performs the custody handoff transactionally.
- Errors: `400` invalid state; `401` unauthenticated; `403` approval forbidden; `409` custody changed, request resolved, or destination incompatible.

### `PATCH /transfer-requests/:id/reject`

- Request: `{ reason? }`
- Response `200`: `{ transfer_request: TransferRequest }`
- Errors: `400` invalid state or reason; `401` unauthenticated; `403` rejection forbidden; `409` request already resolved.

## Bookings

### `GET /bookings?asset_id=&from=&to=`

- Request: optional `asset_id`, `from`, and `to`.
- Response `200`: `{ bookings: Booking[] }`
- Errors: `400` invalid Asset or range; `401` unauthenticated; `403` booking scope forbidden.

### `POST /bookings`

- Request: `{ asset_id, start_time, end_time }`
- Response `201`: `{ booking: Booking }`
- Behavior: `booked_by` comes from the authenticated User; times use `timestamptz`.
- Errors: `400` invalid or non-bookable Asset, invalid times, or `end_time <= start_time`; `401` unauthenticated; `403` booking forbidden; `409` overlap with another active Booking.
- Demo-critical `409`:

```json
{
  "error": {
    "code": "BOOKING_OVERLAP",
    "message": "That time overlaps an existing booking. Choose a different slot.",
    "details": {
      "asset": "Asset",
      "conflicting_booking": "Booking"
    }
  }
}
```

Back-to-back Bookings are accepted; overlapping Bookings are rejected.

### `POST /bookings/:id/cancel`

- Request: `{ reason? }`
- Response `200`: `{ booking: Booking }`
- Errors: `400` invalid reason or state; `401` unauthenticated; `403` cancellation forbidden; `409` Booking no longer cancellable.

### `POST /bookings/:id/checkin`

- Request: no body, or optional `{ checked_at? }` if supported internally.
- Response `200`: `{ booking: Booking }`
- Errors: `400` outside check-in window; `401` unauthenticated; `403` check-in forbidden; `409` cancelled, completed, already checked in, or incompatible state.

Rescheduling uses the canonical operations: cancel with `POST /bookings/:id/cancel`, then create the replacement with `POST /bookings`.

## Maintenance

### `POST /maintenance-requests`

- Request: `{ asset_id, issue_description, priority, photo_url? }`
- Response `201`: `{ maintenance_request: MaintenanceRequest }`
- Behavior: `raised_by` comes from the authenticated User.
- Errors: `400` invalid input; `401` unauthenticated; `403` request forbidden; `409` incompatible open maintenance workflow already exists.

### `PATCH /maintenance-requests/:id/approve`

- Request: `{ notes? }`
- Response `200`: `{ maintenance_request: MaintenanceRequest, asset: Asset }`
- Behavior: approval permits Asset transition to Under Maintenance.
- Errors: `400` invalid state; `401` unauthenticated; `403` approval forbidden; `409` already resolved or Asset cannot enter Under Maintenance.

### `PATCH /maintenance-requests/:id/reject`

- Request: `{ reason }`
- Response `200`: `{ maintenance_request: MaintenanceRequest }`
- Errors: `400` missing reason or invalid state; `401` unauthenticated; `403` rejection forbidden; `409` already resolved.

### `PATCH /maintenance-requests/:id/assign-technician`

- Request: `{ technician }`
- Response `200`: `{ maintenance_request: MaintenanceRequest }`
- Errors: `400` invalid technician or state; `401` unauthenticated; `403` assignment forbidden; `409` request not approved or already resolved.

### `PATCH /maintenance-requests/:id/start`

- Request: `{ notes? }`
- Response `200`: `{ maintenance_request: MaintenanceRequest, asset: Asset }`
- Errors: `400` invalid state; `401` unauthenticated; `403` start forbidden; `409` not approved, technician absent, or already resolved.

### `PATCH /maintenance-requests/:id/resolve`

- Request: `{ resolution_notes? }`
- Response `200`: `{ maintenance_request: MaintenanceRequest, asset: Asset }`
- Errors: `400` invalid resolution input; `401` unauthenticated; `403` resolution forbidden; `409` work not started, rejected, or already resolved.

## Audits

### `POST /audit-cycles`

- Request: `{ scope_department_id?, scope_location?, date_range_start, date_range_end }`
- Response `201`: `{ audit_cycle: AuditCycle }`
- Behavior: `created_by` comes from the authenticated User.
- Errors: `400` invalid scope or dates; `401` unauthenticated; `403` not Admin; `409` incompatible cycle already exists.

### `POST /audit-cycles/:id/auditors`

- Request: `{ auditor_ids: string[] }`
- Response `201`: `{ assignments: AuditAssignment[] }`
- Errors: `400` invalid cycle or auditor; `401` unauthenticated; `403` assignment forbidden; `409` cycle closed or auditor already assigned.

### `PATCH /audit-cycles/:id/findings`

- Request: `{ findings: [{ asset_id, result, notes? }] }`
- Response `200`: `{ findings: AuditFinding[] }`
- Errors: `400` invalid Asset, result, or notes; `401` unauthenticated; `403` auditor or approval permission missing; `409` cycle closed or Asset outside scope.

### `POST /audit-cycles/:id/close`

- Request: `{ confirmation: true }`
- Response `200`: `{ audit_cycle: AuditCycle, assets_marked_lost: Asset[], discrepancy_summary: object }`
- Behavior: locks the cycle and transitions confirmed-missing Assets to Lost.
- Errors: `400` confirmation absent or findings incomplete; `401` unauthenticated; `403` closure forbidden; `409` already closed or unresolved discrepancies block closure.

### `GET /audit-cycles/:id/discrepancy-report`

- Request: AuditCycle identifier.
- Response `200`: `{ audit_cycle: AuditCycle, findings: AuditFinding[], summary: object }`
- Errors: `400` invalid identifier; `401` unauthenticated; `403` report forbidden; `409` report not yet available.

## Reports

### `GET /reports/utilization`

- Request: optional date, department, category, location, or Asset filters.
- Response `200`: `{ rows: object[], summary: object }`
- Errors: `400` invalid filter or dates; `401` unauthenticated; `403` scope forbidden.

### `GET /reports/maintenance-frequency`

- Request: optional date, department, category, location, or Asset filters.
- Response `200`: `{ rows: object[], summary: object }`
- Errors: `400` invalid filter; `401` unauthenticated; `403` scope forbidden.

### `GET /reports/department-allocation-summary`

- Request: optional department, date, category, or status filters.
- Response `200`: `{ rows: object[], summary: object }`
- Errors: `400` invalid filter; `401` unauthenticated; `403` organization-wide or out-of-department data forbidden.

### `GET /reports/booking-heatmap`

- Request: optional Asset, department, location, and date filters.
- Response `200`: `{ cells: [{ day_of_week, hour, booking_count }], summary: object }`
- Errors: `400` invalid filter or date; `401` unauthenticated; `403` scope forbidden.

### `GET /reports/ghost-risk`

- Request: optional department, category, location, or age-threshold filters.
- Response `200`: `{ assets: Asset[], count, acquisition_value, threshold_days }`
- Behavior: backed by `v_ghost_risk`.
- Errors: `400` invalid threshold or filter; `401` unauthenticated; `403` scope forbidden.

### `GET /reports/export`

- Request: query parameters such as `report`, `format=csv`, and report filters.
- Response `200`: downloadable output.
- Errors: `400` unsupported report, format, or filter; `401` unauthenticated; `403` export forbidden; `409` no exportable result for the parameters.

## Notifications and Activity

### `GET /notifications`

- Request: optional `read`, type, and pagination filters.
- Response `200`: `{ notifications: Notification[], unread_count }`
- Errors: `400` invalid filter; `401` unauthenticated; `403` another User's notifications requested.

### `PATCH /notifications/:id/read`

- Request: `{ read: true }`
- Response `200`: `{ notification: Notification }`
- Errors: `400` invalid identifier or read value; `401` unauthenticated; `403` Notification belongs to another User; `409` incompatible Notification state.

### `GET /activity-log`

- Request: optional actor, action, entity type, entity identifier, date, sorting, and pagination filters.
- Response `200`: `{ activity: ActivityLog[] }`
- Errors: `400` invalid filter; `401` unauthenticated; `403` activity scope forbidden.

## Dashboard

### `GET /dashboard/kpis`

- Request: optional department or date-scope filters where permitted.
- Response `200`: `{ available_assets, allocated_assets, maintenance_today, active_bookings, pending_transfers, upcoming_returns, overdue_returns, ghost_risk }`
- Errors: `400` invalid scope or date; `401` unauthenticated; `403` organization-wide or out-of-department KPI access forbidden.
