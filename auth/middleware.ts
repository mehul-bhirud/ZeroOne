import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AuthConfig } from "./config";
import { unauthenticated } from "./errors";
import { verifyAccessToken } from "./jwt";
import type { UserRepository } from "./repository";
import type { AuthContext } from "./types";

function bearerToken(header: string | undefined): string {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw unauthenticated();
  return match[1];
}

export function authenticateBearer(repository: UserRepository, config: AuthConfig): RequestHandler {
  return async (_request: Request, response: Response, next: NextFunction) => {
    try {
      const token = bearerToken(response.req.headers.authorization);
      const userId = await verifyAccessToken(token, config);
      const user = await repository.findById(userId);
      if (!user || user.status !== "active") throw unauthenticated();
      const context: AuthContext = {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department_id: user.department_id,
          status: user.status,
        },
      };
      response.locals.auth = context;
      next();
    } catch (error) {
      next(error);
    }
  };
}
