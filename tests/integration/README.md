# Database integration harness

Integration tests will use a fresh PostgreSQL database, apply every file in `db/migrations` in lexical order, run per-test transactions, and cleanly close both application and administrative connections. The harness must prove behavior through service and database paths, including the five exact named tests in `AGENT.md`.
