import { Navigate, Route, Routes } from "react-router-dom";
import { LoginScreen, SignupScreen } from "./auth";
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

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/signup" element={<SignupScreen />} />
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
  );
}
