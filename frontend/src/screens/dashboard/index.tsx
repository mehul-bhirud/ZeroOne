import { EmptyState, ScreenShell, Skeleton, StatusChip } from "../../design-system";
import { FeatureNavigation } from "./FeatureNavigation";

export function DashboardScreen() {
  return <ScreenShell title="Operations dashboard" description="Monitor custody, reservations, maintenance, returns, and ghost risk."><FeatureNavigation role="employee" /><StatusChip status="Available" /><Skeleton lines={4} /><EmptyState title="No operational alerts. New activity will appear here." /></ScreenShell>;
}

