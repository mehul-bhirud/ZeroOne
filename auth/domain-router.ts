import { Router, type RequestHandler } from "express";
import type { AuthConfig } from "./config";
import { authenticateBearer } from "./middleware";
import { effectiveDepartmentScope, requireRoles } from "./rbac";
import type { UserRepository } from "./repository";
import { AuditService } from "../services/audit-service";
import { BookingService } from "../services/booking-service";
import { MaintenanceService } from "../services/maintenance-service";
import { AssetService } from "../services/asset-service";
import { AllocationService } from "../services/allocation-service";
import { TransferService } from "../services/transfer-service";
import type { DatabaseClient } from "../services/db";
import { ExitClearanceService } from "./exit-clearance";
import { AuthorizationError, ValidationError } from "../domain/errors";

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

function currentUser(response: Parameters<RequestHandler>[1]) {
  return response.locals.auth.user as { id: string; role: string; department_id?: string };
}

function pathId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function queryValue(request: Parameters<RequestHandler>[0], key: string): string | undefined {
  const value = request.query[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function addFilter(where: string[], params: unknown[], expression: string, value: unknown): void {
  if (typeof value === "string" && value.trim()) {
    params.push(value.trim());
    where.push(expression.replace("?", `$${params.length}`));
  }
}

function csvValue(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: Record<string, unknown>[]): string {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [keys.join(","), ...rows.map((row) => keys.map((key) => csvValue(row[key])).join(","))].join("\n");
}

async function reportRows(
  db: DatabaseClient,
  report: string,
  request: Parameters<RequestHandler>[0],
  user: { id: string; role: string; department_id?: string },
): Promise<Record<string, unknown>[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  const requestedDepartment = queryValue(request, "department") ?? queryValue(request, "department_id");
  const scopedDepartment = user.role === "department_head"
    ? effectiveDepartmentScope({ user } as never, requestedDepartment)
    : requestedDepartment;
  const location = queryValue(request, "location");
  const category = queryValue(request, "category") ?? queryValue(request, "category_id");
  const status = queryValue(request, "status");

  if (report === "utilization") {
    addFilter(where, params, "u.department_id::text = ?", scopedDepartment);
    addFilter(where, params, "u.location = ?", location);
    addFilter(where, params, "c.id::text = ?", category);
    addFilter(where, params, "u.status = ?", status);
    const result = await db.query<Record<string, unknown>>(`
      SELECT u.asset_id, u.asset_tag, u.asset_name AS name, c.name AS category,
             u.location, u.status, u.is_bookable, u.booking_count, u.booked_minutes,
             CASE WHEN u.is_bookable THEN ROUND(LEAST(100, (u.booked_minutes::numeric / 1440) * 100), 2) ELSE 0 END AS utilization_pct
      FROM v_utilization u
      JOIN asset_categories c ON c.id = u.category_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY u.asset_tag
    `, params);
    return result.rows;
  }

  if (report === "maintenance-frequency") {
    addFilter(where, params, "m.department_id::text = ?", scopedDepartment);
    addFilter(where, params, "m.location = ?", location);
    addFilter(where, params, "c.id::text = ?", category);
    const result = await db.query<Record<string, unknown>>(`
      SELECT m.asset_id, m.asset_tag, m.asset_name AS name, c.name AS category,
             m.location, m.request_count AS incident_count, m.resolved_count,
             m.open_count, m.high_priority_count, 0::numeric AS avg_downtime_days
      FROM v_maintenance_frequency m
      JOIN asset_categories c ON c.id = m.category_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY m.asset_tag
    `, params);
    return result.rows;
  }

  if (report === "department-allocation-summary") {
    addFilter(where, params, "s.department_id::text = ?", scopedDepartment);
    const result = await db.query<Record<string, unknown>>(`
      SELECT s.department_id, s.department_name AS department,
             s.allocated_asset_count AS allocated_assets,
             s.allocated_asset_count + available.available_assets AS total_assets,
             available.available_assets,
             s.active_allocation_count, s.overdue_return_count, s.allocated_acquisition_value
      FROM v_department_allocation_summary s
      CROSS JOIN (SELECT COUNT(*)::integer AS available_assets FROM assets WHERE status = 'available') available
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY s.department_name
    `, params);
    return result.rows;
  }

  if (report === "booking-heatmap") {
    addFilter(where, params, "a.location = ?", location);
    addFilter(where, params, "a.category_id::text = ?", category);
    addFilter(where, params, "b.asset_id::text = ?", queryValue(request, "asset_id"));
    addFilter(where, params, "b.status = ?", status);
    const result = await db.query<Record<string, unknown>>(`
      SELECT (EXTRACT(isodow FROM slot.hour_start)::integer % 7) AS day_of_week,
             EXTRACT(hour FROM slot.hour_start)::integer AS hour,
             COUNT(*)::integer AS booking_count,
             SUM(EXTRACT(epoch FROM (
               LEAST(b.end_time, (slot.hour_start + interval '1 hour') AT TIME ZONE 'UTC')
               - GREATEST(b.start_time, slot.hour_start AT TIME ZONE 'UTC')
             )) / 60)::bigint AS booked_minutes
      FROM bookings b
      JOIN assets a ON a.id = b.asset_id
      CROSS JOIN LATERAL generate_series(
        date_trunc('hour', b.start_time AT TIME ZONE 'UTC'),
        date_trunc('hour', (b.end_time - interval '1 microsecond') AT TIME ZONE 'UTC'),
        interval '1 hour'
      ) AS slot(hour_start)
      WHERE b.status NOT IN ('cancelled', 'no_show')
        ${where.length ? `AND ${where.join(" AND ")}` : ""}
      GROUP BY EXTRACT(isodow FROM slot.hour_start), EXTRACT(hour FROM slot.hour_start)
      ORDER BY day_of_week, hour
    `, params);
    return result.rows;
  }

  if (report === "ghost-risk") {
    addFilter(where, params, "g.department_id::text = ?", scopedDepartment);
    addFilter(where, params, "g.location = ?", location);
    addFilter(where, params, "g.category_id::text = ?", category);
    const threshold = queryValue(request, "threshold_days");
    if (threshold && (!/^\d+$/.test(threshold) || Number(threshold) < 1 || Number(threshold) > 3650)) {
      throw new ValidationError("threshold_days must be an integer from 1 to 3650");
    }
    if (threshold) addFilter(where, params, "g.days_since_verified >= ?", threshold);
    const result = await db.query<Record<string, unknown>>(`
      SELECT g.asset_id AS id, g.asset_tag, g.asset_name AS name, g.category_name AS category,
             g.serial_number, g.status, g.location, g.acquisition_cost,
             g.last_verified_at, g.days_since_verified
      FROM v_ghost_risk g
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY g.days_since_verified DESC NULLS FIRST, g.asset_tag
    `, params);
    return result.rows;
  }

  throw new ValidationError("Unsupported report. Choose utilization, maintenance-frequency, department-allocation-summary, booking-heatmap, or ghost-risk.");
}

export function createDomainRouter(config: AuthConfig, repository: UserRepository, db: DatabaseClient): Router {
  const router = Router();
  const authenticate = authenticateBearer(repository, config);
  const audit = new AuditService(db);
  const bookings = new BookingService(db);
  const maintenance = new MaintenanceService(db);
  const exitClearance = new ExitClearanceService(db);
  const assets = new AssetService(db);
  const allocations = new AllocationService(db);
  const transfers = new TransferService(db);

  router.use(authenticate);

  router.get("/assets", asyncRoute(async (request, response) => {
    response.json(await assets.list(request.query as Record<string, string | number | boolean | undefined>));
  }));
  router.post("/assets", requireRoles("admin", "asset_manager"), asyncRoute(async (request, response) => {
    response.status(201).json(await assets.create(request.body ?? {}));
  }));
  router.get("/assets/:id", asyncRoute(async (request, response) => {
    response.json(await assets.get(pathId(request.params.id)));
  }));
  router.patch("/assets/:id", requireRoles("admin", "asset_manager"), asyncRoute(async (request, response) => {
    response.json(await assets.update(pathId(request.params.id), request.body ?? {}));
  }));

  router.get("/departments", requireRoles("admin", "asset_manager", "department_head"), asyncRoute(async (_request, response) => {
    const { rows } = await db.query(`
      SELECT id, name, parent_department_id, head_user_id, status
      FROM departments
      ORDER BY name
    `);
    response.json({ departments: rows });
  }));

  router.get("/employees", requireRoles("admin", "asset_manager", "department_head"), asyncRoute(async (request, response) => {
    const user = currentUser(response);
    const params: unknown[] = [];
    const where: string[] = [];
    const requestedDepartment = queryValue(request, "department") ?? queryValue(request, "department_id");
    const department = user.role === "department_head"
      ? effectiveDepartmentScope({ user } as never, requestedDepartment)
      : requestedDepartment;
    addFilter(where, params, "u.department_id::text = ?", department);
    addFilter(where, params, "u.role = ?", queryValue(request, "role"));
    addFilter(where, params, "u.status = ?", queryValue(request, "status"));
    const search = queryValue(request, "search");
    if (search) {
      params.push(`%${search}%`);
      where.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.email, u.role, u.department_id, u.status
      FROM users u
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY u.name
    `, params);
    response.json({ employees: rows });
  }));

  router.post("/allocations", requireRoles("admin", "asset_manager"), asyncRoute(async (request, response) => {
    response.status(201).json(await allocations.create({ ...request.body, actor_id: currentUser(response).id }));
  }));

  router.post("/transfer-requests", requireRoles("admin", "asset_manager", "employee"), asyncRoute(async (request, response) => {
    response.status(201).json(await transfers.create({ ...request.body, requested_by: currentUser(response).id }));
  }));

  router.get("/transfer-requests", requireRoles("admin", "asset_manager"), asyncRoute(async (_request, response) => {
    const { rows } = await db.query(`
      SELECT t.id, t.asset_id, a.asset_tag, t.from_holder, t.to_holder, t.status,
             t.requested_by, t.approved_by,
             requester.name AS requested_by_name, approver.name AS approved_by_name
      FROM transfer_requests t
      JOIN assets a ON a.id = t.asset_id
      LEFT JOIN users requester ON requester.id = t.requested_by
      LEFT JOIN users approver ON approver.id = t.approved_by
      ORDER BY t.id DESC
    `);
    response.json({ transfer_requests: rows });
  }));

  const approveTransfer = asyncRoute(async (request, response) => {
    response.json(await transfers.approve(pathId(request.params.id), { ...request.body, approved_by: currentUser(response).id }));
  });
  const rejectTransfer = asyncRoute(async (request, response) => {
    response.json(await transfers.reject(pathId(request.params.id), { ...request.body, rejected_by: currentUser(response).id }));
  });
  router.patch("/transfer-requests/:id/approve", requireRoles("admin", "asset_manager"), approveTransfer);
  router.post("/transfer-requests/:id/approve", requireRoles("admin", "asset_manager"), approveTransfer);
  router.patch("/transfer-requests/:id/reject", requireRoles("admin", "asset_manager"), rejectTransfer);
  router.post("/transfer-requests/:id/reject", requireRoles("admin", "asset_manager"), rejectTransfer);

  router.patch("/employees/:id/deactivate", requireRoles("admin"), asyncRoute(async (request, response) => {
    response.json(await exitClearance.deactivate(
      pathId(request.params.id),
      currentUser(response).id,
      request.body?.reason,
    ));
  }));

  router.post("/allocations/:id/return", requireRoles("admin", "asset_manager", "employee"), asyncRoute(async (request, response) => {
    const actor = currentUser(response);
    const allocationId = pathId(request.params.id);
    if (actor.role === "employee") {
      const owner = await db.query<{ holder_id: string }>(
        "SELECT holder_id FROM allocations WHERE id = $1 AND returned_at IS NULL",
        [allocationId],
      );
      if (owner.rows.length === 0 || owner.rows[0].holder_id !== actor.id) {
        throw new AuthorizationError("Employees may only initiate returns for their own active allocations.");
      }
    }
    response.json(await allocations.returnAsset(allocationId, request.body ?? {}));
  }));

  router.get("/bookings", asyncRoute(async (request, response) => {
    response.json(await bookings.list(request.query as Record<string, string | number | boolean | undefined>));
  }));
  router.post("/bookings", asyncRoute(async (request, response) => {
    response.status(201).json(await bookings.create({ ...request.body, booked_by: currentUser(response).id }));
  }));
  router.post("/bookings/:id/cancel", asyncRoute(async (request, response) => {
    response.json(await bookings.cancel(pathId(request.params.id), request.body ?? {}));
  }));
  router.post("/bookings/:id/checkin", asyncRoute(async (request, response) => {
    response.json(await bookings.checkin(pathId(request.params.id), request.body ?? {}));
  }));

  const reportRoles = requireRoles("admin", "asset_manager", "department_head");
  const reportEndpoint = (report: string): RequestHandler => asyncRoute(async (request, response) => {
    const rows = await reportRows(db, report, request, currentUser(response));
    if (report === "ghost-risk") {
      const acquisitionValue = rows.reduce((total, row) => total + Number(row.acquisition_cost ?? 0), 0);
      response.json({ assets: rows, count: rows.length, acquisition_value: acquisitionValue, threshold_days: Number(queryValue(request, "threshold_days") ?? 90) });
      return;
    }
    if (report === "booking-heatmap") {
      response.json({ cells: rows, summary: { occupied_cells: rows.length, booking_count: rows.reduce((total, row) => total + Number(row.booking_count ?? 0), 0) } });
      return;
    }
    response.json({ rows, summary: { count: rows.length } });
  });
  router.get("/reports/utilization", reportRoles, reportEndpoint("utilization"));
  router.get("/reports/maintenance-frequency", reportRoles, reportEndpoint("maintenance-frequency"));
  router.get("/reports/department-allocation-summary", reportRoles, reportEndpoint("department-allocation-summary"));
  router.get("/reports/booking-heatmap", reportRoles, reportEndpoint("booking-heatmap"));
  router.get("/reports/ghost-risk", reportRoles, reportEndpoint("ghost-risk"));
  router.get("/reports/export", reportRoles, asyncRoute(async (request, response) => {
    if (queryValue(request, "format") !== "csv") throw new ValidationError("format must be csv");
    const report = queryValue(request, "report");
    if (!report || !["utilization", "maintenance-frequency", "department-allocation-summary", "booking-heatmap", "ghost-risk"].includes(report)) {
      throw new ValidationError("report must name a supported report");
    }
    const rows = await reportRows(db, report, request, currentUser(response));
    response.type("text/csv").set("Content-Disposition", `attachment; filename=report-${report}.csv`).send(csv(rows));
  }));

  router.get("/dashboard/kpis", reportRoles, asyncRoute(async (_request, response) => {
    const { rows } = await db.query("SELECT * FROM v_dashboard_kpis LIMIT 1");
    response.json(rows[0] ?? {});
  }));

  router.get("/notifications", asyncRoute(async (request, response) => {
    const user = currentUser(response);
    const params: unknown[] = [user.id];
    const where = ["user_id = $1"];
    if (request.query.read !== undefined) {
      if (request.query.read !== "true" && request.query.read !== "false") {
        throw new ValidationError("read must be true or false");
      }
      params.push(request.query.read === "true");
      where.push(`read = $${params.length}`);
    }
    if (typeof request.query.type === "string" && request.query.type.trim()) {
      params.push(request.query.type.trim());
      where.push(`type = $${params.length}`);
    }
    const { rows } = await db.query(`
      SELECT id, user_id, type, message, read
      FROM notifications
      WHERE ${where.join(" AND ")}
      ORDER BY id DESC
    `, params);
    const unread = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM notifications WHERE user_id = $1 AND read = false",
      [user.id],
    );
    response.json({ notifications: rows, unread_count: Number(unread.rows[0]?.count ?? 0) });
  }));

  router.patch("/notifications/:id/read", asyncRoute(async (request, response) => {
    const user = currentUser(response);
    if (request.body?.read !== true) throw new ValidationError("read must be true");
    const existing = await db.query<{ user_id: string }>("SELECT user_id FROM notifications WHERE id = $1", [pathId(request.params.id)]);
    if (existing.rows.length === 0) throw new ValidationError("Notification not found");
    if (existing.rows[0].user_id !== user.id) throw new AuthorizationError("This notification belongs to another User.");
    const { rows } = await db.query(`
      UPDATE notifications
      SET read = true
      WHERE id = $1 AND user_id = $2
      RETURNING id, user_id, type, message, read
    `, [pathId(request.params.id), user.id]);
    response.json({ notification: rows[0] });
  }));

  router.get("/activity-log", asyncRoute(async (request, response) => {
    const user = currentUser(response);
    const params: unknown[] = [];
    const where: string[] = [];
    const addFilter = (column: string, value: unknown) => {
      if (typeof value === "string" && value.trim()) {
        params.push(value.trim());
        where.push(`${column} = $${params.length}`);
      }
    };
    addFilter("actor_id", request.query.actor);
    addFilter("action", request.query.action);
    addFilter("entity_type", request.query.entity_type);
    addFilter("entity_id", request.query.entity_id);
    if (user.role !== "admin" && user.role !== "asset_manager") {
      params.push(user.id);
      where.push(`a.actor_id = $${params.length}`);
    }
    const { rows } = await db.query(`
      SELECT a.id, a.actor_id, COALESCE(u.name, a.actor_id::text, 'System') AS actor,
             a.action, a.entity_type, a.entity_id,
             a.entity_id AS entity_identifier, NULL::timestamptz AS timestamp,
             a.metadata
      FROM activity_log a
      LEFT JOIN users u ON u.id = a.actor_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY a.id DESC
    `, params);
    response.json({ activity: rows });
  }));

  router.get("/maintenance-requests", asyncRoute(async (request, response) => {
    response.json(await maintenance.list(request.query as Record<string, unknown>));
  }));
  router.post("/maintenance-requests", asyncRoute(async (request, response) => {
    response.status(201).json(await maintenance.create({ ...request.body, raised_by: currentUser(response).id }));
  }));
  router.patch("/maintenance-requests/:id/approve", requireRoles("admin", "asset_manager"), asyncRoute(async (request, response) => {
    response.json(await maintenance.approve(pathId(request.params.id), { ...request.body, approved_by: currentUser(response).id }));
  }));
  router.patch("/maintenance-requests/:id/reject", requireRoles("admin", "asset_manager"), asyncRoute(async (request, response) => {
    response.json(await maintenance.reject(pathId(request.params.id), { ...request.body, rejected_by: currentUser(response).id }));
  }));
  router.patch("/maintenance-requests/:id/assign-technician", requireRoles("admin", "asset_manager"), asyncRoute(async (request, response) => {
    response.json(await maintenance.assignTechnician(pathId(request.params.id), { ...request.body, assigned_by: currentUser(response).id }));
  }));
  router.patch("/maintenance-requests/:id/start", requireRoles("admin", "asset_manager"), asyncRoute(async (request, response) => {
    response.json(await maintenance.start(pathId(request.params.id), { ...request.body, actor_id: currentUser(response).id }));
  }));
  router.patch("/maintenance-requests/:id/resolve", requireRoles("admin", "asset_manager"), asyncRoute(async (request, response) => {
    response.json(await maintenance.resolve(pathId(request.params.id), { ...request.body, resolved_by: currentUser(response).id }));
  }));

  router.post("/audit-cycles", requireRoles("admin"), asyncRoute(async (request, response) => {
    response.status(201).json(await audit.create({ ...request.body, created_by: currentUser(response).id }));
  }));
  router.post("/audit-cycles/:id/auditors", requireRoles("admin", "asset_manager"), asyncRoute(async (request, response) => {
    response.status(201).json(await audit.assignAuditors(pathId(request.params.id), request.body ?? {}));
  }));
  router.patch("/audit-cycles/:id/findings", asyncRoute(async (request, response) => {
    const user = currentUser(response);
    response.json(await audit.updateFindings(pathId(request.params.id), { ...(request.body ?? {}), user_id: user.id, user_role: user.role }));
  }));
  router.post("/audit-cycles/:id/close", requireRoles("admin", "asset_manager"), asyncRoute(async (request, response) => {
    response.json(await audit.close(pathId(request.params.id), { ...(request.body ?? {}), closed_by: currentUser(response).id }));
  }));
  router.get("/audit-cycles/:id/discrepancy-report", asyncRoute(async (request, response) => {
    response.json(await audit.discrepancyReport(pathId(request.params.id)));
  }));

  return router;
}
