import { Button, EmptyState, ScreenShell, StatusChip } from "../../design-system";

export function MaintenanceScreen() {
  return <ScreenShell title="Maintenance" description="Move approved work through a clear, auditable repair workflow."><div className="panel"><StatusChip status="Pending" /><EmptyState title="No maintenance requests. Report an issue when an asset needs attention." action={<Button>Report issue</Button>} /></div></ScreenShell>;
}

