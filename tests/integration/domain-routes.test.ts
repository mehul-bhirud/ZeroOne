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
const migrationFiles = ["001_extensions.sql", "002_schema_v0.sql", "003_canonical_constraints.sql", "004_activity_log_append_only.sql", "005_analytics_views.sql", "006_exit_clearance.sql"];
let databaseName: string;
let adminPool: Pool;
let pool: Pool;
let appPool: Pool;
let app: ReturnType<typeof createAuthAppFromDatabase>["app"];
let assetId: string;

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
    assetId = randomUUID();
    await pool.query(`
      INSERT INTO assets (id, name, category_id, serial_number, acquisition_date, condition, location, is_bookable)
      VALUES ($1, 'Route Test Asset', $2, 'ROUTE-TEST-1', CURRENT_DATE, 'good', 'HQ', true)
    `, [assetId, categoryId]);
    await pool.query(
      "INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Route Admin', 'route-admin@example.test', $2, 'admin', 'active')",
      [randomUUID(), await hashPassword("correct horse battery staple")],
    );
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
    await adminPool?.query(`DROP DATABASE "${databaseName}"`);
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

    const notifications = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${token}`);
    expect(notifications.status).toBe(200);
    expect(notifications.body).toEqual({ notifications: [], unread_count: 0 });

    const activity = await request(app).get("/api/v1/activity-log").set("Authorization", `Bearer ${token}`);
    expect(activity.status).toBe(200);
    expect(activity.body).toEqual({ activity: [] });

    const passport = await request(app).get(`/api/v1/assets/${assetId}`).set("Authorization", `Bearer ${token}`);
    expect(passport.status).toBe(200);
    expect(passport.body.asset).toMatchObject({ id: assetId, name: "Route Test Asset" });
    expect(passport.body).toMatchObject({ allocations: [], transfer_requests: [], bookings: [], maintenance_requests: [], audit_findings: [], activity: [] });
    expect((await request(app).patch(`/api/v1/assets/${assetId}`).set("Authorization", `Bearer ${token}`).send({ status: "retired" })).status).toBe(403);

    const allocationId = randomUUID();
    await pool.query(`
      INSERT INTO allocations (id, asset_id, holder_type, holder_id, allocated_at)
      VALUES ($1, $2, 'user', $3, CURRENT_TIMESTAMP)
    `, [allocationId, assetId, randomUUID()]);
    expect((await request(app).post(`/api/v1/allocations/${allocationId}/return`).set("Authorization", `Bearer ${token}`).send({ action: "request" })).status).toBe(403);

    const maintenance = await request(app).get("/api/v1/maintenance-requests").set("Authorization", `Bearer ${token}`);
    expect(maintenance.status).toBe(200);
    expect(Array.isArray(maintenance.body.maintenance_requests)).toBe(true);

    const forbiddenAudit = await request(app).post("/api/v1/audit-cycles").set("Authorization", `Bearer ${token}`).send({
      date_range_start: "2026-07-01",
      date_range_end: "2026-07-31",
    });
    expect(forbiddenAudit.status).toBe(403);
  });

  it("mounts allocation and reporting routes with the locked role and response guards", async () => {
    const login = await request(app).post("/api/v1/auth/login").send({
      email: "route-admin@example.test",
      password: "correct horse battery staple",
    });
    expect(login.status).toBe(200);
    const token = login.body.access_token as string;
    const auth = { Authorization: `Bearer ${token}` };

    for (const path of [
      "/departments",
      "/categories",
      "/employees",
      "/transfer-requests",
      "/reports/utilization",
      "/reports/maintenance-frequency",
      "/reports/department-allocation-summary",
      "/reports/booking-heatmap",
      "/reports/ghost-risk",
      "/dashboard/kpis",
    ]) {
      const response = await request(app).get(`/api/v1${path}`).set(auth);
      expect(response.status, path).toBe(200);
    }

    const createdDepartment = await request(app)
      .post("/api/v1/departments")
      .set(auth)
      .send({ name: "Integration Department", status: "active" });
    expect(createdDepartment.status).toBe(201);
    expect(createdDepartment.body.department).toMatchObject({ name: "Integration Department", status: "active" });

    const updatedDepartment = await request(app)
      .patch("/api/v1/departments")
      .set(auth)
      .send({ id: createdDepartment.body.department.id, name: "Integrated Department" });
    expect(updatedDepartment.status).toBe(200);
    expect(updatedDepartment.body.department.name).toBe("Integrated Department");

    const createdCategory = await request(app)
      .post("/api/v1/categories")
      .set(auth)
      .send({ name: "Integration Category", custom_fields: { warranty: "date" } });
    expect(createdCategory.status).toBe(201);
    expect(createdCategory.body.category.custom_fields).toEqual({ warranty: "date" });

    const updatedCategory = await request(app)
      .patch("/api/v1/categories")
      .set(auth)
      .send({ id: createdCategory.body.category.id, custom_fields: { owner: "text" } });
    expect(updatedCategory.status).toBe(200);
    expect(updatedCategory.body.category.custom_fields).toEqual({ owner: "text" });

    const employee = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = 'route-user@example.test'");
    const updatedEmployee = await request(app)
      .patch(`/api/v1/employees/${employee.rows[0].id}`)
      .set(auth)
      .send({ role: "department_head", department_id: createdDepartment.body.department.id });
    expect(updatedEmployee.status).toBe(200);
    expect(updatedEmployee.body.employee).toMatchObject({ role: "department_head", department_id: createdDepartment.body.department.id });

    const exportResponse = await request(app)
      .get("/api/v1/reports/export?report=ghost-risk&format=csv")
      .set(auth);
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers["content-type"]).toContain("text/csv");

    expect((await request(app).post("/api/v1/allocations").set(auth).send({})).status).toBe(400);
    expect((await request(app).post("/api/v1/transfer-requests").set(auth).send({})).status).toBe(400);
  });
});
