export const roles = ["admin", "asset_manager", "department_head", "employee"] as const;
export type Role = (typeof roles)[number];

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department_id?: string;
  status: "active" | "inactive";
}

export interface AuthContext {
  user: AuthUser;
  token: string;
}

