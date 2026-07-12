# Migration order

Apply migrations lexically with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <file>`:

1. `001_extensions.sql` enables `btree_gist`, `pg_trgm`, then `citext`.
2. `002_schema_v0.sql` creates canonical enums, entities, relationships, lifecycle fields, and timestamp types.
3. `003_canonical_constraints.sql` adds the sequence ownership, named checks, active-allocation uniqueness, and booking exclusion constraint.
4. `004_activity_log_append_only.sql` adds the append-only trigger and restricted `assetflow_app` role.

On a clean throwaway database, run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/verify_003_constraints.sql` after applying migrations 001–003. After seeding, run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/verify_004_activity_log.sql`; both verifiers roll back their fixtures on success.

Constraint handoff:

- Active allocation conflicts use SQLSTATE `23505` and `allocations_one_active_per_asset_idx`.
- Booking overlap conflicts use SQLSTATE `23P01` and `bookings_no_active_overlap_excl`.
- Case-insensitive email conflicts use SQLSTATE `23505` and `users_email_key`.
- ActivityLog mutation attempts use SQLSTATE `55000` from `reject_activity_log_mutation`; the `assetflow_app` role also lacks update/delete/truncate privileges.

Exit Clearance remains reserved for Vishvesh's later task block.
