import { getToken } from "../../auth/api";

const API_BASE = "/api/v1";

interface ApiError {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

async function orgSetupFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers({
    "Content-Type": "application/json",
    ...(token ? { Authorization: "Bearer " + token } : {}),
  });

  new Headers(options.headers).forEach((value, key) => headers.set(key, value));

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    const body: ApiError = await response.json().catch(() => ({
      error: { code: "UNKNOWN", message: "An unexpected error occurred. Please try again." },
    }));
    throw body.error;
  }

  return response.json() as Promise<T>;
}

export interface Department {
  id: string;
  name: string;
  parent_department_id: string | null;
  head_user_id: string | null;
  status: "active" | "inactive";
}

export interface CategoryField {
  name: string;
  type: "text" | "number" | "date" | "boolean" | "select";
  required?: boolean;
  options?: string[];
}

export interface AssetCategory {
  id: string;
  name: string;
  custom_fields: CategoryField[];
}

export function listDepartments(): Promise<{ departments: Department[] }> {
  return orgSetupFetch("/departments");
}

export function createDepartment(input: {
  name: string;
  parent_department_id?: string | null;
  head_user_id?: string | null;
  status: "active" | "inactive";
}): Promise<{ department: Department }> {
  return orgSetupFetch("/departments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateDepartment(input: {
  id: string;
  name?: string;
  parent_department_id?: string | null;
  head_user_id?: string | null;
  status?: "active" | "inactive";
}): Promise<{ department: Department }> {
  return orgSetupFetch("/departments", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function listCategories(): Promise<{ categories: AssetCategory[] }> {
  return orgSetupFetch("/categories");
}

export function createCategory(input: {
  name: string;
  custom_fields: CategoryField[];
}): Promise<{ category: AssetCategory }> {
  return orgSetupFetch("/categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCategory(input: {
  id: string;
  name?: string;
  custom_fields?: CategoryField[];
}): Promise<{ category: AssetCategory }> {
  return orgSetupFetch("/categories", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
