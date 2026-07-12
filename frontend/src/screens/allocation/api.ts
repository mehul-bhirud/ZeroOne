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

export async function createAllocation(body: {
  asset_id: string;
  holder_type: string;
  holder_id: string;
  expected_return_date?: string;
}) {
  const data = await apiFetch<any>("/allocations", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data;
}

export async function returnAllocation(id: string, body: { return_condition_notes?: string }) {
  const data = await apiFetch<any>(`/allocations/${id}/return`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data;
}

export async function createTransferRequest(body: {
  asset_id: string;
  from_holder: { holder_type: string; holder_id: string };
  to_holder: { holder_type: string; holder_id: string; expected_return_date?: string };
}) {
  const data = await apiFetch<any>("/transfer-requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data;
}

export async function getTransferRequests() {
  const data = await apiFetch<any>("/transfer-requests");
  return data;
}

export async function approveTransferRequest(id: string) {
  const data = await apiFetch<any>(`/transfer-requests/${id}/approve`, {
    method: "POST",
  });
  return data;
}

export async function rejectTransferRequest(id: string, reason: string) {
  const data = await apiFetch<any>(`/transfer-requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return data;
}

export async function getAssetsList() {
  return apiFetch<any>("/assets?status=available");
}

export async function getEmployeesList() {
  return apiFetch<any>("/employees");
}

export async function getDepartmentsList() {
  return apiFetch<any>("/departments");
}
