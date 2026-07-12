import { Button, EmptyState, ScreenShell } from "../../design-system";

export function OrgSetupScreen() {
  return <ScreenShell title="Organization setup" description="Configure departments, categories, and employee roles."><EmptyState title="No departments yet. Create your first one." action={<Button>Create department</Button>} /></ScreenShell>;
}

