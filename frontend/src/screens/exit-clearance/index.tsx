import { EmptyState, ScreenShell } from "../../design-system";

export function ExitClearanceScreen() {
  return <ScreenShell title="Exit clearance" description="Resolve every active allocation and upcoming booking before deactivation."><EmptyState title="No employee selected. Open clearance from the Employee Directory." /></ScreenShell>;
}

