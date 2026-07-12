# AssetFlow

AssetFlow is a PostgreSQL-first asset and resource management system. The repository contains the working ten-screen MVP: authentication and RBAC, organization setup, asset registration, allocation and transfer, booking, maintenance, audit and exit-clearance workflows, notifications, and analytics reports.

This is a development/demo deployment. The seed is intentionally destructive and is restricted to a local database; do not point it at production data.

## Architecture

```text
PostgreSQL 17
  migrations 001-006 + deterministic development seed
          |
Express API (auth/server.ts, /api/v1)
  authentication, RBAC, domain services, database error mapping
          |
React + Vite SPA (frontend/)
  Vite /api proxy -> http://127.0.0.1:3000
```

PostgreSQL is the source of truth for lifecycle state and the hard invariants: active-allocation uniqueness, booking overlap exclusion, append-only ActivityLog protection, Exit Clearance, and analytics views. The API implementation is mounted by `auth/server.ts`; the locked request/response shapes are documented in [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md). The canonical entities and relationships are documented in [`docs/ERD.md`](docs/ERD.md).

## Prerequisites

- Node.js current LTS with npm.
- Docker Desktop (or Docker Engine) with Compose support.
- `psql` is useful for direct migration commands. It is not required if you use the `psql` client inside the PostgreSQL container.
- A local checkout of this repository.

## Local setup

1. Copy the development configuration and replace the placeholder JWT and seed values:

   ```powershell
   Copy-Item .env.example .env
   ```

   `.env` is ignored by Git. At minimum, use a random `JWT_SECRET` of at least 32 characters when running the API and provide a development-only `SEED_DEMO_PASSWORD` with at least 12 characters when seeding.

2. Install dependencies and start PostgreSQL 17:

   ```powershell
   npm ci --include=optional
   docker compose up -d postgres
   docker compose ps
   ```

3. Apply migrations in lexical order. With a host `psql` client:

   ```powershell
   Get-ChildItem db/migrations -Filter '*.sql' |
     Where-Object { $_.Name -match '^00[1-6]_' } |
     Sort-Object Name |
     ForEach-Object { psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f $_.FullName }
   ```

   If `psql` is not installed on the host, run the same files through the container:

   ```powershell
   Get-ChildItem db/migrations -Filter '*.sql' |
     Where-Object { $_.Name -match '^00[1-6]_' } |
     Sort-Object Name |
     ForEach-Object {
       Get-Content $_.FullName -Raw |
         docker compose exec -T postgres psql -U assetflow -d assetflow -v ON_ERROR_STOP=1
     }
   ```

   The migration order is:

   1. `001_extensions.sql` — `btree_gist`, `pg_trgm`, and `citext`.
   2. `002_schema_v0.sql` — tables, enums, relationships, and lifecycle columns.
   3. `003_canonical_constraints.sql` — sequence ownership, named checks, active-allocation uniqueness, and booking exclusion.
   4. `004_activity_log_append_only.sql` — append-only trigger and `assetflow_app` runtime role.
   5. `005_analytics_views.sql` — Ghost Radar, utilization, maintenance, department, heatmap, and dashboard KPI views.
   6. `006_exit_clearance.sql` — the `active -> inactive` user clearance trigger.

4. Load deterministic demo data into a local database. The operation truncates the application tables, so use it only for development:

   ```powershell
   $env:SEED_ALLOW_RESET = "true"
   $env:SEED_DEMO_PASSWORD = Read-Host "Development-only demo password"
   npm run db:seed
   npm run db:seed:verify
   ```

   The seed creates 4 departments, 8 users, 5 categories, 18 assets, allocations, transfers, bookings, maintenance requests, audit cycles/findings, notifications, and ActivityLog rows. It refuses non-local, production-like database names.

5. Start the API and SPA in separate terminals:

   ```powershell
   # terminal 1
   npm run dev:auth

   # terminal 2
   npm run dev
   ```

   The API listens on `http://127.0.0.1:3000` and exposes `/api/v1`; the Vite development server listens on `http://127.0.0.1:5173` and proxies `/api` to the API. Open `http://127.0.0.1:5173` in a browser.

## Environment variables

`.env.example` is the source of truth for local names and defaults:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Runtime API connection string. |
| `MIGRATION_DATABASE_URL` | Owner connection used by migrations and the destructive seed. |
| `DATABASE_APP_ROLE` | Optional runtime PostgreSQL role; use `assetflow_app` to preserve ActivityLog protections. |
| `JWT_SECRET` | Signing secret; use a random value with at least 32 characters. |
| `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_TTL_SECONDS` | JWT validation settings. |
| `AUTH_PORT` | Express API port; defaults to `3000`. |
| `SEED_ALLOW_RESET` | Must be `true` to permit the local destructive seed. Keep `false` otherwise. |
| `SEED_DEMO_PASSWORD` | Runtime password applied to every generated demo user; never commit it. |
| `VITE_API_BASE_URL` | Optional frontend API base override; the Vite dev proxy handles `/api` by default. |

