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

  const pgError = error as any;
  if (pgError.code) {
    if (pgError.code === "23P01") {
      return {
        status: 409,
        body: { error: { code: "BOOKING_OVERLAP", message: "That time overlaps an existing booking. Choose a different slot.", details: { constraint: pgError.constraint } } },
      };
    }
    if (pgError.code === "AF001") {
      return {
        status: 409,
        body: { error: { code: "EXIT_CLEARANCE_REQUIRED", message: "Employee still has active custody or upcoming bookings. Complete the clearance checklist and retry deactivation.", details: { constraint: pgError.constraint } } },
      };
    }
    if (pgError.code === "23505") {
      return {
        status: 409,
        body: { error: { code: "CONFLICT", message: "This operation conflicts with an existing record.", details: { constraint: pgError.constraint } } },
      };
    }
    if (pgError.code === "23503") {
      return {
        status: 409,
        body: { error: { code: "CONFLICT", message: "This operation conflicts with a related record.", details: { constraint: pgError.constraint } } },
      };
    }
    if (pgError.code === "23514") {
      return {
        status: 400,
        body: { error: { code: "VALIDATION_ERROR", message: "The provided data violates a business rule.", details: { constraint: pgError.constraint } } },
      };
    }
    if (pgError.code === "23502") {
      return {
        status: 400,
        body: { error: { code: "VALIDATION_ERROR", message: `Missing required field: ${pgError.column}`, details: { column: pgError.column } } },
      };
    }
  }

  // Fallback for raw PostgreSQL errors or unexpected crashes
  // Ensures raw PostgreSQL errors never reach the browser
  return {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred.", details: {} } },
  };
}

