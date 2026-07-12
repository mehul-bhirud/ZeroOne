import { describe, expect, it } from "vitest";
import request from "supertest";
import { createAuthApp } from "../app";
import { loadAuthConfig } from "../config";
import { hashPassword } from "../password";
import type { StoredUser, UserRepository, CreateUserRecord } from "../repository";
import { AuthService } from "../service";
import { effectiveDepartmentScope, requireDepartmentScope, requireRole, ForbiddenError } from "../rbac";
import type { AuthUser, Role } from "../types";

const config = loadAuthConfig({
  JWT_SECRET: "unit-test-secret-that-is-longer-than-32-characters",
  JWT_ISSUER: "assetflow",
  JWT_AUDIENCE: "assetflow-api",
  JWT_TTL_SECONDS: "3600",
  AUTH_PORT: "3000",
});

class MemoryUserRepository implements UserRepository {
  readonly users = new Map<string, StoredUser>();

  async findByEmail(email: string) {
    return [...this.users.values()].find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async findById(id: string) {
    return this.users.get(id) ?? null;
  }

  async createUser(input: CreateUserRecord) {
    if (await this.findByEmail(input.email)) {
      throw { code: "23505", constraint: "users_email_key" };
    }
    const user: StoredUser = { ...input, role: "employee", status: "active" };
    this.users.set(user.id, user);
    return user;
  }
}

async function seedUser(repository: MemoryUserRepository, role: Role = "employee", status: "active" | "inactive" = "active"): Promise<AuthUser> {
  const user: StoredUser = {
    id: `${role}-user`,
    name: `${role} user`,
    email: `${role}@example.test`,
    password_hash: await hashPassword("correct horse battery staple"),
    role,
    status,
    department_id: "00000000-0000-0000-0000-000000000001",
  };
  repository.users.set(user.id, user);
  return user;
}

describe("authentication HTTP contract", () => {
  it("rejects signup role injection and always creates an active employee", async () => {
    const repository = new MemoryUserRepository();
    const app = createAuthApp(config, repository);

    const rejected = await request(app).post("/api/v1/auth/signup").send({
      name: "Attacker",
      email: "attacker@example.test",
      password: "correct horse battery staple",
      role: "admin",
    });
    expect(rejected.status).toBe(400);

    const created = await request(app).post("/api/v1/auth/signup").send({
      name: "Employee",
      email: "employee@example.test",
      password: "correct horse battery staple",
    });
    expect(created.status).toBe(201);
    expect(created.body.user.role).toBe("employee");
    expect(created.body.user.status).toBe("active");
    expect(created.body.user.password_hash).toBeUndefined();
    expect([...repository.users.values()][0].password_hash).not.toBe("correct horse battery staple");
  });

  it("maps case-insensitive duplicate email to a useful 409", async () => {
    const repository = new MemoryUserRepository();
    const app = createAuthApp(config, repository);
    const body = { name: "Employee", email: "Employee@Example.test", password: "correct horse battery staple" };
    expect((await request(app).post("/api/v1/auth/signup").send(body)).status).toBe(201);
    const duplicate = await request(app).post("/api/v1/auth/signup").send({ ...body, email: "employee@example.TEST" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("EMAIL_ALREADY_REGISTERED");
  });

  it("authenticates, reloads current status for /me, and returns generic failures", async () => {
    const repository = new MemoryUserRepository();
    const user = await seedUser(repository);
    const app = createAuthApp(config, repository);

    const login = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: "correct horse battery staple" });
    expect(login.status).toBe(200);
    const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${login.body.access_token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);

    repository.users.set(user.id, { ...repository.users.get(user.id)!, status: "inactive" });
    expect((await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${login.body.access_token}`)).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/login").send({ email: user.email, password: "correct horse battery staple" })).status).toBe(401);
    const wrong = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: "wrong password" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
    expect((await request(app).get("/api/v1/auth/me")).body.error.code).toBe("UNAUTHENTICATED");
  });

  it("maps malformed JSON to the standard actionable 400 shape", async () => {
    const app = createAuthApp(config, new MemoryUserRepository());
    const response = await request(app).post("/api/v1/auth/login").set("Content-Type", "application/json").send('{"email":');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("AUTH_INVALID_INPUT");
  });

  it("returns the same accepted forgot-password response regardless of account existence", async () => {
    const app = createAuthApp(config, new MemoryUserRepository());
    const known = await request(app).post("/api/v1/auth/forgot-password").send({ email: "known@example.test" });
    const unknown = await request(app).post("/api/v1/auth/forgot-password").send({ email: "unknown@example.test" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual({ accepted: true });
    expect(unknown.body).toEqual(known.body);
  });
});

describe("RBAC scope hooks", () => {
  const context = (role: Role, department_id = "dept-a") => ({
    token: "token",
    user: { id: "id", name: "name", email: "email@example.test", role, department_id, status: "active" as const },
  });

  it("permits only the requested roles", () => {
    expect(() => requireRole(context("admin"), ["admin"])).not.toThrow();
    expect(() => requireRole(context("employee"), ["admin"])).toThrow(ForbiddenError);
  });

  it("limits department heads and employees while allowing organization roles", () => {
    expect(() => requireDepartmentScope(context("department_head"), "dept-a")).not.toThrow();
    expect(() => requireDepartmentScope(context("department_head"), "dept-b")).toThrow(ForbiddenError);
    expect(() => requireDepartmentScope(context("employee"), "dept-b")).toThrow(ForbiddenError);
    expect(() => requireDepartmentScope(context("asset_manager"), "dept-b")).not.toThrow();
    expect(() => requireDepartmentScope(context("admin"), "dept-b")).not.toThrow();
  });

  it("defaults restricted callers to their own department when no filter is supplied", () => {
    expect(effectiveDepartmentScope(context("employee"))).toBe("dept-a");
    expect(effectiveDepartmentScope(context("department_head"))).toBe("dept-a");
    expect(effectiveDepartmentScope(context("admin"))).toBeUndefined();
  });
});

describe("password hashing", () => {
  it("uses a salted scrypt hash and verifies with constant-time comparison", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");
    expect(first).not.toBe(second);
    expect(first.startsWith("scrypt$1$")).toBe(true);
  });
});
