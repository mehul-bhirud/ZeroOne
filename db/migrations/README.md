# Migration order

Apply migrations lexically with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <file>`:

1. `001_extensions.sql` enables `btree_gist`, `pg_trgm`, then `citext`.
2. `002_schema_v0.sql` creates canonical enums, entities, relationships, lifecycle fields, and timestamp types.
3. `003_canonical_constraints.sql` adds the sequence ownership, named checks, active-allocation uniqueness, and booking exclusion constraint.
4. `004_activity_log_append_only.sql` adds the append-only trigger and restricted `assetflow_app` role.
5. `005_analytics_views.sql` adds `v_ghost_risk`, utilization, maintenance-frequency, department-allocation,
   booking-heatmap, and dashboard-KPI views. `maintenance_today` is the current approved/in-progress maintenance
   queue because the locked `maintenance_requests` table has no request timestamp.
6. `006_exit_clearance.sql` adds the `active -> inactive` User trigger and its actionable clearance error signature.

On a clean throwaway database, run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/verify_003_constraints.sql` after applying migrations 001–003. After seeding, run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/verify_004_activity_log.sql`; both verifiers roll back their fixtures on success.
After applying migration 005 and seeding, run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/verify_005_analytics_views.sql`; it validates view cardinality and seeded KPI/ghost/heatmap data, then rolls back.
After applying migration 006, run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/verify_006_exit_clearance.sql`; it validates direct-SQL blocking and successful deactivation after custody and booking blockers are resolved, then rolls back.

Constraint handoff:

- Active allocation conflicts use SQLSTATE `23505` and `allocations_one_active_per_asset_idx`.
- Booking overlap conflicts use SQLSTATE `23P01` and `bookings_no_active_overlap_excl`.
- Case-insensitive email conflicts use SQLSTATE `23505` and `users_email_key`.
- ActivityLog mutation attempts use SQLSTATE `55000` from `reject_activity_log_mutation`; the `assetflow_app` role also lacks update/delete/truncate privileges.
- Exit Clearance conflicts use SQLSTATE `AF001`, message `EXIT_CLEARANCE_REQUIRED`, and constraint diagnostic `users_exit_clearance_required`; the detail JSON contains the employee ID and blocking allocation/booking IDs.

The Admin deactivation route maps that trigger signature to the locked `409 EXIT_CLEARANCE_REQUIRED` response and enriches the detail payload with the employee, blocking rows, and checklist actions.

Analytics handoff:

- `v_ghost_risk` exposes `asset_id`, `asset_tag`, `asset_name`, category/location, `acquisition_cost`, verification age, and current-holder department.
- `v_utilization`, `v_maintenance_frequency`, and `v_department_allocation_summary` are one-row-per-asset or one-row-per-department report sources.
- `v_booking_heatmap` uses UTC hour buckets and counts occupied booking-hour cells, excluding cancelled and no-show bookings.
- `v_dashboard_kpis` returns one row with the eight locked dashboard KPI names.
