import { useState, useEffect, useCallback } from "react";
import { Button, FormField, Input, ScreenShell, Skeleton, StatusChip, Toast } from "../../design-system";

// ── Types ─────────────────────────────────────────────────────────────────────
type MxStatus =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Technician Assigned"
  | "In Progress"
  | "Resolved";

type Priority = "low" | "medium" | "high" | "critical";

interface MaintenanceRequest {
  id: string;
  asset_id: string;
  asset_name?: string;
  asset_tag?: string;
  issue_description: string;
  priority: Priority;
  photo_url?: string;
  status: MxStatus;
  raised_by?: string;
  raised_by_name?: string;
  technician?: string;
  notes?: string;
  created_at: string;
  // per-card inline error from the API (e.g. BR-03 / 409)
  _cardError?: string;
}

interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const API = "/api/v1";

const COLUMNS: MxStatus[] = [
  "Pending",
  "Approved",
  "Rejected",
  "Technician Assigned",
  "In Progress",
  "Resolved",
];

const PRIORITY_LABEL: Record<Priority, string> = {
  low:      "Low",
  medium:   "Medium",
  high:     "High",
  critical: "Critical",
};

const PRIORITY_COLOUR: Record<Priority, string> = {
  low:      "#29323B",
  medium:   "#19334E",
  high:     "#493714",
  critical: "#4B2227",
};

const PRIORITY_TEXT: Record<Priority, string> = {
  low:      "#C6D0D8",
  medium:   "#8FC8FF",
  high:     "#FFD47A",
  critical: "#FF9AA5",
};

// Mock assets for the request form
const MOCK_ASSETS = [
  { id: "a-001", name: "MacBook Pro 16″", asset_tag: "AF-0021" },
  { id: "a-002", name: "Canon EOS R5",    asset_tag: "AF-0047" },
  { id: "a-003", name: "Bosch SHR Drill", asset_tag: "AF-0032" },
  { id: "a-004", name: "Epson Projector", asset_tag: "AF-0035" },
  { id: "a-005", name: "Dell Precision",  asset_tag: "AF-0066" },
];

// Mock seed data so the board is not empty on first load
const MOCK_REQUESTS: MaintenanceRequest[] = [
  {
    id: "mx-001", asset_id: "a-001", asset_name: "MacBook Pro 16″", asset_tag: "AF-0021",
    issue_description: "Keyboard backlight intermittent — keys B and N unresponsive.",
    priority: "high", status: "Pending", raised_by_name: "Priya Nair",
    created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  {
    id: "mx-002", asset_id: "a-002", asset_name: "Canon EOS R5", asset_tag: "AF-0047",
    issue_description: "LCD screen shows vertical purple line from top to centre.",
    priority: "medium", status: "Approved", raised_by_name: "Rahul Mehta",
    created_at: new Date(Date.now() - 6 * 3600000).toISOString(),
  },
  {
    id: "mx-003", asset_id: "a-003", asset_name: "Bosch SHR Drill", asset_tag: "AF-0032",
    issue_description: "Overheating after 2 min use. Burning smell detected.",
    priority: "critical", status: "Technician Assigned", raised_by_name: "Ankit Joshi",
    technician: "Ramesh Kumar",
    created_at: new Date(Date.now() - 24 * 3600000).toISOString(),
  },
  {
    id: "mx-004", asset_id: "a-004", asset_name: "Epson Projector", asset_tag: "AF-0035",
    issue_description: "HDMI port loose — intermittent no-signal error.",
    priority: "low", status: "In Progress", raised_by_name: "Sneha Iyer",
    technician: "Vikram Patel",
    created_at: new Date(Date.now() - 48 * 3600000).toISOString(),
  },
  {
    id: "mx-005", asset_id: "a-005", asset_name: "Dell Precision", asset_tag: "AF-0066",
    issue_description: "Fan making grinding noise under load.",
    priority: "medium", status: "Resolved", raised_by_name: "Karan Singh",
    technician: "Amit Rao",
    created_at: new Date(Date.now() - 72 * 3600000).toISOString(),
  },
  {
    id: "mx-006", asset_id: "a-001", asset_name: "MacBook Pro 16″", asset_tag: "AF-0021",
    issue_description: "Battery draining 3× faster than expected after last firmware update.",
    priority: "high", status: "Rejected", raised_by_name: "Meera Joshi",
    notes: "Duplicate request. Covered under mx-001.",
    created_at: new Date(Date.now() - 12 * 3600000).toISOString(),
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60)  return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

async function apiPost<T>(path: string, body?: unknown): Promise<{ ok: boolean; data?: T; error?: ApiError }> {
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: (json as { error: ApiError }).error };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: { code: "NETWORK_ERROR", message: "Network error — check your connection." } };
  }
}

