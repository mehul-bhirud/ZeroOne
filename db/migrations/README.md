# Migration order

Apply migrations lexically with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <file>`:

1. `001_extensions.sql` enables `btree_gist`, `pg_trgm`, then `citext`.
2. `002_schema_v0.sql` creates canonical enums, entities, relationships, lifecycle fields, and timestamp types.
3. `003_canonical_constraints.sql` adds the sequence ownership, named checks, active-allocation uniqueness, and booking exclusion constraint.

On a clean throwaway database, run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/verify_003_constraints.sql` after applying the migrations. On success, the verifier rolls back its fixtures; on failure, psql may stop before the final `ROLLBACK` runs, so you may need to run `ROLLBACK;` manually in that session.

Constraint handoff:

- Active allocation conflicts use SQLSTATE `23505` and `allocations_one_active_per_asset_idx`.
- Booking overlap conflicts use SQLSTATE `23P01` and `bookings_no_active_overlap_excl`.
- Case-insensitive email conflicts use SQLSTATE `23505` and `users_email_key`.

Append-only ActivityLog and Exit Clearance remain reserved for Vishvesh's later task blocks.
