import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { loadAuthConfig } from "../config";
import { PgUserRepository } from "../repository";
import { AuthService } from "../service";

const adminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://assetflow:assetflow@localhost:5432/postgres";
const migrationFiles = ["001_extensions.sql", "002_schema_v0.sql", "003_canonical_constraints.sql"];
let databaseName: string;
let adminPool: Pool;
let pool: Pool;
let service: AuthService;

describe("auth PostgreSQL integration", () => {
  beforeAll(async () => {
    databaseName = `assetflow_auth_${randomUUID().replaceAll("-", "")}`;
    adminPool = new Pool({ connectionString: adminUrl });
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    const target = new URL(adminUrl);
    target.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: target.toString() });
    for (const migration of migrationFiles) {
      await pool.query(await readFile(resolve(process.cwd(), "db", "migrations", migration), "utf8"));
    }
    service = new AuthService(new PgUserRepository(pool), loadAuthConfig({
      JWT_SECRET: "integration-test-secret-that-is-longer-than-32-characters",
      JWT_ISSUER: "assetflow",
      JWT_AUDIENCE: "assetflow-api",
      JWT_TTL_SECONDS: "3600",
      AUTH_PORT: "3000",
    }));
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
    await adminPool?.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    await adminPool?.end();
  });

  it("enforces CITEXT email uniqueness through the signup service", async () => {
    await service.signup({ name: "First Employee", email: "Case@Test.example", password: "correct horse battery staple" });
    await expect(service.signup({ name: "Second Employee", email: "case@test.EXAMPLE", password: "correct horse battery staple" })).rejects.toMatchObject({
      status: 409,
      code: "EMAIL_ALREADY_REGISTERED",
    });
  });
});
