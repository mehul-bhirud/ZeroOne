import express, { Router, type ErrorRequestHandler, type Express, type RequestHandler } from "express";
import { Pool } from "pg";
import type { AuthConfig } from "./config";
import { AuthError } from "./errors";
import { authenticateBearer } from "./middleware";
import { PgUserRepository, type UserRepository } from "./repository";
import { AuthService } from "./service";

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

function errorHandler(): ErrorRequestHandler {
  return (error, _request, response, _next) => {
    if (error instanceof AuthError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
      return;
    }
    if (error instanceof SyntaxError && (error as SyntaxError & { status?: number }).status === 400) {
      response.status(400).json({ error: { code: "AUTH_INVALID_INPUT", message: "The request body is not valid JSON. Correct it and try again.", details: {} } });
      return;
    }
    response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "We could not complete that request. Try again shortly.", details: {} } });
  };
}

export function createAuthRouter(config: AuthConfig, repository: UserRepository): Router {
  const router = Router();
  const service = new AuthService(repository, config);

  router.post("/signup", asyncRoute(async (request, response) => {
    response.status(201).json(await service.signup(request.body));
  }));
  router.post("/login", asyncRoute(async (request, response) => {
    response.json(await service.login(request.body));
  }));
  router.post("/forgot-password", asyncRoute(async (request, response) => {
    response.json(await service.forgotPassword(request.body));
  }));
  router.get("/me", authenticateBearer(repository, config), asyncRoute(async (_request, response) => {
    response.json({ user: response.locals.auth.user });
  }));

  return router;
}

export function createAuthApp(config: AuthConfig, repository: UserRepository): Express {
  const app = express();
  app.use(express.json({ limit: "32kb" }));
  app.use("/api/v1/auth", createAuthRouter(config, repository));
  app.use(errorHandler());
  return app;
}

export function createAuthAppFromDatabase(config: AuthConfig, databaseUrl = process.env.DATABASE_URL): { app: Express; pool: Pool } {
  if (!databaseUrl) throw new Error("DATABASE_URL is required to start the auth server.");
  const pool = new Pool({ connectionString: databaseUrl });
  return { app: createAuthApp(config, new PgUserRepository(pool)), pool };
}
