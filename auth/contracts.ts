import type { AuthUser } from "./types";

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  department_id?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface AuthResponse {
  access_token: string;
  user: AuthUser;
}

export interface AuthService {
  signup(input: SignupInput): Promise<AuthResponse>;
  login(input: LoginInput): Promise<AuthResponse>;
  forgotPassword(input: ForgotPasswordInput): Promise<{ accepted: true }>;
  me(token: string): Promise<{ user: AuthUser }>;
}
