import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Button, EmptyState, ErrorSummary, ScreenShell } from "../../design-system";

export function OrgSetupScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"departments" | "categories" | "employees">("departments");

  if (user?.role !== "admin") {
    return (
      <ScreenShell title="Organization setup" description="Configure departments, categories, and employee roles.">
        <ErrorSummary message="Only Admin users can manage organization setup." />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Organization setup" description="Configure departments, categories, and employee roles.">
      <div className="tab-bar" role="tablist" aria-label="Organization setup sections">
        <button
          className={activeTab === "departments" ? "active" : ""}
          onClick={() => setActiveTab("departments")}
          role="tab"
          aria-selected={activeTab === "departments"}
        >
          Departments
        </button>
        <button
          className={activeTab === "categories" ? "active" : ""}
          onClick={() => setActiveTab("categories")}
          role="tab"
          aria-selected={activeTab === "categories"}
        >
          Categories
        </button>
        <button
          className={activeTab === "employees" ? "active" : ""}
          onClick={() => setActiveTab("employees")}
          role="tab"
          aria-selected={activeTab === "employees"}
        >
          Employee Directory
        </button>
      </div>

      {activeTab === "departments" && (
        <EmptyState title="No departments yet. Create your first one." action={<Button>Create department</Button>} />
      )}
      {activeTab === "categories" && (
        <EmptyState title="No categories yet. Create your first one." action={<Button>Create category</Button>} />
      )}
      {activeTab === "employees" && (
        <EmptyState title="No employee records found." action={<Button>Refresh directory</Button>} />
      )}
    </ScreenShell>
  );
}