async function apiPatch<T>(path: string, body?: unknown): Promise<{ ok: boolean; data?: T; error?: ApiError }> {
  try {
    const res = await fetch(`${API}${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: (json as { error: ApiError }).error };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: { code: "NETWORK_ERROR", message: "Network error — check your connection." } };
  }
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export function MaintenanceScreen() {
  const [requests, setRequests]   = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading]     = useState(true);

  // Form state
  const [showForm, setShowForm]         = useState(false);
  const [formAssetId, setFormAssetId]   = useState("");
  const [formDesc, setFormDesc]         = useState("");
  const [formPriority, setFormPriority] = useState<Priority>("medium");
  const [formPhoto, setFormPhoto]       = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError]       = useState<string | null>(null);

  // Technician assignment modal state
  const [assignTarget, setAssignTarget]   = useState<string | null>(null);
  const [techName, setTechName]           = useState("");
  const [techSubmitting, setTechSubmitting] = useState(false);

  // Reject modal state
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  // Per-card action pending
  const [pending, setPending] = useState<Record<string, boolean>>({});

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Fetch maintenance requests ──────────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/maintenance-requests`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
      });
      if (!res.ok) throw new Error();
      const data: { maintenance_requests: MaintenanceRequest[] } = await res.json();
      setRequests(data.maintenance_requests);
    } catch {
      // Use mock data when backend is not yet wired
      setRequests(MOCK_REQUESTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // ── Patch a single request in local state ────────────────────────────────
  function patchLocal(id: string, patch: Partial<MaintenanceRequest>) {
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }

  // ── POST /maintenance-requests ──────────────────────────────────────────
  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!formAssetId || !formDesc) { setFormError("Asset and description are required."); return; }
    setFormError(null);
    setFormSubmitting(true);

    const asset = MOCK_ASSETS.find((a) => a.id === formAssetId);
    const result = await apiPost<{ maintenance_request: MaintenanceRequest }>("/maintenance-requests", {
      asset_id: formAssetId,
      issue_description: formDesc,
      priority: formPriority,
      ...(formPhoto ? { photo_url: formPhoto } : {}),
    });

    if (result.ok && result.data) {
      setRequests((prev) => [result.data!.maintenance_request, ...prev]);
      showToast("Maintenance request raised ✓");
    } else {
      // Backend not yet wired — add mock request locally for demo
      const mock: MaintenanceRequest = {
        id: `mx-${Date.now()}`,
        asset_id: formAssetId,
        asset_name: asset?.name ?? "Unknown",
        asset_tag: asset?.asset_tag,
        issue_description: formDesc,
        priority: formPriority,
        photo_url: formPhoto || undefined,
        status: "Pending",
        raised_by_name: "You",
        created_at: new Date().toISOString(),
      };
      setRequests((prev) => [mock, ...prev]);
      showToast("Maintenance request raised ✓ (offline)");
    }

    setFormDesc(""); setFormAssetId(""); setFormPhoto(""); setFormPriority("medium");
    setShowForm(false);
    setFormSubmitting(false);
  }

  // ── PATCH /maintenance-requests/:id/approve ───────────────────────────────
  async function handleApprove(id: string) {
    setPending((p) => ({ ...p, [id]: true }));
    patchLocal(id, { _cardError: undefined });
    const result = await apiPatch<{ maintenance_request: MaintenanceRequest }>(`/maintenance-requests/${id}/approve`);
    if (result.ok && result.data) {
      patchLocal(id, result.data.maintenance_request);
      showToast("Request approved ✓");
    } else {
      // Optimistic update for demo
      patchLocal(id, { status: "Approved" });
      showToast("Approved (offline) ✓");
    }
    setPending((p) => ({ ...p, [id]: false }));
  }

  // ── PATCH /maintenance-requests/:id/reject ────────────────────────────────
  async function handleReject(id: string) {
    if (!rejectReason.trim()) return;
    setRejectSubmitting(true);
    const result = await apiPatch<{ maintenance_request: MaintenanceRequest }>(
      `/maintenance-requests/${id}/reject`,
      { reason: rejectReason }
    );
    if (result.ok && result.data) {
      patchLocal(id, result.data.maintenance_request);
    } else {
      patchLocal(id, { status: "Rejected", notes: rejectReason });
    }
    showToast("Request rejected.");
    setRejectTarget(null); setRejectReason(""); setRejectSubmitting(false);
  }

  // ── PATCH /maintenance-requests/:id/assign-technician ────────────────────
  async function handleAssign(id: string) {
    if (!techName.trim()) return;
    setTechSubmitting(true);
    const result = await apiPatch<{ maintenance_request: MaintenanceRequest }>(
      `/maintenance-requests/${id}/assign-technician`,
      { technician: techName }
    );
    if (result.ok && result.data) {
      patchLocal(id, result.data.maintenance_request);
    } else {
      patchLocal(id, { status: "Technician Assigned", technician: techName });
    }
    showToast(`Technician ${techName} assigned ✓`);
    setAssignTarget(null); setTechName(""); setTechSubmitting(false);
  }

  // ── PATCH /maintenance-requests/:id/start ────────────────────────────────
  // BR-03 guardrail: asset cannot enter Under Maintenance before approval.
  // If 409 is returned, surface the server's message inline on the card.
  async function handleStart(id: string) {
    setPending((p) => ({ ...p, [id]: true }));
    patchLocal(id, { _cardError: undefined });
    const result = await apiPatch<{ maintenance_request: MaintenanceRequest }>(
      `/maintenance-requests/${id}/start`
    );
    if (result.ok && result.data) {
      patchLocal(id, result.data.maintenance_request);
      showToast("Work started ✓");
    } else if (result.error) {
      // ── BR-03 guardrail: display server's actionable message inline ──────
      patchLocal(id, { _cardError: result.error.message });
    } else {
      // Optimistic update for demo (backend not wired)
      patchLocal(id, { status: "In Progress" });
      showToast("Work started ✓ (offline)");
    }
    setPending((p) => ({ ...p, [id]: false }));
  }

  // ── PATCH /maintenance-requests/:id/resolve ───────────────────────────────
  async function handleResolve(id: string) {
    setPending((p) => ({ ...p, [id]: true }));
    patchLocal(id, { _cardError: undefined });
    const result = await apiPatch<{ maintenance_request: MaintenanceRequest }>(
      `/maintenance-requests/${id}/resolve`
    );
    if (result.ok && result.data) {
      patchLocal(id, result.data.maintenance_request);
      showToast("Request resolved ✓");
    } else {
      patchLocal(id, { status: "Resolved" });
      showToast("Resolved ✓ (offline)");
    }
    setPending((p) => ({ ...p, [id]: false }));
  }

  // ── Column cards ──────────────────────────────────────────────────────────
  const columnCards = (status: MxStatus) =>
    requests.filter((r) => r.status === status);

  return (
    <>
      <style>{`
        /* ── Form panel ────────────────────────────────────────── */
        .mx-form-panel {
          border: 1px solid #33404D;
          border-radius: 14px;
          background: #141A21;
          padding: 24px;
          margin-bottom: 32px;
        }
        .mx-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0 20px;
        }
        .mx-form-error {
          background: #351B20;
          border-left: 3px solid #F87171;
          border-radius: 0 6px 6px 0;
          padding: 10px 14px;
          font-size: 12px;
          color: #FF9AA5;
          margin-bottom: 12px;
        }
        .mx-form-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 4px;
        }
        .btn-secondary {
          background: #1E262F;
          border: 1px solid #33404D;
          border-radius: 9px;
          color: #9EABB8;
          padding: 10px 16px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: background .15s;
        }
        .btn-secondary:hover { background: #29323B; color: #F3F6F8; }

        /* ── Kanban board ──────────────────────────────────────── */
        .kanban-board {
          display: grid;
          grid-template-columns: repeat(6, minmax(210px, 1fr));
          gap: 12px;
          overflow-x: auto;
          padding-bottom: 24px;
          margin-bottom: 40px;
        }
        .kanban-col {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 210px;
        }
        .kanban-col-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-radius: 10px;
          background: #1E262F;
          border: 1px solid #33404D;
          margin-bottom: 2px;
        }
        .kanban-col-title {
          font-size: 12px;
          font-weight: 700;
          color: #F3F6F8;
          letter-spacing: .04em;
        }
        .kanban-col-count {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 999px;
          background: #29323B;
          color: #9EABB8;
        }

        /* ── Kanban card ───────────────────────────────────────── */
        .mx-card {
          border: 1px solid #33404D;
          border-radius: 12px;
          background: #141A21;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: box-shadow .15s;
        }
        .mx-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.3); }

        /* Accent left bar per column */
        .mx-card--Pending            { border-left: 3px solid #FFD47A; }
        .mx-card--Approved           { border-left: 3px solid #8FC8FF; }
        .mx-card--Rejected           { border-left: 3px solid #FF9AA5; }
        .mx-card--Technician\ Assigned { border-left: 3px solid #8FC8FF; }
        .mx-card--In\ Progress       { border-left: 3px solid #7DE2AE; }
        .mx-card--Resolved           { border-left: 3px solid #C6D0D8; opacity: .8; }

        .mx-card-asset {
          font-size: 13px;
          font-weight: 700;
          color: #F3F6F8;
        }
        .mx-card-tag {
          font-size: 10px;
          color: #9EABB8;
          font-weight: 600;
          letter-spacing: .06em;
          margin-top: 1px;
        }
        .mx-card-desc {
          font-size: 12px;
          color: #C6D0D8;
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .mx-card-meta {
          font-size: 11px;
          color: #9EABB8;
        }
        .mx-card-technician {
          font-size: 11px;
          color: #8FC8FF;
          font-weight: 600;
        }
        .priority-pill {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .04em;
          text-transform: uppercase;
        }
        .mx-card-actions {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 2px;
        }
        .mx-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          width: 100%;
          border: 1px solid transparent;
          border-radius: 7px;
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: filter .12s;
        }
        .mx-action-btn:disabled { opacity: .45; cursor: not-allowed; }
        .mx-action-btn:not(:disabled):hover { filter: brightness(1.18); }
        .mx-action-btn--approve   { background: #19334E; color: #8FC8FF; border-color: #1D3F66; }
        .mx-action-btn--reject    { background: #4B2227; color: #FF9AA5; border-color: #6B2E35; }
        .mx-action-btn--assign    { background: #19334E; color: #8FC8FF; border-color: #1D3F66; }
        .mx-action-btn--start     { background: #173C2D; color: #7DE2AE; border-color: #2A5C44; }
        .mx-action-btn--resolve   { background: #29323B; color: #C6D0D8; border-color: #3D4E5C; }

        /* ── BR-03 guardrail inline error ──────────────────────── */
        .mx-card-guardrail {
          background: #1F1118;
          border: 1.5px solid #6B2E35;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 11px;
          color: #FF9AA5;
          line-height: 1.5;
          display: flex;
          gap: 8px;
          align-items: flex-start;
        }
        .mx-card-guardrail-icon {
          flex-shrink: 0;
          width: 18px; height: 18px;
          background: #4B2227;
          border-radius: 5px;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px;
        }

        /* ── Notes block ───────────────────────────────────────── */
        .mx-card-notes {
          font-size: 11px;
          color: #9EABB8;
          background: #1E262F;
          border-radius: 6px;
          padding: 8px 10px;
          font-style: italic;
        }

        /* ── Modal overlay ─────────────────────────────────────── */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }
        .modal-box {
          background: #141A21;
          border: 1px solid #33404D;
          border-radius: 16px;
          padding: 28px;
          width: 400px;
          max-width: calc(100vw - 48px);
        }
        .modal-title {
          font-size: 17px;
          font-weight: 700;
          color: #F3F6F8;
          margin: 0 0 16px;
        }
        .modal-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 16px;
        }

        /* ── Section title ─────────────────────────────────────── */
        .screen-section-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: #5AA7FF;
          margin: 0 0 16px;
        }
        .toggle-form-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #5AA7FF;
          color: #07111B;
          border: 0;
          border-radius: 9px;
          padding: 10px 18px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          margin-bottom: 20px;
          transition: filter .15s;
        }
        .toggle-form-btn:hover { filter: brightness(1.1); }

        /* ── Empty column ──────────────────────────────────────── */
        .kanban-empty {
          border: 1px dashed #33404D;
          border-radius: 10px;
          padding: 20px 12px;
          text-align: center;
          color: #9EABB8;
          font-size: 12px;
        }
      `}</style>

      <ScreenShell
        title="Maintenance"
        description="Move approved work through a clear, auditable repair workflow."
      >

        {/* ── Raise Request button ─────────────────────────────── */}
        <button
          id="toggle-mx-form"
          className="toggle-form-btn"
          onClick={() => { setShowForm((v) => !v); setFormError(null); }}
        >
          {showForm ? "✕ Close Form" : "＋ Raise Maintenance Request"}
        </button>

        {/* ── Request Form ─────────────────────────────────────── */}
        {showForm && (
          <div className="mx-form-panel" role="region" aria-label="New maintenance request form">
            <p className="screen-section-title" style={{ marginBottom: 16 }}>New Maintenance Request</p>
            {formError && <div className="mx-form-error" role="alert">{formError}</div>}
            <form onSubmit={handleSubmitRequest} noValidate>
              <div className="mx-form-row">
                <FormField label="Asset">
                  <select
                    id="mx-asset-select"
                    className="input"
                    value={formAssetId}
                    required
                    onChange={(e) => setFormAssetId(e.target.value)}
                  >
                    <option value="">— Select an asset —</option>
                    {MOCK_ASSETS.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.asset_tag})</option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Priority">
                  <select
                    id="mx-priority-select"
                    className="input"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as Priority)}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </FormField>
              </div>

              <FormField label="Issue Description">
                <textarea
                  id="mx-issue-desc"
                  className="input"
                  rows={3}
                  required
                  placeholder="Describe the issue clearly — what happens, when it started, impact."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  style={{ resize: "vertical" }}
                />
              </FormField>

              <FormField label="Photo URL (optional)" hint="Paste a link to an image of the issue.">
                <Input
                  id="mx-photo-url"
                  type="url"
                  placeholder="https://…"
                  value={formPhoto}
                  onChange={(e) => setFormPhoto(e.target.value)}
                />
              </FormField>

              <div className="mx-form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <Button
                  id="mx-submit-btn"
                  type="submit"
                  disabled={formSubmitting}
                >
                  {formSubmitting ? "Raising…" : "Raise Request"}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* ── Kanban Board ─────────────────────────────────────── */}
        <p className="screen-section-title">Maintenance Pipeline</p>

        {loading ? (
          <Skeleton lines={5} />
        ) : (
          <div className="kanban-board" role="region" aria-label="Maintenance Kanban board">
            {COLUMNS.map((col) => {
              const cards = columnCards(col);
              return (
                <div key={col} className="kanban-col" aria-label={`${col} column`}>
                  {/* Column header with StatusChip */}
                  <div className="kanban-col-header">
                    <StatusChip status={col} />
                    <span className="kanban-col-count">{cards.length}</span>
                  </div>

                  {cards.length === 0 ? (
                    <div className="kanban-empty">No requests</div>
                  ) : (
                    cards.map((req) => {
                      const isPending = pending[req.id];
                      return (
                        <article
                          key={req.id}
                          className={`mx-card mx-card--${req.status}`}
                          aria-label={`Maintenance request ${req.id}`}
                        >
                          {/* Asset info */}
                          <div>
                            <div className="mx-card-asset">{req.asset_name ?? "Unknown asset"}</div>
                            {req.asset_tag && <div className="mx-card-tag">{req.asset_tag}</div>}
                          </div>

                          {/* Priority pill + StatusChip */}
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            <span
                              className="priority-pill"
                              style={{ background: PRIORITY_COLOUR[req.priority], color: PRIORITY_TEXT[req.priority] }}
                            >
                              {PRIORITY_LABEL[req.priority]}
                            </span>
                            <StatusChip status={req.status} />
                          </div>

                          {/* Issue description */}
                          <p className="mx-card-desc">{req.issue_description}</p>

                          {/* Meta */}
                          <div className="mx-card-meta">
                            By {req.raised_by_name ?? "Unknown"} · {fmtAgo(req.created_at)}
                          </div>

                          {/* Technician */}
                          {req.technician && (
                            <div className="mx-card-technician">⚙ {req.technician}</div>
                          )}

                          {/* Notes / rejection reason */}
                          {req.notes && (
                            <div className="mx-card-notes">"{req.notes}"</div>
                          )}

                          {/* ── BR-03 Guardrail inline error ──────────────
                              Displayed when the backend returns a 409 on
                              the /start endpoint because the request is not
                              yet approved — surfaces the server's actionable
                              message directly on the card.
                          ─────────────────────────────────────────────── */}
                          {req._cardError && (
                            <div className="mx-card-guardrail" role="alert" aria-live="assertive">
                              <span className="mx-card-guardrail-icon" aria-hidden="true">⊘</span>
                              <span>{req._cardError}</span>
                            </div>
                          )}

                          {/* ── Transition buttons ─────────────────────── */}
                          <div className="mx-card-actions">
                            {req.status === "Pending" && (
                              <>
                                <button
                                  id={`approve-${req.id}`}
                                  className="mx-action-btn mx-action-btn--approve"
                                  disabled={isPending}
                                  onClick={() => handleApprove(req.id)}
                                >
                                  ✓ Approve
                                </button>
                                <button
                                  id={`reject-${req.id}`}
                                  className="mx-action-btn mx-action-btn--reject"
                                  disabled={isPending}
                                  onClick={() => { setRejectTarget(req.id); setRejectReason(""); }}
                                >
                                  ✕ Reject
                                </button>
                                {/* BR-03 demo: Start on Pending → triggers 409 */}
                                <button
                                  id={`start-pending-${req.id}`}
                                  className="mx-action-btn mx-action-btn--start"
                                  disabled={isPending}
                                  onClick={() => handleStart(req.id)}
                                  title="Attempting to start before approval triggers BR-03"
                                >
                                  ▷ Start (BR-03 demo)
                                </button>
                              </>
                            )}

                            {req.status === "Approved" && (
                              <button
                                id={`assign-${req.id}`}
                                className="mx-action-btn mx-action-btn--assign"
                                disabled={isPending}
                                onClick={() => { setAssignTarget(req.id); setTechName(""); }}
                              >
                                ⚙ Assign Technician
                              </button>
                            )}

                            {req.status === "Technician Assigned" && (
                              <button
                                id={`start-${req.id}`}
                                className="mx-action-btn mx-action-btn--start"
                                disabled={isPending}
                                onClick={() => handleStart(req.id)}
                              >
                                ▷ Start Work
                              </button>
                            )}

                            {req.status === "In Progress" && (
                              <button
                                id={`resolve-${req.id}`}
                                className="mx-action-btn mx-action-btn--resolve"
                                disabled={isPending}
                                onClick={() => handleResolve(req.id)}
                              >
                                ✓ Mark Resolved
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScreenShell>

      {/* ── Assign Technician Modal ─────────────────────────────── */}
      {assignTarget && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Assign technician">
          <div className="modal-box">
            <p className="modal-title">Assign Technician</p>
            <FormField label="Technician Name">
              <Input
                id="modal-tech-name"
                autoFocus
                placeholder="Full name"
                value={techName}
                onChange={(e) => setTechName(e.target.value)}
              />
            </FormField>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setAssignTarget(null)}>Cancel</button>
              <Button
                id="modal-assign-confirm"
                disabled={!techName.trim() || techSubmitting}
                onClick={() => handleAssign(assignTarget)}
              >
                {techSubmitting ? "Assigning…" : "Assign"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ─────────────────────────────────────────── */}
      {rejectTarget && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Reject request">
          <div className="modal-box">
            <p className="modal-title">Reject Request</p>
            <FormField label="Reason" hint="Required — will be visible on the card.">
              <textarea
                id="modal-reject-reason"
                className="input"
                rows={3}
                autoFocus
                placeholder="Explain why this request is being rejected."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                style={{ resize: "vertical" }}
              />
            </FormField>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setRejectTarget(null)}>Cancel</button>
              <Button
                id="modal-reject-confirm"
                disabled={!rejectReason.trim() || rejectSubmitting}
                style={{ background: "#FF9AA5", color: "#2C0A10" }}
                onClick={() => handleReject(rejectTarget)}
              >
                {rejectSubmitting ? "Rejecting…" : "Reject Request"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast} />}
    </>
  );
}
