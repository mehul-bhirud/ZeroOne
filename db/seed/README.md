# Development seed

The seed is a destructive, exact development rebuild. It refuses to run unless `SEED_ALLOW_RESET=true`, uses `MIGRATION_DATABASE_URL` (the owner connection), and only permits localhost databases.

```powershell
$env:SEED_ALLOW_RESET = "true"
$env:SEED_DEMO_PASSWORD = "replace-with-a-development-only-password"
npm run db:seed
npm run db:seed:verify
```

The generated fixture contains 4 departments, 8 users, 5 categories, 18 assets, 5 allocations, 2 transfers, 6 bookings, 6 maintenance requests, 2 audit cycles, 3 audit assignments, 6 findings, 8 notifications, and 20 ActivityLog rows. Run `db/migrations/verify_004_activity_log.sql` after seeding to prove insert-only application-role access and owner-level trigger protection.

Demo users are `admin@assetflow.local`, `manager@assetflow.local`, `priya@assetflow.local`, `kabir@assetflow.local`, `meera@assetflow.local`, `rohan@assetflow.local`, `ishita@assetflow.local`, and `arjun@assetflow.local`. All use the password supplied through `SEED_DEMO_PASSWORD`; no password is committed.
