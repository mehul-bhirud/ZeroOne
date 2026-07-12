import { useState, useEffect, type FormEvent } from "react";
import {
  Button,
  FormField,
  Input,
  ScreenShell,
  EmptyState,
  ErrorSummary,
  Skeleton,
  Toast,
  Modal,
} from "../../design-system";
import { useAuth } from "../../auth/AuthContext";
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  getCategories,
  createCategory,
  updateCategory,
  type Department,
  type AssetCategory,
} from "./api";

/* ══════════════════════ Org Setup Shell ══════════════════════ */

export function OrgSetupScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"departments" | "categories" | "employees">("departments");

  if (user?.role !== "admin") {
    return (
      <ScreenShell title="Organization setup" description="You need Admin access to manage organization settings.">
        <ErrorSummary message="Only administrators can access Organization Setup. Contact your admin if you need access." />
      </ScreenShell>
    );
  }

  const tabs = [
    { key: "departments" as const, label: "Departments" },
    { key: "categories" as const, label: "Categories" },
    { key: "employees" as const, label: "Employee Directory" },
  ];

  return (
    <ScreenShell title="Organization setup" description="Configure departments, categories, and employee roles.">
      <div className="tab-bar">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? "active" : ""}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "departments" && <DepartmentsTab />}
      {activeTab === "categories" && <CategoriesTab />}
      {activeTab === "employees" && (
        <EmptyState
          title="Employee Directory is available in the next update."
          action={<span className="badge">Coming soon</span>}
        />
      )}
    </ScreenShell>
  );
}

/* ══════════════════════ Departments Tab ══════════════════════ */

