import { getToken } from "../../auth/api";

const API_BASE = "/api/v1";

function authHeaders(): Record<string, string> {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...((options.headers as Record<string, string>) ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({
      error: { code: "UNKNOWN", message: "An unexpected error occurred." },
    }));
    throw body.error;
  }
  return res.json() as Promise<T>;
}

/* ── Types ── */

export interface Department {
  id: string;
  name: string;
  parent_department_id: string | null;
  head_user_id: string | null;
  status: string;
}

export interface AssetCategory {
  id: string;
  name: string;
  custom_fields: Record<string, unknown>;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: "admin" | "asset_manager" | "department_head" | "employee";
  department_id: string | null;
  status: "active" | "inactive";
}

/* ── Departments ── */

export async function getDepartments(): Promise<Department[]> {
  const data = await apiFetch<{ departments: Department[] }>("/departments");
  return data.departments;
}

export async function createDepartment(body: {
  name: string;
  parent_department_id?: string;
  head_user_id?: string;
  status?: string;
}): Promise<Department> {
  const data = await apiFetch<{ department: Department }>("/departments", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.department;
}

export async function updateDepartment(body: {
  id: string;
  name?: string;
  parent_department_id?: string | null;
  head_user_id?: string | null;
  status?: string;
}): Promise<Department> {
  const data = await apiFetch<{ department: Department }>("/departments", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return data.department;
}

/* ── Categories ── */

export async function getCategories(): Promise<AssetCategory[]> {
  const data = await apiFetch<{ categories: AssetCategory[] }>("/categories");
  return data.categories;
}

export async function createCategory(body: {
  name: string;
  custom_fields: Record<string, unknown>;
}): Promise<AssetCategory> {
  const data = await apiFetch<{ category: AssetCategory }>("/categories", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.category;
}

export async function updateCategory(body: {
  id: string;
  name?: string;
  custom_fields?: Record<string, unknown>;
}): Promise<AssetCategory> {
  const data = await apiFetch<{ category: AssetCategory }>("/categories", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return data.category;
}

/* ── Employees ── */

export async function getEmployees(filters?: {
  department?: string;
  role?: string;
  status?: string;
  search?: string;
}): Promise<Employee[]> {
  const params = new URLSearchParams();
  if (filters?.department) params.set("department", filters.department);
  if (filters?.role) params.set("role", filters.role);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.search) params.set("search", filters.search);
  const qs = params.toString();
  const data = await apiFetch<{ employees: Employee[] }>(`/employees${qs ? `?${qs}` : ""}`);
  return data.employees;
}

export async function updateEmployee(
  id: string,
  body: { role?: string; department_id?: string; status?: string },
): Promise<Employee> {
  const data = await apiFetch<{ employee: Employee }>(`/employees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return data.employee;
}

export async function deactivateEmployee(
  id: string,
  reason?: string,
): Promise<{ employee: Employee; clearance_complete: boolean }> {
  return apiFetch(`/employees/${id}/deactivate`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  });
}
