# Migration order

Apply migrations lexically with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <file>`:

1. `001_extensions.sql` enables `btree_gist`, `pg_trgm`, then `citext`.
2. `002_schema_v0.sql` creates canonical enums, entities, relationships, lifecycle fields, and timestamp types.

Constraint-heavy migrations (active-allocation uniqueness, booking exclusion, append-only history, and exit clearance) are intentionally reserved for Vishvesh's later task blocks.

