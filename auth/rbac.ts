import type { AuthContext, Role } from "./types";

export class ForbiddenError extends Error {
  readonly status = 403;
}

export function requireRole(context: AuthContext, allowed: readonly Role[]): void {
  if (!allowed.includes(context.user.role)) {
    throw new ForbiddenError("Your account does not have permission for this action. Ask an administrator for access.");
  }
}

export function requireDepartmentScope(context: AuthContext, departmentId: string): void {
  if (context.user.role === "department_head" && context.user.department_id !== departmentId) {
    throw new ForbiddenError("This department is outside your assigned scope. Select your own department.");
  }
}

