import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
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

const API_BASE = "/api/v1";
const FIXTURE_MODE = import.meta.env.DEV && import.meta.env.VITE_USE_FIXTURES === "true";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditCycle {
  id: string;
  scope_department_id?: string;
  scope_location?: string;
  date_range_start: string;
  date_range_end: string;
  status: "active" | "closed";
  created_by?: string;
}

interface Asset {
  id: string;
  name: string;
  asset_tag: string;
  location: string;
}

type FindingResult = "verified" | "missing" | "damaged" | "pending";

interface LocalFinding {
  asset_id: string;
  asset_name: string;
  asset_tag: string;
  result: FindingResult;
  notes: string;
  saved: boolean;
}

interface DiscrepancyReport {
  audit_cycle: AuditCycle;
  findings: { asset_id: string; result: string; notes?: string }[];
  summary: Record<string, unknown>;
}

// ─── API Wrapper ──────────────────────────────────────────────────────────────

async function mFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
  new Headers(options.headers).forEach((v, k) => headers.set(k, v));
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({
      error: { code: "UNKNOWN", message: "An unexpected error occurred." },
    }));
    throw body.error;
  }
  return res.json() as Promise<T>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AuditScreen() {
  const navigate = useNavigate();
  
  // ── State: Cycle management ──
  const [activeCycle, setActiveCycle] = useState<AuditCycle | null>(null);
  const [closedReport, setClosedReport] = useState<{ report: DiscrepancyReport; lostAssets: Asset[] } | null>(null);
  
  // ── State: Creation form ──
  const [createDept, setCreateDept] = useState("");
  const [createLoc, setCreateLoc] = useState("");
  const [createStart, setCreateStart] = useState("");
  const [createEnd, setCreateEnd] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // ── State: Active cycle tools ──
  const [auditorId, setAuditorId] = useState("");
  const [assigningAuditor, setAssigningAuditor] = useState(false);
  
  // We manage the list of assets to audit based on the scope.
  const [findings, setFindings] = useState<LocalFinding[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [savingFindings, setSavingFindings] = useState(false);
  
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  // ── Actions: Create Cycle ──
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!createStart || !createEnd) {
      setCreateError("Date range is required.");
      return;
    }
    setCreating(true);
    try {
      const payload: Record<string, string> = {
        date_range_start: new Date(createStart).toISOString(),
        date_range_end: new Date(createEnd).toISOString(),
      };
      if (createDept.trim()) payload.scope_department_id = createDept.trim();
      if (createLoc.trim()) payload.scope_location = createLoc.trim();

      const data = await mFetch<{ audit_cycle: AuditCycle }>("/audit-cycles", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setActiveCycle(data.audit_cycle);
      showToast("Audit cycle created.");
      loadAssetsForScope(payload.scope_department_id, payload.scope_location);
    } catch (err: any) {
      setCreateError(err.message ?? "Could not create audit cycle.");
    } finally {
      setCreating(false);
    }
  }

  // ── Actions: Load Assets for Scope ──
  // The API doesn't provide a direct way to fetch cycle findings until they are saved,
  // so we fetch all assets matching the scope to build our checklist.
  async function loadAssetsForScope(dept?: string, loc?: string) {
    setLoadingAssets(true);
    try {
      const params = new URLSearchParams();
      if (dept) params.append("department", dept);
      if (loc) params.append("location", loc);
      const url = params.toString() ? `/assets?${params.toString()}` : `/assets`;
      
      const data = await mFetch<{ assets: Asset[] }>(url);
      const initialFindings: LocalFinding[] = data.assets.map(a => ({
        asset_id: a.id,
        asset_name: a.name,
        asset_tag: a.asset_tag,
        result: "pending",
        notes: "",
        saved: false,
      }));
      setFindings(initialFindings);
    } catch (err) {
      console.error("Failed to load assets for scope", err);
    } finally {
      setLoadingAssets(false);
    }
  }

  // ── Actions: Assign Auditor ──
  async function handleAssignAuditor(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCycle || !auditorId.trim()) return;
    setAssigningAuditor(true);
    try {
      await mFetch(`/audit-cycles/${activeCycle.id}/auditors`, {
        method: "POST",
        body: JSON.stringify({ auditor_ids: [auditorId.trim()] }),
      });
      showToast("Auditor assigned successfully.");
      setAuditorId("");
    } catch (err: any) {
      alert(err.message ?? "Could not assign auditor.");
    } finally {
      setAssigningAuditor(false);
    }
  }

  // ── Actions: Save Finding ──
  async function saveFinding(assetId: string, result: FindingResult, notes: string) {
    if (!activeCycle) return;
    setSavingFindings(true);
    try {
      await mFetch(`/audit-cycles/${activeCycle.id}/findings`, {
        method: "PATCH",
        body: JSON.stringify({
          findings: [{ asset_id: assetId, result, notes: notes || undefined }],
        }),
      });
      setFindings(prev => prev.map(f => f.asset_id === assetId ? { ...f, result, notes, saved: true } : f));
      showToast("Finding recorded.");
    } catch (err: any) {
      alert(err.message ?? "Failed to record finding.");
    } finally {
      setSavingFindings(false);
    }
  }

  // ── Actions: Close Cycle ──
  async function handleCloseCycle() {
    if (!activeCycle) return;
    const pending = findings.filter(f => f.result === "pending");
    if (pending.length > 0) {
      setCloseError(`${pending.length} assets are still pending verification.`);
      return;
    }
    setClosing(true);
    setCloseError(null);
    try {
      const data = await mFetch<{ audit_cycle: AuditCycle; assets_marked_lost: Asset[]; discrepancy_summary: any }>(
        `/audit-cycles/${activeCycle.id}/close`,
        { method: "POST", body: JSON.stringify({ confirmation: true }) }
      );
      showToast("Audit cycle closed.");
      // Fetch final discrepancy report
      const reportData = await mFetch<DiscrepancyReport>(`/audit-cycles/${activeCycle.id}/discrepancy-report`);
      setActiveCycle(null);
      setClosedReport({ report: reportData, lostAssets: data.assets_marked_lost });
    } catch (err: any) {
      setCloseError(err.message ?? "Failed to close audit cycle.");
    } finally {
      setClosing(false);
    }
  }

  // Formatting helpers
  function fmtStatus(r: FindingResult) {
    if (r === "verified") return "Verified";
    if (r === "damaged") return "Damaged";
    if (r === "missing") return "Missing";
    return "Pending";
  }

  return (
    <>
      <style>{`
        .audit-layout { display: grid; grid-template-columns: 1fr 340px; gap: 24px; align-items: start; }
        .audit-header { margin-bottom: 24px; }
        .audit-finding-row { display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid #33404D; }
        .audit-finding-row:last-child { border-bottom: none; }
        .af-info { flex: 1; }
        .af-name { font-weight: 600; color: #F3F6F8; font-size: 14px; margin-bottom: 4px; }
        .af-tag { font-size: 12px; color: #9EABB8; }
        .af-actions { display: flex; gap: 8px; align-items: center; }
        .af-note-input { background: #0B0F14; border: 1px solid #33404D; border-radius: 6px; color: #F3F6F8; padding: 6px 10px; font-size: 13px; width: 160px; }
        .lost-asset-card { border: 1px solid #4B2227; background: #1A1116; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; }
      `}</style>

      <ScreenShell
        title="Asset Audit"
        description="Verify assets, document discrepancies, and close controlled audit cycles."
      >
        {/* VIEW 3: Discrepancy Report (Closed Cycle) */}
        {closedReport && (
          <div className="panel" style={{ padding: 32 }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ display: "inline-flex", background: "#19334E", color: "#8FC8FF", padding: "12px 24px", borderRadius: 99, fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
                Audit Cycle Closed ✓
              </div>
              <h2 style={{ margin: "0 0 8px", fontSize: 24, color: "#F3F6F8" }}>Discrepancy Report</h2>
              <p style={{ margin: 0, color: "#9EABB8" }}>
                Cycle ID: {closedReport.report.audit_cycle.id}
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
              <div className="panel" style={{ background: "#0B0F14" }}>
                <h3 style={{ margin: "0 0 16px", color: "#F3F6F8", fontSize: 16 }}>Summary</h3>
                <pre style={{ margin: 0, color: "#C6D0D8", fontSize: 13, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(closedReport.report.summary, null, 2)}
                </pre>
              </div>
              <div className="panel" style={{ background: "#0B0F14" }}>
                <h3 style={{ margin: "0 0 16px", color: "#FF9AA5", fontSize: 16 }}>Assets Marked Lost</h3>
                {closedReport.lostAssets.length === 0 ? (
                  <p style={{ color: "#9EABB8", fontSize: 14 }}>No assets were marked lost.</p>
                ) : (
                  closedReport.lostAssets.map(a => (
                    <div key={a.id} className="lost-asset-card">
                      <div style={{ fontWeight: 600, color: "#FF9AA5", fontSize: 14 }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: "#C6D0D8", marginTop: 4 }}>{a.asset_tag}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ textAlign: "center" }}>
              <Button onClick={() => setClosedReport(null)}>Start New Audit Cycle</Button>
              <div style={{ marginTop: 24 }}>
                <Link to="/reports?type=ghost_risk" style={{ color: "#5AA7FF", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
                  View Ghost Radar ⚲
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: Active Cycle */}
        {!closedReport && activeCycle && (
          <div className="audit-layout">
            <div className="panel" style={{ padding: 24 }}>
              <div className="audit-header">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 style={{ margin: 0, fontSize: 18, color: "#F3F6F8" }}>Verification Checklist</h2>
                  <StatusChip status="Ongoing" />
                </div>
                <p style={{ fontSize: 13, color: "#9EABB8", marginTop: 8 }}>
                  Scope: {activeCycle.scope_department_id || "All Departments"} • {activeCycle.scope_location || "All Locations"}
                </p>
              </div>

              {loadingAssets ? (
                <Skeleton lines={6} />
              ) : findings.length === 0 ? (
                <EmptyState title="No assets found in this scope." />
              ) : (
                <div style={{ marginTop: 16 }}>
                  {findings.map(f => (
                    <div key={f.asset_id} className="audit-finding-row">
                      <div className="af-info">
                        <div className="af-name">{f.asset_name}</div>
                        <div className="af-tag">{f.asset_tag}</div>
                      </div>
                      
                      {f.saved ? (
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                          {f.notes && <span style={{ fontSize: 12, color: "#9EABB8" }}>"{f.notes}"</span>}
                          <StatusChip status={fmtStatus(f.result) as any} />
                        </div>
                      ) : (
                        <div className="af-actions">
                          <input 
                            type="text" 
                            className="af-note-input"
                            placeholder="Optional notes..." 
                            value={f.notes}
                            onChange={(e) => setFindings(prev => prev.map(p => p.asset_id === f.asset_id ? { ...p, notes: e.target.value } : p))}
                          />
                          <button 
                            className="button button--sm button--outline"
                            onClick={() => saveFinding(f.asset_id, "verified", f.notes)}
                            disabled={savingFindings}
                          >Verified</button>
                          <button 
                            className="button button--sm button--outline"
                            onClick={() => saveFinding(f.asset_id, "damaged", f.notes)}
                            disabled={savingFindings}
                          >Damaged</button>
                          <button 
                            className="button button--sm button--danger"
                            onClick={() => saveFinding(f.asset_id, "missing", f.notes)}
                            disabled={savingFindings}
                          >Missing</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div className="panel">
                <h3 style={{ margin: "0 0 16px", color: "#F3F6F8", fontSize: 16 }}>Assign Auditor</h3>
                <form onSubmit={handleAssignAuditor} style={{ display: "flex", gap: 8 }}>
                  <Input 
                    placeholder="User ID (e.g. u-123)" 
                    value={auditorId} 
                    onChange={e => setAuditorId(e.target.value)}
                    required
                  />
                  <Button type="submit" disabled={assigningAuditor}>Assign</Button>
                </form>
              </div>

              <div className="panel" style={{ background: "#1A1116", borderColor: "#4B2227" }}>
                <h3 style={{ margin: "0 0 16px", color: "#FF9AA5", fontSize: 16 }}>Close Cycle</h3>
                <p style={{ fontSize: 13, color: "#C6D0D8", marginBottom: 16, lineHeight: 1.5 }}>
                  Closing the cycle will transition all assets marked "Missing" into a permanently Lost state. This cannot be undone.
                </p>
                {closeError && <div style={{ marginBottom: 12 }}><ErrorSummary message={closeError} /></div>}
                <Button 
                  onClick={handleCloseCycle} 
                  disabled={closing || findings.some(f => f.result === "pending")}
                  style={{ width: "100%", background: "#4B2227", color: "#FF9AA5" }}
                >
                  {closing ? "Closing..." : "Confirm & Close Audit"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 1: Create Cycle Form (Empty State) */}
        {!closedReport && !activeCycle && (
          <div style={{ maxWidth: 500, margin: "0 auto" }}>
            <div className="panel" style={{ padding: 32 }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 20, color: "#F3F6F8" }}>Create Audit Cycle</h2>
              <p style={{ margin: "0 0 24px", color: "#9EABB8", fontSize: 14 }}>
                Define a scope to generate a verification checklist.
              </p>

              <form onSubmit={handleCreate}>
                {createError && <ErrorSummary message={createError} />}
                
                <FormField label="Department Scope (Optional)">
                  <Input 
                    placeholder="e.g. dept-engineering" 
                    value={createDept}
                    onChange={e => setCreateDept(e.target.value)}
                  />
                </FormField>
                <FormField label="Location Scope (Optional)">
                  <Input 
                    placeholder="e.g. BLR-01" 
                    value={createLoc}
                    onChange={e => setCreateLoc(e.target.value)}
                  />
                </FormField>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <FormField label="Start Date">
                    <Input 
                      type="date" 
                      required 
                      value={createStart}
                      onChange={e => setCreateStart(e.target.value)}
                    />
                  </FormField>
                  <FormField label="End Date">
                    <Input 
                      type="date" 
                      required 
                      value={createEnd}
                      onChange={e => setCreateEnd(e.target.value)}
                    />
                  </FormField>
                </div>

                <div style={{ marginTop: 32, display: "flex", justifyContent: "flex-end" }}>
                  <Button type="submit" disabled={creating}>
                    {creating ? "Creating..." : "Create Cycle"}
                  </Button>
                </div>
              </form>
            </div>
            
            {FIXTURE_MODE && (
              <div className="panel" style={{ marginTop: 24, padding: 24, borderStyle: "dashed" }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#F3F6F8" }}>[FIXTURES] Load Seeded Cycle</h3>
                <div style={{ display: "flex", gap: 8 }}>
                  <Input id="dev-cycle-id" placeholder="Cycle ID" />
                  <Button className="button button--outline" onClick={() => {
                    const id = (document.getElementById("dev-cycle-id") as HTMLInputElement).value;
                    if (id) {
                      setActiveCycle({
                        id,
                        date_range_start: new Date().toISOString(),
                        date_range_end: new Date().toISOString(),
                        status: "active"
                      });
                      loadAssetsForScope();
                    }
                  }}>Load</Button>
                </div>
              </div>
            )}
            
            <div style={{ marginTop: 40, textAlign: "center" }}>
               <Link to="/reports?type=ghost_risk" style={{ color: "#5AA7FF", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
                  View Ghost Radar ⚲
               </Link>
            </div>
          </div>
        )}
      </ScreenShell>

      {toast && <Toast message={toast} />}
    </>
  );
}
