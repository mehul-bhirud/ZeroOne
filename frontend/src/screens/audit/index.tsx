import { Button, EmptyState, ScreenShell, StatusChip } from "../../design-system";

export function AuditScreen() {
  return <ScreenShell title="Asset audit" description="Verify assets, document discrepancies, and close controlled audit cycles."><div className="panel"><StatusChip status="Available" /><EmptyState title="No active audit cycles. Create one for a department or location." action={<Button>Create audit</Button>} /></div></ScreenShell>;
}

