import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createAuthAppFromDatabase } from "../../auth/app";
import { loadAuthConfig } from "../../auth/config";

const adminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://assetflow:assetflow@localhost:5432/postgres";
const migrationFiles = ["001_extensions.sql", "002_schema_v0.sql", "003_canonical_constraints.sql", "004_activity_log_append_only.sql"];
let databaseName: string;
let adminPool: Pool;
let pool: Pool;
let appPool: Pool;
let app: ReturnType<typeof createAuthAppFromDatabase>["app"];

describe("domain HTTP routes", () => {
  beforeAll(async () => {
    databaseName = `assetflow_routes_${randomUUID().replaceAll("-", "")}`;
    adminPool = new Pool({ connectionString: adminUrl });
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    const target = new URL(adminUrl);
    target.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: target.toString() });
    for (const migration of migrationFiles) {
      await pool.query(await readFile(resolve(process.cwd(), "db", "migrations", migration), "utf8"));
    }
    const categoryId = randomUUID();
    await pool.query("INSERT INTO asset_categories (id, name) VALUES ($1, 'Route Test')", [categoryId]);
    await pool.query(`
      INSERT INTO assets (id, name, category_id, serial_number, acquisition_date, condition, location, is_bookable)
      VALUES ($1, 'Route Test Asset', $2, 'ROUTE-TEST-1', CURRENT_DATE, 'good', 'HQ', true)
    `, [randomUUID(), categoryId]);
    const created = createAuthAppFromDatabase(loadAuthConfig({
      JWT_SECRET: "domain-route-test-secret-that-is-longer-than-32-characters",
      JWT_ISSUER: "assetflow",
      JWT_AUDIENCE: "assetflow-api",
      JWT_TTL_SECONDS: "3600",
      AUTH_PORT: "3000",
    }), target.toString());
    app = created.app;
    appPool = created.pool;
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
    await appPool?.end();
    await adminPool?.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    await adminPool?.end();
  });

  it("mounts authenticated booking, maintenance, and audit endpoints", async () => {
    expect((await request(app).get("/api/v1/bookings")).status).toBe(401);
    const credentials = { name: "Route User", email: "route-user@example.test", password: "correct horse battery staple" };
    const signup = await request(app).post("/api/v1/auth/signup").send(credentials);
    expect(signup.status).toBe(201);
    const login = await request(app).post("/api/v1/auth/login").send({ email: credentials.email, password: credentials.password });
    expect(login.status).toBe(200);
    const token = login.body.access_token as string;

    const bookings = await request(app).get("/api/v1/bookings").set("Authorization", `Bearer ${token}`);
    expect(bookings.status).toBe(200);
    expect(bookings.body).toEqual({ bookings: [] });

    const maintenance = await request(app).get("/api/v1/maintenance-requests").set("Authorization", `Bearer ${token}`);
    expect(maintenance.status).toBe(200);
    expect(Array.isArray(maintenance.body.maintenance_requests)).toBe(true);

    const forbiddenAudit = await request(app).post("/api/v1/audit-cycles").set("Authorization", `Bearer ${token}`).send({
      date_range_start: "2026-07-01",
      date_range_end: "2026-07-31",
    });
    expect(forbiddenAudit.status).toBe(403);
  });
});
