export type ErrorKind = "validation" | "unauthenticated" | "forbidden" | "conflict" | "transition";

export class DomainError extends Error {
  constructor(
    readonly kind: ErrorKind,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super("validation", "VALIDATION_ERROR", message, details);
  }
}

export class AuthorizationError extends DomainError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super("forbidden", "FORBIDDEN", message, details);
  }
}

export class BusinessConflictError extends DomainError {
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super("conflict", code, message, details);
  }
}

export class TransitionError extends DomainError {
  constructor(entity: string, from: string, to: string) {
    super("transition", "INVALID_TRANSITION", `${entity} cannot move from ${from} to ${to}. Choose an allowed next action.`, {
      entity,
      from,
      to,
    });
  }
}

