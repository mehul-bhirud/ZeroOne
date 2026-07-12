export interface AuthConfig {
  jwtSecret: Uint8Array;
  issuer: string;
  audience: string;
  ttlSeconds: number;
  port: number;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const secret = env.JWT_SECRET ?? "";
  if (secret.length < 32 || secret === "replace-with-at-least-32-random-characters") {
    throw new Error("JWT_SECRET must contain at least 32 non-placeholder characters.");
  }
  const ttlSeconds = Number(env.JWT_TTL_SECONDS ?? "3600");
  const port = Number(env.AUTH_PORT ?? "3000");
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("JWT_TTL_SECONDS must be a positive integer.");
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("AUTH_PORT must be a valid TCP port.");
  }
  return {
    jwtSecret: new TextEncoder().encode(secret),
    issuer: env.JWT_ISSUER ?? "assetflow",
    audience: env.JWT_AUDIENCE ?? "assetflow-api",
    ttlSeconds,
    port,
  };
}
