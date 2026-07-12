# AssetFlow

AssetFlow is a PostgreSQL-first asset and resource management system. This repository currently contains the shared hackathon baseline plus the first-hour scaffold for all four ownership areas.

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
3. Install dependencies with `npm install`.
4. Run the frontend with `npm run dev`.
5. Run all scaffold checks with `npm run check`.

The API base path is `/api/v1`. The locked endpoint contract and complete specification are in `docs/`.

## Architecture

```text
PostgreSQL migrations + seed
            |
auth -> domain -> services -> REST API contract
                              |
                      React frontend
```

The scaffold intentionally exposes interfaces and placeholders without pretending later-hour features are implemented.

## Documentation

- `docs/PROJECT_SPEC.md` — canonical product and data specification
- `docs/API_CONTRACT.md` — locked REST contract
- `docs/team/` — ownership and hourly task plans
- `docs/ERD.md` — initial canonical entity relationship draft

The operating documents mention two original hackathon PDFs, but they were not present in the supplied source directory and therefore are not committed.

