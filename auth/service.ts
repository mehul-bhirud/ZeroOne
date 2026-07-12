import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthConfig } from "./config";
import { AuthError, invalidCredentials, invalidInput, unauthenticated } from "./errors";
import { issueAccessToken, verifyAccessToken } from "./jwt";
import { hashPassword, verifyPassword } from "./password";
import type { CreateUserRecord, UserRepository } from "./repository";
import type { AuthResponse, ForgotPasswordInput, LoginInput, SignupInput } from "./contracts";
import type { AuthUser } from "./types";

const signupSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(256),
  department_id: z.string().uuid().optional(),
}).strict();

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256),
}).strict();

const forgotPasswordSchema = z.object({ email: z.string().trim().email().max(320) }).strict();

function safeUser(user: AuthUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department_id: user.department_id,
    status: user.status,
  };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw invalidInput("Check the highlighted fields and submit the form again.", { issues: parsed.error.issues });
  }
  return parsed.data;
}

function mapDatabaseError(error: unknown): never {
  const databaseError = error as { code?: string; constraint?: string };
  if (databaseError.code === "23505" && databaseError.constraint === "users_email_key") {
    throw new AuthError(409, "EMAIL_ALREADY_REGISTERED", "That email is already registered. Sign in or use a different work email.");
  }
  if (databaseError.code === "23503" && databaseError.constraint === "users_department_id_fkey") {
    throw invalidInput("That department does not exist. Select an available department and try again.", { field: "department_id" });
  }
  throw error;
}

export class AuthService {
  constructor(private readonly repository: UserRepository, private readonly config: AuthConfig) {}

  async signup(input: SignupInput): Promise<AuthResponse> {
    const data = parse(signupSchema, input);
    const record: CreateUserRecord = {
      id: randomUUID(),
      name: data.name,
      email: data.email.toLowerCase(),
      password_hash: await hashPassword(data.password),
      department_id: data.department_id,
    };
    try {
      const user = await this.repository.createUser(record);
      const publicUser = safeUser(user);
      return { access_token: await issueAccessToken(publicUser, this.config), user: publicUser };
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const data = parse(loginSchema, input);
    const user = await this.repository.findByEmail(data.email.toLowerCase());
    if (!user || user.status !== "active" || !(await verifyPassword(data.password, user.password_hash))) {
      throw invalidCredentials();
    }
    const publicUser = safeUser(user);
    return { access_token: await issueAccessToken(publicUser, this.config), user: publicUser };
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<{ accepted: true }> {
    parse(forgotPasswordSchema, input);
    return { accepted: true };
  }

  async me(token: string): Promise<{ user: AuthUser }> {
    const userId = await verifyAccessToken(token, this.config);
    const user = await this.repository.findById(userId);
    if (!user || user.status !== "active") throw unauthenticated();
    return { user: safeUser(user) };
  }
}
