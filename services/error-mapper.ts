import { DomainError } from "../domain/errors";

const statusByKind = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  conflict: 409,
  transition: 409,
} as const;

export function mapDomainError(error: Error) {
  if (error instanceof DomainError) {
    return {
      status: statusByKind[error.kind],
      body: { error: { code: error.code, message: error.message, details: error.details } },
    };
  }

  // Fallback for raw PostgreSQL errors or unexpected crashes
  // Ensures raw PostgreSQL errors never reach the browser
  return {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred.", details: {} } },
  };
}

