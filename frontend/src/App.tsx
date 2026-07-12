import { Link, Navigate, Route, Routes } from "react-router-dom";
import { LoginScreen, SignupScreen, ForgotPasswordScreen } from "./auth";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AllocationScreen } from "./screens/allocation";
import { AssetRegistryScreen } from "./screens/asset-registry";
import { OrgSetupScreen } from "./screens/org-setup";
import { AuditScreen } from "./screens/audit";
import { BookingScreen } from "./screens/booking";
import { DashboardScreen } from "./screens/dashboard";
import { ExitClearanceScreen } from "./screens/exit-clearance";
import { MaintenanceScreen } from "./screens/maintenance";
import { NotificationsScreen } from "./screens/notifications";
import { ReportsScreen } from "./screens/reports";
import { Skeleton } from "./design-system";

/* ── Route guard: redirects unauthenticated users to /login ── */

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="screen-shell"><Skeleton lines={6} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/* ── App shell with sidebar nav (shown when authenticated) ── */

function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  if (!user) return <>{children}</>;

  const navItems = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/org-setup", label: "Org Setup", roles: ["admin"] },
    { to: "/assets", label: "Assets" },
    { to: "/allocations", label: "Allocations" },
    { to: "/bookings", label: "Bookings" },
    { to: "/maintenance", label: "Maintenance" },
    { to: "/audits", label: "Audits" },
    { to: "/reports", label: "Reports" },
    { to: "/notifications", label: "Notifications" },
  ];

  const visibleItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(user.role),
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 220,
          flexShrink: 0,
          background: "#141A21",
          borderRight: "1px solid #33404D",
          padding: "24px 0",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #33404D" }}>
          <span className="eyebrow" style={{ fontSize: 13 }}>AssetFlow</span>
        </div>

        <div style={{ flex: 1, padding: "12px 0" }}>
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: "block",
                padding: "10px 20px",
                color: isActive ? "#5AA7FF" : "#9EABB8",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: isActive ? 700 : 400,
                background: isActive ? "#1E262F" : "transparent",
              })}
            >
              {item.label}
            </NavLink>
        </div>

        <div style={{ padding: "16px 20px", borderTop: "1px solid #33404D" }}>
          <p style={{ fontSize: 13, color: "#9EABB8", margin: "0 0 4px" }}>{user.name}</p>
          <p style={{ fontSize: 12, color: "#5AA7FF", margin: "0 0 12px", textTransform: "capitalize" }}>
            {user.role.replace("_", " ")}
          </p>
          <button
            onClick={logout}
            style={{
              background: "none",
              border: "1px solid #33404D",
              borderRadius: 7,
              color: "#9EABB8",
              padding: "6px 12px",
              fontSize: 13,
              cursor: "pointer",
              width: "100%",
            }}
          >
            Sign out
          </button>
        </div>
      </nav>

      <div style={{ flex: 1, overflowY: "auto" }}>{children}</div>
    </div>
  );
}

/* ── Main app routes ── */

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/signup" element={<SignupScreen />} />
      <Route path="/forgot-password" element={<ForgotPasswordScreen />} />

      {/* Protected routes */}
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppLayout>
              <Routes>
                <Route path="/dashboard" element={<DashboardScreen />} />
                <Route path="/org-setup" element={<OrgSetupScreen />} />
                <Route path="/assets" element={<AssetRegistryScreen />} />
                <Route path="/allocations" element={<AllocationScreen />} />
                <Route path="/bookings" element={<BookingScreen />} />
                <Route path="/maintenance" element={<MaintenanceScreen />} />
                <Route path="/audits" element={<AuditScreen />} />
                <Route path="/exit-clearance" element={<ExitClearanceScreen />} />
                <Route path="/reports" element={<ReportsScreen />} />
                <Route path="/notifications" element={<NotificationsScreen />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AppLayout>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
