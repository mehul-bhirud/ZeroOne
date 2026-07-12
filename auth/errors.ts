export class AuthError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 409,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const invalidInput = (message: string, details: Record<string, unknown> = {}) =>
  new AuthError(400, "AUTH_INVALID_INPUT", message, details);

export const unauthenticated = () =>
  new AuthError(401, "UNAUTHENTICATED", "Your session is missing or no longer valid. Sign in again.");

export const forbidden = (message: string) => new AuthError(403, "FORBIDDEN", message);

export const invalidCredentials = () =>
  new AuthError(401, "INVALID_CREDENTIALS", "The email or password is incorrect. Check both values and try again.");
