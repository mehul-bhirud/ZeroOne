import { Router, type RequestHandler } from "express";
import type { AuthConfig } from "./config";
import { authenticateBearer } from "./middleware";
import { requireRoles } from "./rbac";
import type { UserRepository } from "./repository";
import { AuditService } from "../services/audit-service";
import { BookingService } from "../services/booking-service";
import { MaintenanceService } from "../services/maintenance-service";
import { AssetService } from "../services/asset-service";
import { AllocationService } from "../services/allocation-service";
import type { DatabaseClient } from "../services/db";
import { ExitClearanceService } from "./exit-clearance";
import { AuthorizationError, ValidationError } from "../domain/errors";

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

function currentUser(response: Parameters<RequestHandler>[1]) {
  return response.locals.auth.user as { id: string; role: string };
}

function pathId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
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
