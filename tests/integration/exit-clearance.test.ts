import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createAuthAppFromDatabase } from "../../auth/app";
import { loadAuthConfig } from "../../auth/config";
import { hashPassword } from "../../auth/password";

const adminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://assetflow:assetflow@localhost:5432/postgres";
const migrationFiles = [
  "001_extensions.sql",
  "002_schema_v0.sql",
  "003_canonical_constraints.sql",
  "004_activity_log_append_only.sql",
  "005_analytics_views.sql",
  "006_exit_clearance.sql",
];

let databaseName: string;
let adminPool: Pool;
let pool: Pool;
let appPool: Pool;
let app: ReturnType<typeof createAuthAppFromDatabase>["app"];
let employeeId: string;
let allocationId: string;
let bookingId: string;

describe("Exit Clearance", () => {
  beforeAll(async () => {
    databaseName = `assetflow_clearance_${randomUUID().replaceAll("-", "")}`;
    adminPool = new Pool({ connectionString: adminUrl });
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    const target = new URL(adminUrl);
    target.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: target.toString() });
    for (const migration of migrationFiles) {
      await pool.query(await readFile(resolve(process.cwd(), "db", "migrations", migration), "utf8"));
    }

    const departmentId = randomUUID();
    const adminId = randomUUID();
    employeeId = randomUUID();
    const categoryId = randomUUID();
    const assetId = randomUUID();
    allocationId = randomUUID();
    bookingId = randomUUID();
    const passwordHash = await hashPassword("correct horse battery staple");
    await pool.query("INSERT INTO departments (id, name, status) VALUES ($1, 'Clearance Test', 'active')", [departmentId]);
    await pool.query(`
      INSERT INTO users (id, name, email, password_hash, role, department_id, status)
      VALUES
        ($1, 'Clearance Admin', 'clearance-admin@example.test', $3, 'admin', $4, 'active'),
        ($2, 'Blocked Employee', 'blocked-employee@example.test', $3, 'employee', $4, 'active')
    `, [adminId, employeeId, passwordHash, departmentId]);
    await pool.query("INSERT INTO asset_categories (id, name) VALUES ($1, 'Clearance Category')", [categoryId]);
    await pool.query(`
      INSERT INTO assets (id, name, category_id, serial_number, acquisition_date, condition, location, status)
      VALUES ($1, 'Clearance Laptop', $2, 'CLEARANCE-HTTP-1', CURRENT_DATE, 'good', 'HQ', 'allocated')
    `, [assetId, categoryId]);
    await pool.query(`
      INSERT INTO allocations (id, asset_id, holder_type, holder_id, allocated_at)
      VALUES ($1, $2, 'user', $3, CURRENT_TIMESTAMP - interval '1 day')
    `, [allocationId, assetId, employeeId]);
    await pool.query(`
      INSERT INTO bookings (id, asset_id, booked_by, start_time, end_time, status)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP + interval '1 day', CURRENT_TIMESTAMP + interval '1 day 1 hour', 'upcoming')
    `, [bookingId, assetId, employeeId]);

    const created = createAuthAppFromDatabase(loadAuthConfig({
      JWT_SECRET: "exit-clearance-test-secret-that-is-longer-than-32-characters",
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

  it("cannot deactivate an employee with active custody or upcoming bookings", async () => {
    expect((await request(app).patch(`/api/v1/employees/${employeeId}/deactivate`).send({ reason: "Employee exit" })).status).toBe(401);
    const login = await request(app).post("/api/v1/auth/login").send({
      email: "clearance-admin@example.test",
      password: "correct horse battery staple",
    });
    expect(login.status).toBe(200);
    const token = login.body.access_token as string;

    const employeeLogin = await request(app).post("/api/v1/auth/login").send({
      email: "blocked-employee@example.test",
      password: "correct horse battery staple",
    });
    expect(employeeLogin.status).toBe(200);
    expect((await request(app)
      .patch(`/api/v1/employees/${employeeId}/deactivate`)
      .set("Authorization", `Bearer ${employeeLogin.body.access_token}`)
      .send({ reason: "Employee exit" })).status).toBe(403);

    const blocked = await request(app)
      .patch(`/api/v1/employees/${employeeId}/deactivate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Employee exit" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({ code: "EXIT_CLEARANCE_REQUIRED" });
    expect(blocked.body.error.details.employee.id).toBe(employeeId);
    expect(blocked.body.error.details.active_allocations).toHaveLength(1);
    expect(blocked.body.error.details.upcoming_bookings).toHaveLength(1);
    expect(blocked.body.error.details.checklist).toHaveLength(2);

    await expect(pool.query("UPDATE users SET status = 'inactive' WHERE id = $1", [employeeId])).rejects.toMatchObject({
      code: "AF001",
      constraint: "users_exit_clearance_required",
    });

    await pool.query("UPDATE allocations SET returned_at = CURRENT_TIMESTAMP WHERE id = $1", [allocationId]);
    await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [bookingId]);

    const cleared = await request(app)
      .patch(`/api/v1/employees/${employeeId}/deactivate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Employee exit" });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ clearance_complete: true, employee: { id: employeeId, status: "inactive" } });
  });
});
