import { Button, EmptyState, ScreenShell, StatusChip } from "../../design-system";

export function AssetRegistryScreen() {
  return <ScreenShell title="Asset registry" description="Register assets and open a complete lifecycle passport."><div className="panel"><StatusChip status="Available" /> <EmptyState title="No assets yet. Register your first one." action={<Button>Register asset</Button>} /></div></ScreenShell>;
}

export function AssetPassportScreen() {
  return <ScreenShell title="Asset passport" description="Custody, bookings, maintenance, audits, and activity appear chronologically."><EmptyState title="Select an asset from the registry to view its passport." /></ScreenShell>;
}