## Development scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite frontend. |
| `npm run dev:auth` | Start the Express auth/domain API. |
| `npm run build` | Type-check and build the frontend. |
| `npm test` | Run unit and service tests (excluding the database-backed auth integration test). |
| `npm run test:auth:integration` | Run the auth integration suite against its configured database. |
| `npm run check` | Run the frontend build and the standard test suite. |
| `npm run db:seed` | Rebuild local deterministic fixtures; destructive and guarded. |
| `npm run db:seed:verify` | Assert seed counts, relative-date fixtures, tags, and cross-table invariants. |
| `npm run db:verify:clean` | Create a throwaway database, apply migrations 001–006, seed it, run all verifiers, inspect catalog/analytics, run RBAC smoke, prove two-session races, and always drop the database. |

## Database proof and error handoff

The repeatable clean proof (`npm run db:verify:clean`) is the preferred pre-demo check. It covers sequence-generated tags (`AF-0001`), case-insensitive email uniqueness, the `custom_fields` GIN index, allocation re-use after return, legal back-to-back bookings, overlap rejection, Exit Clearance, append-only ActivityLog permissions, populated analytics views, seed counts, four-role RBAC, and concurrent allocation/booking races.

The locked database signatures consumed by the service error mapper are:

- Active allocation conflict: SQLSTATE `23505`, `allocations_one_active_per_asset_idx`.
- Booking overlap: SQLSTATE `23P01`, `bookings_no_active_overlap_excl`.
- Case-insensitive email conflict: SQLSTATE `23505`, `users_email_key`.
- ActivityLog mutation: SQLSTATE `55000`, trigger `reject_activity_log_mutation`.
- Exit Clearance: SQLSTATE `AF001`, diagnostic `users_exit_clearance_required`.

The individual SQL verifiers live under [`db/migrations`](db/migrations). Their order and assumptions are recorded in [`db/migrations/README.md`](db/migrations/README.md).

## RBAC demo users (test-only)

The seed creates the following users. Every user receives the password supplied in `SEED_DEMO_PASSWORD`; no password is stored in the repository:

| Role | Email |
|---|---|
| Admin | `admin@assetflow.local` |
| Asset Manager | `manager@assetflow.local` |
| Department Head | `priya@assetflow.local`, `kabir@assetflow.local` |
| Employee | `meera@assetflow.local`, `rohan@assetflow.local`, `ishita@assetflow.local`, `arjun@assetflow.local` |

These accounts are fixtures for local or isolated test deployments only. Change or remove them before exposing an environment to untrusted users.

## VM/Caddy test deployment

The repository does not commit host-specific Caddy or systemd configuration. For the existing isolated VM test deployment, build the frontend from the merged checkout, run PostgreSQL in Docker, bind the API to a loopback port, and let host Caddy terminate TLS, serve the built SPA, and proxy `/api` to that loopback API. Keep database credentials and JWT secrets in the VM environment, not in Git.

The public test host used by the team is `proto.vishvesh.dns.army`. Treat it as a disposable test environment: run the clean proof before a deployment, use only seeded demo credentials, and do not put production or personal data there. When changing the host configuration, validate Caddy before reload and keep a backup of the previous Caddyfile; host configuration is outside this repository.

## Documentation and ownership

- [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) — canonical product and data specification.
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — locked REST request/response contract.
- [`docs/ERD.md`](docs/ERD.md) — canonical entity relationship diagram and invariants.
- [`docs/team/`](docs/team) — ownership and time-slot task plans.
- [`auth/README.md`](auth/README.md) — authentication configuration and security notes.
- [`db/seed/README.md`](db/seed/README.md) — seed safety and fixture details.
- [`tests/integration/README.md`](tests/integration/README.md) — integration-test prerequisites.

The original hackathon PDFs referenced by the operating documents were not present in the supplied source directory and are therefore not committed.

## Assumptions and known limitations

- UUIDs are generated by the application/fixtures; database checks enforce relationships and concurrency invariants.
- `holder_type`/`holder_id` is intentionally polymorphic. The service layer validates holder semantics because the locked contract does not define one database-safe holder enum or foreign-key target.
- The local Compose file provisions PostgreSQL only. The API and frontend are separate Node processes; production process supervision, TLS, backups, and Caddy configuration remain host concerns.
- Password reset is an API contract workflow, not an email delivery integration. Demo credentials are fixtures, not an identity-management system.
- The clean proof uses a disposable local database and should be run again after changing migrations, seed fixtures, or database-facing services.
