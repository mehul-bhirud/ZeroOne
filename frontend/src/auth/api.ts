const API_BASE = "/api/v1";

/* ── Token persistence ── */

const TOKEN_KEY = "af_access_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/* ── Shared fetch wrapper ── */

interface ApiError {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();

  const headers = new Headers({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  new Headers(options.headers).forEach((value, key) => headers.set(key, value));

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body: ApiError = await res.json().catch(() => ({
      error: { code: "UNKNOWN", message: "An unexpected error occurred. Please try again." },
    }));
    throw body.error;
  }

  return res.json() as Promise<T>;
}

/* ── Auth types (matching API_CONTRACT.md) ── */

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "asset_manager" | "department_head" | "employee";
  department_id: string | null;
  status: "active" | "inactive";
}

interface AuthResponse {
  access_token: string;
  user: User;
}

interface MeResponse {
  user: User;
}

/* ── Auth endpoints ── */

/** POST /auth/login */
export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.access_token);
  return data;
}

/**
 * POST /auth/signup
 * Intentionally omits a role field — signup always creates an Employee.
 */
export async function signup(
  name: string,
  email: string,
  password: string,
  department_id?: string,
): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password, ...(department_id ? { department_id } : {}) }),
  });
  setToken(data.access_token);
  return data;
}

/** POST /auth/forgot-password — never reveals whether the email exists. */
export async function forgotPassword(email: string): Promise<void> {
  await apiFetch<{ accepted: boolean }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/** GET /auth/me — restores session from stored token. */
export async function getMe(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const data = await apiFetch<MeResponse>("/auth/me");
    return data.user;
  } catch {
    clearToken();
    return null;
  }
}

/** Logout — clear local token. */
export function logout(): void {
  clearToken();
}
