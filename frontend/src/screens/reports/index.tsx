import { EmptyState, ScreenShell, Skeleton } from "../../design-system";

export function ReportsScreen() {
  return <ScreenShell title="Reports and analytics" description="Explore database-backed utilization, maintenance, allocation, heatmap, and ghost-risk views."><Skeleton lines={5} /><EmptyState title="Run a report to see organization insights." /></ScreenShell>;
}

