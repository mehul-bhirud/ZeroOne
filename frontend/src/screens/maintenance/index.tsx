import { useEffect, useRef, useState } from "react";
import {
  Button,
  EmptyState,
  ErrorSummary,
  FormField,
  Input,
  ScreenShell,
  Skeleton,
  StatusChip,
  Toast,
} from "../../design-system";
import { getToken } from "../../auth/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "low" | "medium" | "high" | "critical";
type MRStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "technician_assigned"
  | "in_progress"
  | "resolved";

interface MaintenanceRequest {
  id: string;
  asset_id: string;
  asset_name?: string;
  asset_tag?: string;
  issue_description: string;
  priority: Priority;
  status: MRStatus;
  raised_by?: string;
  technician?: string | null;
  photo_url?: string | null;
  created_at: string;
  updated_at?: string;
}

// Formatter helpers
type MaintenanceDisplayStatus =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Technician Assigned"
  | "In Progress"
  | "Resolved";

function formatStatus(status: MRStatus): MaintenanceDisplayStatus {
  switch (status) {
    case "pending": return "Pending";
    case "approved": return "Approved";
    case "rejected": return "Rejected";
    case "technician_assigned": return "Technician Assigned";
    case "in_progress": return "In Progress";
    case "resolved": return "Resolved";
  }
}

function formatPriority(priority: Priority): string {
  switch (priority) {
    case "low": return "Low";
    case "medium": return "Medium";
    case "high": return "High";
    case "critical": return "Critical";
  }
}

// ─── Fixture mode ─────────────────────────────────────────────────────────────
// Activated ONLY when: (1) running in Vite dev server AND (2) VITE_USE_FIXTURES=true.
// Never used as a silent fallback for real errors.

const FIXTURE_MODE =
  import.meta.env.DEV && import.meta.env.VITE_USE_FIXTURES === "true";

const FIXTURE_REQUESTS: MaintenanceRequest[] = [
  {
    id: "MR-001", asset_id: "a1", asset_name: "MacBook Pro 16\u2033", asset_tag: "AF-0042",
    issue_description: "Battery drains completely within 2 hours under normal load.",
    priority: "high", status: "pending", raised_by: "Priya Nair", technician: null,
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
  },
  {
    id: "MR-002", asset_id: "a2", asset_name: "Bosch Drill SHR", asset_tag: "AF-0078",
    issue_description: "Chuck slips when tightening; possible internal wear.",
    priority: "medium", status: "approved", raised_by: "Ankit Joshi", technician: null,
    created_at: new Date(Date.now() - 172_800_000).toISOString(),
  },
  {
    id: "MR-003", asset_id: "a3", asset_name: "Dell Monitor 27\u2033", asset_tag: "AF-0091",
    issue_description: "Horizontal dead-pixel band across the centre of the screen.",
    priority: "low", status: "in_progress", raised_by: "Karan Singh", technician: "Raj Patel",
    created_at: new Date(Date.now() - 259_200_000).toISOString(),
  },
  {
    id: "MR-004", asset_id: "a4", asset_name: "Canon EOS R5", asset_tag: "AF-0115",
    issue_description: "Autofocus fails intermittently in low-light conditions.",
    priority: "critical", status: "resolved", raised_by: "Rahul Mehta", technician: "Divya Kumar",
    created_at: new Date(Date.now() - 432_000_000).toISOString(),
  },
];

// ─── API helpers ──────────────────────────────────────────────────────────────

const API_BASE = "/api/v1";

interface ApiErrorShape {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

async function mFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
  new Headers(options.headers).forEach((v, k) => headers.set(k, v));
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body: { error: ApiErrorShape } = await res.json().catch(() => ({
      error: { code: "UNKNOWN", message: "An unexpected error occurred. Please try again." },
    }));
    throw body.error;
  }
  return res.json() as Promise<T>;
}

async function listRequests(): Promise<MaintenanceRequest[]> {
  if (FIXTURE_MODE) return FIXTURE_REQUESTS;
  const data = await mFetch<{ maintenance_requests: MaintenanceRequest[] }>("/maintenance-requests");
  return data.maintenance_requests;
}

