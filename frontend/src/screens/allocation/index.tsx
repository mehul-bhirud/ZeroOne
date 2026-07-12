import { Button, EmptyState, ScreenShell } from "../../design-system";

export function AllocationScreen() {
  return <ScreenShell title="Allocation and transfer" description="Assign custody, process returns, or request a transfer."><EmptyState title="Select an available asset to begin." action={<Button>Choose asset</Button>} /></ScreenShell>;
}
