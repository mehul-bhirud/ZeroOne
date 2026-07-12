# AssetFlow

AssetFlow is a PostgreSQL-first asset and resource management system. The repository contains the complete hackathon baseline, database invariants, seed fixtures, authentication, domain services, and frontend workflows for the ten-screen MVP.

## Branch ownership

| Owner | Branch | Paths |
|---|---|---|
| Vishvesh | `feature/data-layer` | `db/migrations`, `db/seed`, `auth` |
| Mehul | `feature/domain-logic` | `services`, `domain`, `jobs`, `tests` |
| Sarthak | `feature/fe-core` | design system, auth UI, org setup, registry, allocation |
| Yuvraj | `feature/fe-features` | dashboard, booking, maintenance, audit, clearance, reports, notifications |

Future Codex work is expected to continue on Vishvesh's `feature/data-layer` branch unless explicitly reassigned.

## Quick start

1. Copy `.env.example` to `.env` and replace development secrets.
2. Start PostgreSQL with `docker compose up -d postgres`.
3. Install dependencies with `npm ci --include=optional`.
4. Run the frontend with `npm run dev`.
5. Run the full non-database check with `npm run check`.

The API base path is `/api/v1`. The locked endpoint contract and complete specification are in `docs/`.

For a local demo database, apply migrations `001_extensions.sql` through `006_exit_clearance.sql`, set `MIGRATION_DATABASE_URL`, `SEED_ALLOW_RESET=true`, and a development-only `SEED_DEMO_PASSWORD`, then run `npm run db:seed` followed by `npm run db:seed:verify`. The seed is intentionally destructive and refuses non-local databases.

For a clean end-to-end database proof, run `npm run db:verify:clean`. It creates a uniquely named throwaway database, applies migrations `001`–`006`, runs the seed and all existing SQL verifiers, inspects indexes/constraints/triggers/roles/views, runs two-session allocation and booking races, and drops the database even when a check fails. It expects PostgreSQL at `postgres://assetflow:assetflow@localhost:5432/assetflow`, normally supplied by `docker compose up -d postgres`.

## Architecture

```text
PostgreSQL migrations + seed
            |
auth -> domain -> services -> REST API contract
                              |
                      React frontend
```

PostgreSQL remains the source of truth for lifecycle state, concurrency constraints, append-only history, Exit Clearance, and analytics views. The REST API is mounted at `/api/v1`, with authentication and role checks enforced in the backend.

## Verified database proof

The clean proof covers:

- Sequence-generated `AF-0001` tags, case-insensitive email uniqueness, and the JSONB GIN index.
- Active allocation uniqueness with reallocation after return.
- Legal back-to-back bookings and rejected overlap (`23P01`, `bookings_no_active_overlap_excl`).
- Exit Clearance (`AF001`, `users_exit_clearance_required`) and append-only ActivityLog (`55000`).
- Seed counts, non-empty Ghost Radar/KPI/utilization/maintenance/department/heatmap views.
- Two-session races proving that competing allocation or booking writes cannot both commit.

## Documentation

- `docs/PROJECT_SPEC.md` — canonical product and data specification
- `docs/API_CONTRACT.md` — locked REST contract
- `docs/team/` — ownership and hourly task plans
- `docs/ERD.md` — canonical entity relationship diagram and database invariants

The operating documents mention two original hackathon PDFs, but they were not present in the supplied source directory and therefore are not committed.
