export type DomainResult<T, E extends Error = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const success = <T>(value: T): DomainResult<T, never> => ({ ok: true, value });
export const failure = <E extends Error>(error: E): DomainResult<never, E> => ({ ok: false, error });

