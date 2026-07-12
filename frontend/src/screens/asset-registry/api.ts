import { getToken } from "../../auth/api";
import { Department, AssetCategory } from "../org-setup/api";

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

export interface Asset {
  id: string;
  asset_tag: string;
  name: string;
  category_id: string;
  serial_number: string;
  acquisition_date: string;
  acquisition_cost: number;
  condition: string;
  location: string;
  is_bookable: boolean;
  status: string;
  photo_url?: string;
  created_at: string;
}

export async function getAssets(filters?: {
  search?: string;
  category?: string;
  status?: string;
  department?: string;
  location?: string;
}): Promise<{ assets: Asset[]; total: number }> {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.category) params.set("category", filters.category);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.department) params.set("department", filters.department);
  if (filters?.location) params.set("location", filters.location);
  
  const qs = params.toString();
  return apiFetch<{ assets: Asset[]; total: number }>(`/assets${qs ? `?${qs}` : ""}`);
}

export async function createAsset(body: {
  name: string;
  category_id: string;
  serial_number: string;
  acquisition_date: string;
  acquisition_cost: number;
  condition: string;
  location: string;
  is_bookable: boolean;
  photo_url?: string;
}): Promise<Asset> {
  const data = await apiFetch<{ asset: Asset }>("/assets", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.asset;
}

// Re-export shared getters so we don't have to rewrite them here,
// or we can just import them directly in the UI.
export { getDepartments, getCategories } from "../org-setup/api";
