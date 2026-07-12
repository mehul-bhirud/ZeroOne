import { Router, type RequestHandler } from "express";
import type { AuthConfig } from "./config";
import { authenticateBearer } from "./middleware";
import { requireRoles } from "./rbac";
import type { UserRepository } from "./repository";
import { AuditService } from "../services/audit-service";
import { BookingService } from "../services/booking-service";
import { MaintenanceService } from "../services/maintenance-service";
import type { DatabaseClient } from "../services/db";

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

  router.use(authenticate);

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
