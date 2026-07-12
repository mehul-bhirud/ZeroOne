import type { NextFunction, RequestHandler } from "express";
import type { AuthContext, Role } from "./types";

export class ForbiddenError extends Error {
  readonly status = 403;
}

export function requireRole(context: AuthContext, allowed: readonly Role[]): void {
  if (!allowed.includes(context.user.role)) {
    throw new ForbiddenError("Your account does not have permission for this action. Ask an administrator for access.");
  }
}

export function requireRoles(...allowed: readonly Role[]): RequestHandler {
  return (_request, response, next: NextFunction) => {
    try {
      const context = response.locals.auth as AuthContext | undefined;
      if (!context) throw new ForbiddenError("Your session has no authenticated user. Sign in again.");
      requireRole(context, allowed);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireDepartmentScope(context: AuthContext, departmentId: string): void {
  if ((context.user.role === "department_head" || context.user.role === "employee") && context.user.department_id !== departmentId) {
    throw new ForbiddenError("This department is outside your assigned scope. Select your own department.");
  }
}

export function effectiveDepartmentScope(context: AuthContext, requestedDepartmentId?: string): string | undefined {
  if (context.user.role === "admin" || context.user.role === "asset_manager") return requestedDepartmentId;
  if (!context.user.department_id) {
    throw new ForbiddenError("Your account has no department scope. Ask an administrator to assign one.");
  }
  requireDepartmentScope(context, requestedDepartmentId ?? context.user.department_id);
  return context.user.department_id;
}

export function enforceDepartmentScope(getDepartmentId: (request: Parameters<RequestHandler>[0]) => string | undefined = (request) => {
  const value = request.params.department_id ?? request.query.department_id ?? request.body?.department_id;
  return typeof value === "string" ? value : undefined;
}): RequestHandler {
  return (request, response, next: NextFunction) => {
    try {
      const context = response.locals.auth as AuthContext | undefined;
      const departmentId = getDepartmentId(request);
      if (context) response.locals.department_scope = effectiveDepartmentScope(context, departmentId);
      next();
    } catch (error) {
      next(error);
    }
  };
}
