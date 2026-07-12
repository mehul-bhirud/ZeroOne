import { EmptyState, ScreenShell } from "../../design-system";

export function NotificationsScreen() {
  return <ScreenShell title="Notifications and activity" description="Review personal notifications and the append-only operational history."><EmptyState title="You're all caught up. New activity will appear here." /></ScreenShell>;
}
