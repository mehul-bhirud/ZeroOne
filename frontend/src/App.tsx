import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { LoginScreen, SignupScreen, ForgotPasswordScreen } from "./auth";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AllocationScreen } from "./screens/allocation";
import { AssetPassportScreen, AssetRegistryScreen } from "./screens/asset-registry";
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
  const location = useLocation();
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
    <div className="app-shell">
      <nav className="app-sidebar" aria-label="Primary navigation">
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden="true">A</span>
          <span className="eyebrow">AssetFlow</span>
        </div>

        <div className="app-nav">
          {visibleItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`app-nav-link${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="app-user">
          <p className="app-user-name">{user.name}</p>
          <p className="app-user-role">{user.role.replace("_", " ")}</p>
          <button className="app-signout" onClick={logout}>Sign out</button>
        </div>
      </nav>

      <div className="app-content">{children}</div>
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
                <Route path="/assets/:id" element={<AssetPassportScreen />} />
                <Route path="/allocations" element={<AllocationScreen />} />
                <Route path="/transfer-requests" element={<AllocationScreen />} />
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
