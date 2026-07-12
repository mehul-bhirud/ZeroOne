# Authentication backend scaffold

This folder owns the backend authentication contract, Bearer-token context, employee-only signup boundary, and role/department guards. Route adapters and persistence will be added after the database migration is executable.

The public signup input deliberately has no `role` property. Runtime validation must also reject unknown elevated-role input rather than silently accepting it.
