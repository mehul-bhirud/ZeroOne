import { Button, EmptyState, ScreenShell, StatusChip } from "../../design-system";

export function BookingScreen() {
  return <ScreenShell title="Resource booking" description="Find an available resource and reserve a non-overlapping time slot."><div className="panel"><StatusChip status="Upcoming" /><EmptyState title="No bookings yet. Reserve a shared resource." action={<Button>New booking</Button>} /></div></ScreenShell>;
}

