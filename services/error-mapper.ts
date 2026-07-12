import { DomainError } from "../domain/errors";

const statusByKind = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  conflict: 409,
  transition: 409,
} as const;

export function mapDomainError(error: DomainError) {
  return {
    status: statusByKind[error.kind],
    body: { error: { code: error.code, message: error.message, details: error.details } },
  };
}

