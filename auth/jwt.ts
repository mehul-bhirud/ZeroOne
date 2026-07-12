import { jwtVerify, SignJWT } from "jose";
import type { AuthConfig } from "./config";
import type { AuthUser } from "./types";
import { unauthenticated } from "./errors";

export async function issueAccessToken(user: AuthUser, config: AuthConfig): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime(`${config.ttlSeconds}s`)
    .sign(config.jwtSecret);
}

export async function verifyAccessToken(token: string, config: AuthConfig): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, config.jwtSecret, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) throw unauthenticated();
    return payload.sub;
  } catch {
    throw unauthenticated();
  }
}