async function createRequest(payload: {
  asset_id: string;
  issue_description: string;
  priority: Priority;
}): Promise<MaintenanceRequest> {
  const data = await mFetch<{ maintenance_request: MaintenanceRequest }>(
    "/maintenance-requests",
    { method: "POST", body: JSON.stringify(payload) },
  );
  return data.maintenance_request;
}

type TransitionAction = "approve" | "reject" | "assign-technician" | "start" | "resolve";

async function transitionRequest(
  id: string,
  action: TransitionAction,
  body: Record<string, unknown> = {},
): Promise<MaintenanceRequest> {
  const data = await mFetch<{ maintenance_request: MaintenanceRequest }>(
    `/maintenance-requests/${id}/${action}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return data.maintenance_request;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function priorityClass(p: Priority): string {
  return p === "critical" ? "mr-priority--critical"
    : p === "high"     ? "mr-priority--high"
    : p === "medium"   ? "mr-priority--medium"
    :                    "mr-priority--low";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ─── RequestRow ───────────────────────────────────────────────────────────────

interface ActionError { id: string; message: string; }

function RequestRow({
  req, onApprove, onReject, onAssign, onStart, onResolve, busy, actionError,
}: {
  req: MaintenanceRequest;
  onApprove: (id: string) => void;
  onReject:  (id: string) => void;
  onAssign:  (id: string) => void;
  onStart:   (id: string) => void;
  onResolve: (id: string) => void;
  busy: string | null;
  actionError: ActionError | null;
}) {
  const isBusy   = busy === req.id;
  const hasError = actionError?.id === req.id;
  return (
    <tr>
      <td>
        <div className="mr-asset-name">{req.asset_name ?? req.asset_id}</div>
        <div className="mr-asset-tag">{req.asset_tag ?? "—"}</div>
      </td>
      <td style={{ maxWidth: 280 }}>
        <span className="mr-desc">{req.issue_description}</span>
      </td>
      <td>
        <span className={`mr-priority ${priorityClass(req.priority)}`}>{formatPriority(req.priority)}</span>
      </td>
      <td><StatusChip status={formatStatus(req.status)} /></td>
      <td style={{ color: "#9EABB8", fontSize: 13 }}>{req.technician ?? "—"}</td>
      <td style={{ color: "#9EABB8", fontSize: 13 }}>{fmtDate(req.created_at)}</td>
      <td>
        <div className="mr-actions">
          {hasError && (
            <span className="mr-action-error" role="alert">{actionError!.message}</span>
          )}
          {req.status === "pending" && (
            <>
              <button id={`mr-approve-${req.id}`} className="button button--sm"
                disabled={isBusy} onClick={() => onApprove(req.id)}>
                {isBusy ? "…" : "Approve"}
              </button>
              <button id={`mr-reject-${req.id}`} className="button button--sm button--danger"
                disabled={isBusy} onClick={() => onReject(req.id)}>
                {isBusy ? "…" : "Reject"}
              </button>
            </>
          )}
          {req.status === "approved" && (
            <button id={`mr-assign-${req.id}`} className="button button--sm button--outline"
              disabled={isBusy} onClick={() => onAssign(req.id)}>
              {isBusy ? "…" : "Assign Technician"}
            </button>
          )}
          {req.status === "technician_assigned" && (
            <button id={`mr-start-${req.id}`} className="button button--sm button--outline"
              disabled={isBusy} onClick={() => onStart(req.id)}>
              {isBusy ? "…" : "Start Work"}
            </button>
          )}
          {req.status === "in_progress" && (
            <button id={`mr-resolve-${req.id}`} className="button button--sm"
              disabled={isBusy} onClick={() => onResolve(req.id)}>
              {isBusy ? "…" : "Mark Resolved"}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── MaintenanceScreen ────────────────────────────────────────────────────────

type Tab = "All" | "pending" | "approved" | "in_progress" | "resolved";
const TABS: { id: Tab, label: string }[] = [
  { id: "All", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "in_progress", label: "In Progress" },
  { id: "resolved", label: "Resolved" }
];

export function MaintenanceScreen() {
  const [requests,   setRequests  ] = useState<MaintenanceRequest[]>([]);
  const [loading,    setLoading   ] = useState(true);
  const [loadError,  setLoadError ] = useState<string | null>(null);
  const [tab,        setTab       ] = useState<Tab>("All");
  const [search,     setSearch    ] = useState("");

  // Report-issue modal
  const [showModal,  setShowModal ] = useState(false);
  const [form,       setForm      ] = useState({ asset_id: "", issue_description: "", priority: "medium" as Priority });
  const [formError,  setFormError ] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Inline action state
  const [busyId,      setBusyId    ] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError,  setRejectError ] = useState<string | null>(null);

  // Assign-technician modal
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [techName,     setTechName    ] = useState("");
  const [assignError,  setAssignError ] = useState<string | null>(null);

  // Resolve modal
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);
  const [resolveNotes,  setResolveNotes ] = useState("");
  const [resolveError,  setResolveError ] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  // Load list — errors are always shown; mock data is NEVER silently substituted.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    listRequests()
      .then((rows) => { if (!cancelled) { setRequests(rows); setLoading(false); } })
      .catch((err: ApiErrorShape) => {
        if (!cancelled) {
          setLoadError(err.message ?? "Failed to load maintenance requests. Please try again.");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Filter + search
  const visible = requests.filter((r) => {
    const matchTab =
      tab === "All" ||
      (tab === "in_progress"
        ? r.status === "in_progress" || r.status === "technician_assigned"
        : r.status === tab);
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (r.asset_name ?? "").toLowerCase().includes(q) ||
      (r.asset_tag  ?? "").toLowerCase().includes(q) ||
      r.issue_description.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  // Apply a server-returned update into local list (server state wins)
  function applyUpdate(id: string, updated: MaintenanceRequest) {
    setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
  }

  // Generic transition runner — never masks server errors as success
  async function runTransition(
    id: string,
    action: TransitionAction,
    body: Record<string, unknown>,
    successMsg: string,
  ) {
    setBusyId(id);
    setActionError(null);
    try {
      const updated = await transitionRequest(id, action, body);
      applyUpdate(id, updated);
      showToast(successMsg);
    } catch (err: unknown) {
      const e = err as ApiErrorShape;
      setActionError({ id, message: e.message ?? "Request failed. Please try again." });
    } finally {
      setBusyId(null);
    }
  }

  function handleApprove(id: string) { void runTransition(id, "approve", {}, "Request approved."); }
  function handleStart  (id: string) { void runTransition(id, "start",   {}, "Work started.");     }

  function handleReject (id: string) { setRejectTarget(id);  setRejectReason(""); setRejectError(null);  }
  function handleAssign (id: string) { setAssignTarget(id);  setTechName("");     setAssignError(null);  }
  function handleResolve(id: string) { setResolveTarget(id); setResolveNotes(""); setResolveError(null); }

  async function confirmReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) { setRejectError("A reason is required to reject a request."); return; }
    setBusyId(rejectTarget); setRejectError(null);
    try {
      const updated = await transitionRequest(rejectTarget, "reject", { reason: rejectReason.trim() });
      applyUpdate(rejectTarget, updated);
      showToast("Request rejected.");
      setRejectTarget(null);
    } catch (err: unknown) {
      const e = err as ApiErrorShape;
      setRejectError(e.message ?? "Could not reject. Please try again.");
    } finally { setBusyId(null); }
  }

  async function confirmAssign() {
    if (!assignTarget) return;
    if (!techName.trim()) { setAssignError("Technician name is required."); return; }
    setBusyId(assignTarget); setAssignError(null);
    try {
      const updated = await transitionRequest(assignTarget, "assign-technician", { technician: techName.trim() });
      applyUpdate(assignTarget, updated);
      showToast(`Technician "${techName.trim()}" assigned.`);
      setAssignTarget(null);
    } catch (err: unknown) {
      const e = err as ApiErrorShape;
      setAssignError(e.message ?? "Could not assign technician. Please try again.");
    } finally { setBusyId(null); }
  }

  async function confirmResolve() {
    if (!resolveTarget) return;
    setBusyId(resolveTarget); setResolveError(null);
    try {
      const updated = await transitionRequest(resolveTarget, "resolve", {
        resolution_notes: resolveNotes.trim() || undefined,
      });
      applyUpdate(resolveTarget, updated);
      showToast("Request resolved.");
      setResolveTarget(null);
    } catch (err: unknown) {
      const e = err as ApiErrorShape;
      setResolveError(e.message ?? "Could not resolve. Please try again.");
    } finally { setBusyId(null); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.asset_id.trim())         { setFormError("Asset ID is required."); return; }
    if (!form.issue_description.trim()){ setFormError("Please describe the issue."); return; }
    setSubmitting(true);
    try {
      const created = await createRequest({
        asset_id: form.asset_id.trim(),
        issue_description: form.issue_description.trim(),
        priority: form.priority,
      });
      setRequests((prev) => [created, ...prev]);
      setShowModal(false);
      setForm({ asset_id: "", issue_description: "", priority: "medium" });
      showToast("Maintenance request submitted.");
    } catch (err: unknown) {
      const e = err as ApiErrorShape;
      setFormError(e.message ?? "Could not create request. Please try again.");
    } finally { setSubmitting(false); }
  }

  return (
    <>
      <style>{`
        .mr-toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
        .mr-search  { flex: 1; min-width: 200px; }
        .mr-asset-name { font-weight: 600; color: #F3F6F8; font-size: 14px; }
        .mr-asset-tag  { font-size: 11px; color: #9EABB8; margin-top: 2px; }
        .mr-desc       { font-size: 13px; color: #C6D0D8; line-height: 1.45; }
        .mr-priority { display: inline-flex; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 700; }
        .mr-priority--critical { background: #4B2227; color: #FF9AA5; }
        .mr-priority--high     { background: #493714; color: #FFD47A; }
        .mr-priority--medium   { background: #19334E; color: #8FC8FF; }
        .mr-priority--low      { background: #29323B; color: #C6D0D8; }
        .mr-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; min-width: 160px; flex-direction: column; }
        .mr-action-error { font-size: 12px; color: #FF9AA5; }
        .mr-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.55);
          display: flex; align-items: center; justify-content: center; z-index: 900;
        }
        .mr-modal {
          width: min(480px, calc(100vw - 48px));
          background: linear-gradient(135deg, rgba(27, 49, 74, .82), rgba(12, 27, 43, .78)); border: 1px solid rgba(174, 213, 255, .24); border-radius: 16px; padding: 28px; box-shadow: 0 18px 52px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.06); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
        }
        .mr-modal h2 { margin: 0 0 20px; font-size: 20px; color: #F3F6F8; }
        .mr-modal-footer { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
        .mr-select {
          width: 100%; border: 1px solid #33404D; border-radius: 9px;
          background: #0B0F14; color: #F3F6F8; padding: 10px 12px; font: inherit;
        }
        .mr-select:focus { outline: none; border-color: #5AA7FF; box-shadow: 0 0 0 2px rgba(90,167,255,.18); }
        .mr-fixture-notice {
          display: inline-block; margin-left: 10px; padding: 2px 8px; border-radius: 6px;
          background: #493714; color: #FFD47A; font-size: 11px; font-weight: 700;
          letter-spacing: .04em; vertical-align: middle;
        }
      `}</style>

      <ScreenShell
        title={FIXTURE_MODE ? "Maintenance [FIXTURES]" : "Maintenance"}
        description="Move approved work through a clear, auditable repair workflow."
      >
        {/* Always show load errors — never silently fall back to mock data */}
        {loadError && <ErrorSummary message={loadError} />}

        {loading ? (
          <Skeleton lines={5} />
        ) : !loadError && (
          <>
            <div className="mr-toolbar">
              <Input
                id="mr-search"
                className="input mr-search"
                placeholder="Search by asset or description…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button
                id="mr-report-issue"
                onClick={() => { setShowModal(true); setFormError(null); setForm({ asset_id: "", issue_description: "", priority: "medium" }); }}
              >
                + Report issue
              </Button>
            </div>

            <div className="tab-bar" role="tablist" aria-label="Filter by status">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  id={`mr-tab-${t.id}`}
                  role="tab"
                  aria-selected={tab === t.id}
                  className={tab === t.id ? "active" : ""}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <EmptyState
                title={
                  search || tab !== "All"
                    ? "No requests match your filter."
                    : "No maintenance requests. Report an issue when an asset needs attention."
                }
                action={
                  tab === "All" && !search
                    ? <Button id="mr-empty-report" onClick={() => setShowModal(true)}>Report issue</Button>
                    : undefined
                }
              />
            ) : (
              <div className="panel" style={{ padding: 0, overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Issue</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Technician</th>
                      <th>Raised</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <RequestRow
                        key={r.id} req={r}
                        onApprove={handleApprove} onReject={handleReject}
                        onAssign={handleAssign}   onStart={handleStart}
                        onResolve={handleResolve}
                        busy={busyId} actionError={actionError}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </ScreenShell>

      {/* Report-issue modal */}
      {showModal && (
        <div className="mr-modal-overlay" role="dialog" aria-modal="true" aria-label="Report maintenance issue"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="mr-modal">
            <h2>Report maintenance issue</h2>
            <form onSubmit={handleSubmit} noValidate>
              {formError && <ErrorSummary message={formError} />}
              <FormField label="Asset ID">
                <Input id="mr-form-asset-id" required placeholder="e.g. AF-0042"
                  value={form.asset_id} onChange={(e) => setForm((f) => ({ ...f, asset_id: e.target.value }))} />
              </FormField>
              <FormField label="Priority">
                <select id="mr-form-priority" className="mr-select" value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </FormField>
              <FormField label="Issue description">
                <textarea id="mr-form-description" required rows={3} className="input"
                  style={{ resize: "vertical", height: "auto" }}
                  placeholder="Describe the fault and the conditions under which it occurs…"
                  value={form.issue_description}
                  onChange={(e) => setForm((f) => ({ ...f, issue_description: e.target.value }))} />
              </FormField>
              <div className="mr-modal-footer">
                <button id="mr-form-cancel" type="button" className="button button--outline"
                  onClick={() => setShowModal(false)}>Cancel</button>
                <button id="mr-form-submit" type="submit" className="button" disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject-reason modal */}
      {rejectTarget && (
        <div className="mr-modal-overlay" role="dialog" aria-modal="true" aria-label="Reject maintenance request">
          <div className="mr-modal">
            <h2>Reject request</h2>
            {rejectError && <ErrorSummary message={rejectError} />}
            <FormField label="Reason (required)">
              <textarea id="mr-reject-reason" rows={3} className="input"
                style={{ resize: "vertical", height: "auto" }}
                placeholder="Explain why this request is being rejected…"
                value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </FormField>
            <div className="mr-modal-footer">
              <button id="mr-reject-cancel" type="button" className="button button--outline"
                onClick={() => setRejectTarget(null)}>Cancel</button>
              <button id="mr-reject-confirm" type="button" className="button button--danger"
                disabled={busyId === rejectTarget} onClick={() => void confirmReject()}>
                {busyId === rejectTarget ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign-technician modal */}
      {assignTarget && (
        <div className="mr-modal-overlay" role="dialog" aria-modal="true" aria-label="Assign technician">
          <div className="mr-modal">
            <h2>Assign technician</h2>
            {assignError && <ErrorSummary message={assignError} />}
            <FormField label="Technician name">
              <Input id="mr-assign-tech-name" required placeholder="Full name of the assigned technician"
                value={techName} onChange={(e) => setTechName(e.target.value)} />
            </FormField>
            <div className="mr-modal-footer">
              <button id="mr-assign-cancel" type="button" className="button button--outline"
                onClick={() => setAssignTarget(null)}>Cancel</button>
              <button id="mr-assign-confirm" type="button" className="button"
                disabled={busyId === assignTarget} onClick={() => void confirmAssign()}>
                {busyId === assignTarget ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve modal */}
      {resolveTarget && (
        <div className="mr-modal-overlay" role="dialog" aria-modal="true" aria-label="Resolve maintenance request">
          <div className="mr-modal">
            <h2>Mark as resolved</h2>
            {resolveError && <ErrorSummary message={resolveError} />}
            <FormField label="Resolution notes (optional)">
              <textarea id="mr-resolve-notes" rows={3} className="input"
                style={{ resize: "vertical", height: "auto" }}
                placeholder="Describe the work done and the outcome…"
                value={resolveNotes} onChange={(e) => setResolveNotes(e.target.value)} />
            </FormField>
            <div className="mr-modal-footer">
              <button id="mr-resolve-cancel" type="button" className="button button--outline"
                onClick={() => setResolveTarget(null)}>Cancel</button>
              <button id="mr-resolve-confirm" type="button" className="button"
                disabled={busyId === resolveTarget} onClick={() => void confirmResolve()}>
                {busyId === resolveTarget ? "Saving…" : "Mark resolved"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </>
  );
}
