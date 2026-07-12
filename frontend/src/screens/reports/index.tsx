import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ScreenShell, Skeleton, Button, EmptyState, ErrorSummary, Input } from "../../design-system";
import { getToken } from "../../auth/api";

const API_BASE = "/api/v1";

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
    throw body.error ?? { code: "UNKNOWN", message: "An unexpected error occurred." };
  }
  return res.json() as Promise<T>;
}

type TabKey = "utilization" | "maintenance" | "allocation" | "heatmap" | "ghost";

export function ReportsScreen() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("utilization");
  
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Data states
  const [utilizationData, setUtilizationData] = useState<any>(null);
  const [maintenanceData, setMaintenanceData] = useState<any>(null);
  const [allocationData, setAllocationData] = useState<any>(null);
  const [heatmapData, setHeatmapData] = useState<any>(null);
  const [ghostData, setGhostData] = useState<any>(null);
  const [creatingAudit, setCreatingAudit] = useState(false);

  useEffect(() => {
    void fetchReportData();
  }, [activeTab]);

  async function fetchReportData() {
    setLoading(true);
    setError("");
    const qs = new URLSearchParams();
    if (department) qs.set("department", department);
    if (location) qs.set("location", location);
    
    try {
      if (activeTab === "utilization") {
        const d = await mFetch(`/reports/utilization?${qs.toString()}`);
        setUtilizationData(d);
      } else if (activeTab === "maintenance") {
        const d = await mFetch(`/reports/maintenance-frequency?${qs.toString()}`);
        setMaintenanceData(d);
      } else if (activeTab === "allocation") {
        const d = await mFetch(`/reports/department-allocation-summary?${qs.toString()}`);
        setAllocationData(d);
      } else if (activeTab === "heatmap") {
        const d = await mFetch(`/reports/booking-heatmap?${qs.toString()}`);
        setHeatmapData(d);
      } else if (activeTab === "ghost") {
        const d = await mFetch(`/reports/ghost-risk?${qs.toString()}`);
        setGhostData(d);
      }
    } catch (err: any) {
      const message = typeof err?.message === "string" && err.message.trim()
        ? err.message
        : "Unable to load this report. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    const qs = new URLSearchParams();
    qs.set("format", "csv");
    qs.set("report", activeTab);
    if (department) qs.set("department", department);
    if (location) qs.set("location", location);
    
    const token = getToken();
    const url = `${API_BASE}/reports/export?${qs.toString()}`;
    
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(res => {
        if (!res.ok) throw new Error("Export failed");
        return res.blob();
      })
      .then(blob => {
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `report_${activeTab}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(e => setError(e?.message || "Export failed. Please try again."));
  }

  async function handleInitiateAudit() {
    if (!ghostData?.assets?.length) return;
    setCreatingAudit(true);
    try {
      const today = new Date();
      const asDate = (date: Date) => date.toISOString().slice(0, 10);
      const payload: any = {
        date_range_start: asDate(today),
        date_range_end: asDate(new Date(today.getTime() + 7 * 86400000))
      };
      if (department) payload.scope_department_id = department;
      if (location) payload.scope_location = location;
      
      const res = await mFetch<{ audit_cycle: { id: string } }>("/audit-cycles", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      navigate("/audits");
    } catch (err: any) {
      setError(err?.message || "Failed to create audit cycle");
    } finally {
      setCreatingAudit(false);
    }
  }

  function renderHeatmap() {
    if (!heatmapData?.cells) return <EmptyState title="No heatmap data" />;
    
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const hours = Array.from({length: 24}, (_, i) => i);
    
    const maxCount = Math.max(...heatmapData.cells.map((c: any) => c.booking_count), 1);

    const getCellColor = (count: number) => {
      if (count === 0) return "#1F2730";
      const intensity = Math.min(count / maxCount, 1);
      return `rgba(90, 167, 255, ${Math.max(0.2, intensity)})`;
    };

    return (
      <div style={{ overflowX: "auto" }}>
        <table className="report-table" style={{ minWidth: 800 }}>
          <thead>
            <tr>
              <th>Day / Hour</th>
              {hours.map(h => <th key={h} style={{ textAlign: "center", width: 28 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {days.map((day, dIdx) => (
              <tr key={day}>
                <td style={{ fontWeight: 600 }}>{day}</td>
                {hours.map(h => {
                  const cell = heatmapData.cells.find((c: any) => c.day_of_week === dIdx && c.hour === h);
                  const count = cell ? cell.booking_count : 0;
                  return (
                    <td key={h} style={{ padding: 2 }}>
                      <div 
                        title={`${count} bookings`}
                        style={{ 
                          height: 24, 
                          background: getCellColor(count),
                          borderRadius: 4,
                          cursor: "pointer"
                        }} 
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderTable(data: any, columns: string[], rowKey: string, renderRow: (row: any) => React.ReactNode) {
    if (!data?.rows || data.rows.length === 0) return <EmptyState title="No data available" />;
    return (
      <table className="report-table">
        <thead>
          <tr>{columns.map(c => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {data.rows.map((row: any, i: number) => <tr key={row[rowKey] || i}>{renderRow(row)}</tr>)}
        </tbody>
      </table>
    );
  }

  return (
    <>
      <style>{`
        .tabs { display: flex; gap: 16px; border-bottom: 1px solid #33404D; margin-bottom: 24px; padding-bottom: 8px; flex-wrap: wrap; }
        .tab-btn { background: none; border: none; color: #9EABB8; font-size: 14px; font-weight: 600; cursor: pointer; padding: 8px 16px; border-radius: 6px; }
        .tab-btn:hover { background: #1E262F; color: #F3F6F8; }
        .tab-btn.active { background: #19334E; color: #8FC8FF; }
        
        .filter-bar { display: flex; gap: 16px; margin-bottom: 24px; align-items: flex-end; }
        
        .report-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .report-table th { text-align: left; padding: 12px; color: #9EABB8; font-weight: 600; text-transform: uppercase; font-size: 11px; border-bottom: 1px solid #33404D; }
        .report-table td { padding: 12px; border-bottom: 1px solid #1F2730; color: #F3F6F8; }
        .report-table tr:hover td { background: rgba(255,255,255,0.02); }

        .metric-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .metric-card { background: linear-gradient(135deg, rgba(27, 49, 74, .72), rgba(12, 27, 43, .62)); border: 1px solid rgba(174, 213, 255, .18); padding: 20px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.04); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
        .metric-val { font-size: 32px; font-weight: 800; color: #F3F6F8; margin-top: 8px; }
      `}</style>

      <ScreenShell
        title="Reports and Analytics"
        description="Explore database-backed utilization, maintenance, allocation, heatmap, and ghost-risk views."
      >
        <div className="filter-bar">
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#9EABB8", marginBottom: 4 }}>Department</label>
            <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="All Departments" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#9EABB8", marginBottom: 4 }}>Location</label>
            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="All Locations" />
          </div>
          <Button style={{ background: "transparent", color: "#F3F6F8", border: "1px solid #33404D" }} onClick={fetchReportData}>Apply Filters</Button>
          <div style={{ flex: 1 }} />
          <Button style={{ background: "#173C2D", color: "#7DE2AE", border: "1px solid #2A5C44" }} onClick={handleExport}>
            Export CSV
          </Button>
        </div>

        <div className="tabs">
          <button className={`tab-btn ${activeTab === "utilization" ? "active" : ""}`} onClick={() => setActiveTab("utilization")}>Utilization</button>
          <button className={`tab-btn ${activeTab === "maintenance" ? "active" : ""}`} onClick={() => setActiveTab("maintenance")}>Maintenance Freq</button>
          <button className={`tab-btn ${activeTab === "allocation" ? "active" : ""}`} onClick={() => setActiveTab("allocation")}>Dept Allocation</button>
          <button className={`tab-btn ${activeTab === "heatmap" ? "active" : ""}`} onClick={() => setActiveTab("heatmap")}>Booking Heatmap</button>
          <button className={`tab-btn ${activeTab === "ghost" ? "active" : ""}`} onClick={() => setActiveTab("ghost")}>Ghost Risk Radar</button>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          {error && <div style={{ marginBottom: 16 }}><ErrorSummary message={error} /></div>}
          {loading ? (
            <Skeleton lines={8} />
          ) : (
            <>
              {activeTab === "utilization" && renderTable(
                utilizationData, 
                ["Asset ID", "Name", "Category", "Utilization %"], 
                "asset_id", 
                r => <><td style={{fontFamily: "monospace"}}>{r.asset_id}</td><td>{r.name}</td><td>{r.category}</td><td>{r.utilization_pct}%</td></>
              )}

              {activeTab === "maintenance" && renderTable(
                maintenanceData, 
                ["Asset ID", "Name", "Incidents", "Avg Downtime (Days)"], 
                "asset_id", 
                r => <><td style={{fontFamily: "monospace"}}>{r.asset_id}</td><td>{r.name}</td><td>{r.incident_count}</td><td>{r.avg_downtime_days}</td></>
              )}

              {activeTab === "allocation" && renderTable(
                allocationData, 
                ["Department", "Total Assets", "Allocated", "Available"], 
                "department", 
                r => <><td>{r.department}</td><td>{r.total_assets}</td><td>{r.allocated_assets}</td><td>{r.available_assets}</td></>
              )}

              {activeTab === "heatmap" && renderHeatmap()}

              {activeTab === "ghost" && (
                <div>
                  <div className="metric-cards">
                    <div className="metric-card">
                      <div style={{ fontSize: 13, color: "#9EABB8", fontWeight: 600, textTransform: "uppercase" }}>High-Risk Assets</div>
                      <div className="metric-val" style={{ color: "#FF9AA5" }}>{ghostData?.count || 0}</div>
                    </div>
                    <div className="metric-card">
                      <div style={{ fontSize: 13, color: "#9EABB8", fontWeight: 600, textTransform: "uppercase" }}>Acquisition Value at Risk</div>
                      <div className="metric-val">${(ghostData?.acquisition_value || 0).toLocaleString()}</div>
                    </div>
                    <div className="metric-card" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Button 
                        disabled={creatingAudit || !ghostData?.count}
                        style={{ background: "#4B2227", color: "#FF9AA5", border: "1px solid #6D2932", width: "100%", padding: 16, fontSize: 15 }}
                        onClick={handleInitiateAudit}
                      >
                        {creatingAudit ? "Initiating..." : "Initiate Audit Cycle"}
                      </Button>
                    </div>
                  </div>
                  
                  {ghostData?.assets?.length > 0 ? (
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Asset ID</th>
                          <th>Name</th>
                          <th>Last Verified</th>
                          <th>Days Unseen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ghostData.assets.map((a: any) => (
                          <tr key={a.id}>
                            <td style={{fontFamily: "monospace"}}>{a.id}</td>
                            <td>{a.name}</td>
                            <td>{a.last_verified_at ? new Date(a.last_verified_at).toLocaleDateString() : "Never"}</td>
                            <td style={{ color: "#FF9AA5", fontWeight: 700 }}>{a.days_since_verified ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <EmptyState title="No ghost assets detected." />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </ScreenShell>
    </>
  );
}
