# Authentication backend scaffold

This folder owns the backend authentication contract, Bearer-token context, employee-only signup boundary, PostgreSQL persistence, and role/department guards. `createAuthRouter` exposes the contract under `/api/v1/auth` through `auth/server.ts`.

The public signup input deliberately has no `role` property. Runtime validation must also reject unknown elevated-role input rather than silently accepting it.

Set `DATABASE_URL`, `DATABASE_APP_ROLE`, `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_TTL_SECONDS`, and `AUTH_PORT` before running `npm run dev:auth`. Passwords use Node scrypt; JWTs contain only the User subject and are checked against the current database User on every authenticated request. `DATABASE_APP_ROLE=assetflow_app` keeps runtime connections from mutating ActivityLog rows.