function DepartmentsTab() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadDepartments();
  }, []);

  async function loadDepartments() {
    setLoading(true);
    setError("");
    try {
      const data = await getDepartments();
      setDepartments(data);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Unable to load departments.");
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  const filtered = departments.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()),
  );

  /* Build hierarchy: departments with their children */
  const rootDepts = filtered.filter((d) => !d.parent_department_id);
  const childrenOf = (parentId: string) => filtered.filter((d) => d.parent_department_id === parentId);

  if (loading) return <Skeleton lines={5} />;

  return (
    <div className="fade-in">
      {error && <ErrorSummary message={error} />}

      <div className="search-bar">
        <Input
          placeholder="Search departments…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <Button onClick={() => setShowCreate(true)}>Create department</Button>
      </div>

      {filtered.length === 0 && !loading && (
        <EmptyState
          title="No departments yet. Create your first one."
          action={<Button onClick={() => setShowCreate(true)}>Create department</Button>}
        />
      )}

      {filtered.length > 0 && (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Parent</th>
                <th>Status</th>
                <th style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rootDepts.map((dept) => (
                <DepartmentRow
                  key={dept.id}
                  dept={dept}
                  allDepts={departments}
                  childrenOf={childrenOf}
                  onEdit={setEditDept}
                  depth={0}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <DepartmentFormModal
          departments={departments}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            loadDepartments();
            showToast("Department created successfully.");
          }}
        />
      )}

      {editDept && (
        <DepartmentFormModal
          departments={departments}
          existing={editDept}
          onClose={() => setEditDept(null)}
          onSaved={() => {
            setEditDept(null);
            loadDepartments();
            showToast("Department updated successfully.");
          }}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

function DepartmentRow({
  dept,
  allDepts,
  childrenOf,
  onEdit,
  depth,
}: {
  dept: Department;
  allDepts: Department[];
  childrenOf: (id: string) => Department[];
  onEdit: (d: Department) => void;
  depth: number;
}) {
  const parent = allDepts.find((d) => d.id === dept.parent_department_id);
  const children = childrenOf(dept.id);

  return (
    <>
      <tr>
        <td style={{ paddingLeft: 12 + depth * 24 }}>
          {depth > 0 && <span style={{ color: "#33404D", marginRight: 8 }}>└</span>}
          {dept.name}
        </td>
        <td style={{ color: "#9EABB8" }}>{parent?.name || "—"}</td>
        <td>
          <span className={`badge`} style={{
            background: dept.status === "active" ? "#173C2D" : "#4B2227",
            color: dept.status === "active" ? "#7DE2AE" : "#FF9AA5",
          }}>
            {dept.status}
          </span>
        </td>
        <td>
          <button
            className="button button--outline button--sm"
            onClick={() => onEdit(dept)}
          >
            Edit
          </button>
        </td>
      </tr>
      {children.map((child) => (
        <DepartmentRow
          key={child.id}
          dept={child}
          allDepts={allDepts}
          childrenOf={childrenOf}
          onEdit={onEdit}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

/* ── Department Create/Edit Modal ── */

function DepartmentFormModal({
  departments,
  existing,
  onClose,
  onSaved,
}: {
  departments: Department[];
  existing?: Department;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name || "");
  const [parentId, setParentId] = useState(existing?.parent_department_id || "");
  const [status, setStatus] = useState(existing?.status || "active");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Department name is required."); return; }

    setPending(true);
    try {
      if (existing) {
        await updateDepartment({
          id: existing.id,
          name: name.trim(),
          parent_department_id: parentId || undefined,
          status,
        });
      } else {
        await createDepartment({
          name: name.trim(),
          parent_department_id: parentId || undefined,
          status,
        });
      }
      onSaved();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Unable to save department.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }}>
      <form onSubmit={handleSubmit} style={{ width: 440 }}>
        <Modal title={existing ? "Edit department" : "Create department"}>
          {error && <ErrorSummary message={error} />}

          <FormField label="Department name">
            <Input
              id="dept-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering"
              disabled={pending}
            />
          </FormField>

          <FormField label="Parent department">
            <select
              className="input"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              disabled={pending}
            >
              <option value="">None (top level)</option>
              {departments
                .filter((d) => d.id !== existing?.id)
                .map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
            </select>
          </FormField>

          <FormField label="Status">
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={pending}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </FormField>

          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <Button id="dept-save" type="submit" disabled={pending}>
              {pending ? "Saving…" : existing ? "Save changes" : "Create"}
            </Button>
            <button type="button" className="button button--outline" onClick={onClose} disabled={pending}>
              Cancel
            </button>
          </div>
        </Modal>
      </form>
    </div>
  );
}

/* ══════════════════════ Categories Tab ══════════════════════ */

function CategoriesTab() {
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editCat, setEditCat] = useState<AssetCategory | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    setLoading(true);
    setError("");
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Unable to load categories.");
    } finally {
      setLoading(false);
    }
  }

  function showToastMsg(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <Skeleton lines={4} />;

  return (
    <div className="fade-in">
      {error && <ErrorSummary message={error} />}

      <div className="search-bar">
        <Input
          placeholder="Search categories…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <Button onClick={() => setShowCreate(true)}>Create category</Button>
      </div>

      {filtered.length === 0 && !loading && (
        <EmptyState
          title="No categories yet. Create your first one."
          action={<Button onClick={() => setShowCreate(true)}>Create category</Button>}
        />
      )}

      {filtered.length > 0 && (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Custom Fields</th>
                <th style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cat) => (
                <tr key={cat.id}>
                  <td>{cat.name}</td>
                  <td style={{ color: "#9EABB8" }}>
                    {Object.keys(cat.custom_fields).length > 0
                      ? Object.keys(cat.custom_fields).join(", ")
                      : "None"}
                  </td>
                  <td>
                    <button
                      className="button button--outline button--sm"
                      onClick={() => setEditCat(cat)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CategoryFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            loadCategories();
            showToastMsg("Category created successfully.");
          }}
        />
      )}

      {editCat && (
        <CategoryFormModal
          existing={editCat}
          onClose={() => setEditCat(null)}
          onSaved={() => {
            setEditCat(null);
            loadCategories();
            showToastMsg("Category updated successfully.");
          }}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

/* ── Category Create/Edit Modal with custom_fields builder ── */

function CategoryFormModal({
  existing,
  onClose,
  onSaved,
}: {
  existing?: AssetCategory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name || "");
  const [fields, setFields] = useState<{ key: string; type: string }[]>(
    existing?.custom_fields
      ? Object.entries(existing.custom_fields).map(([key, val]) => ({
          key,
          type: typeof val === "string" ? val : "text",
        }))
      : [],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function addField() {
    setFields([...fields, { key: "", type: "text" }]);
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index));
  }

  function updateField(index: number, key: string, type: string) {
    const updated = [...fields];
    updated[index] = { key, type };
    setFields(updated);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Category name is required."); return; }

    const dupeKeys = fields.filter((f, i) =>
      f.key && fields.findIndex((o) => o.key === f.key) !== i,
    );
    if (dupeKeys.length > 0) {
      setError(`Duplicate field name: ${dupeKeys[0].key}`);
      return;
    }

    const customFields: Record<string, string> = {};
    for (const f of fields) {
      if (f.key.trim()) {
        customFields[f.key.trim()] = f.type;
      }
    }

    setPending(true);
    try {
      if (existing) {
        await updateCategory({ id: existing.id, name: name.trim(), custom_fields: customFields });
      } else {
        await createCategory({ name: name.trim(), custom_fields: customFields });
      }
      onSaved();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Unable to save category.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }}>
      <form onSubmit={handleSubmit} style={{ width: 500 }}>
        <Modal title={existing ? "Edit category" : "Create category"}>
          {error && <ErrorSummary message={error} />}

          <FormField label="Category name">
            <Input
              id="cat-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Laptops"
              disabled={pending}
            />
          </FormField>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontWeight: 600 }}>Custom fields</span>
              <button
                type="button"
                className="button button--outline button--sm"
                onClick={addField}
                disabled={pending}
              >
                + Add field
              </button>
            </div>

            {fields.length === 0 && (
              <p style={{ color: "#9EABB8", fontSize: 13 }}>
                No custom fields. Add fields to capture category specific data like warranty period or processor type.
              </p>
            )}

            {fields.map((field, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <Input
                  placeholder="Field name"
                  value={field.key}
                  onChange={(e) => updateField(i, e.target.value, field.type)}
                  style={{ flex: 1 }}
                  disabled={pending}
                />
                <select
                  className="input"
                  value={field.type}
                  onChange={(e) => updateField(i, field.key, e.target.value)}
                  style={{ width: 120 }}
                  disabled={pending}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="boolean">Yes/No</option>
                </select>
                <button
                  type="button"
                  className="button button--danger button--sm"
                  onClick={() => removeField(i)}
                  disabled={pending}
                  style={{ flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <Button id="cat-save" type="submit" disabled={pending}>
              {pending ? "Saving…" : existing ? "Save changes" : "Create"}
            </Button>
            <button type="button" className="button button--outline" onClick={onClose} disabled={pending}>
              Cancel
            </button>
          </div>
        </Modal>
      </form>
    </div>
  );
}
