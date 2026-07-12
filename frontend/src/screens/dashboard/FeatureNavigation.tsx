import type { Role } from "../../../../auth/types";

const items = [
  { label: "Dashboard", href: "/dashboard", roles: ["admin", "asset_manager", "department_head", "employee"] },
  { label: "Bookings", href: "/bookings", roles: ["admin", "asset_manager", "department_head", "employee"] },
  { label: "Maintenance", href: "/maintenance", roles: ["admin", "asset_manager", "department_head", "employee"] },
  { label: "Audits", href: "/audits", roles: ["admin", "asset_manager"] },
  { label: "Exit clearance", href: "/exit-clearance", roles: ["admin"] },
  { label: "Reports", href: "/reports", roles: ["admin", "asset_manager", "department_head"] },
] satisfies Array<{ label: string; href: string; roles: Role[] }>;

export function FeatureNavigation({ role }: { role: Role }) {
  return <nav aria-label="Feature navigation">{items.filter((item) => item.roles.includes(role)).map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>;
}

