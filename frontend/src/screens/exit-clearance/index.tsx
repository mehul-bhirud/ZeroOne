import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, EmptyState, ErrorSummary, FormField, Input, ScreenShell, StatusChip, Toast } from "../../design-system";
import { getToken } from "../../auth/api";
import { useAuth } from "../../auth/AuthContext";

const API_BASE = "/api/v1";

function formatDate(value: unknown): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleString()
    : "Date unavailable";
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
    const body = await res.json().catch(() => ({
      error: { code: "UNKNOWN", message: "An unexpected error occurred." },
    }));
    throw body.error;
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClearanceData {
  employee: any;
  active_allocations: any[];
  upcoming_bookings: any[];
  checklist?: any[];
}

export function ExitClearanceScreen() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialEmpId = searchParams.get("employee_id") || "";
  
  const [employeeId, setEmployeeId] = useState(initialEmpId);
  const [deactivating, setDeactivating] = useState(false);
  const [error, setError] = useState<{ message: string; details?: any } | null>(null);
  const [clearanceData, setClearanceData] = useState<ClearanceData | null>(null);
  const [success, setSuccess] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const navigate = useNavigate();

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleDeactivate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!employeeId.trim()) return;
    
    setDeactivating(true);
    setError(null);
    setClearanceData(null);
    setSuccess(false);

    try {
      await mFetch(`/employees/${employeeId.trim()}/deactivate`, {
        method: "PATCH",
        body: JSON.stringify({ reason: "Exit clearance flow" }),
      });
      setSuccess(true);
      showToast("Employee deactivated successfully.");
    } catch (err: any) {
      if (err.code === "EXIT_CLEARANCE_REQUIRED" && err.details) {
        setClearanceData(err.details);
      } else {
        setError(err);
      }
    } finally {
      setDeactivating(false);
    }
  }

  async function handleReturnAllocation(allocationId: string) {
    try {
      await mFetch(`/allocations/${allocationId}/return`, {
        method: "POST",
        body: JSON.stringify({ return_condition_notes: "Exit clearance forced return", action: "approve" }),
      });
      showToast("Allocation returned.");
      // Optimistically update local state to hide it
      if (clearanceData) {
        setClearanceData({
          ...clearanceData,
          active_allocations: clearanceData.active_allocations.filter((a: any) => a.id !== allocationId),
          checklist: clearanceData.checklist?.filter((item: any) => item.id !== allocationId),
        });
      }
    } catch (err: any) {
      alert(err.message || "Failed to return allocation");
    }
  }

  async function handleCancelBooking(bookingId: string) {
    try {
      await mFetch(`/bookings/${bookingId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "Exit clearance forced cancellation" }),
      });
      showToast("Booking cancelled.");
      if (clearanceData) {
        setClearanceData({
          ...clearanceData,
          upcoming_bookings: clearanceData.upcoming_bookings.filter((b: any) => b.id !== bookingId),
          checklist: clearanceData.checklist?.filter((item: any) => item.id !== bookingId),
        });
      }
    } catch (err: any) {
      alert(err.message || "Failed to cancel booking");
    }
  }

  if (user?.role !== "admin") {
    return <ScreenShell title="Exit Clearance" description="Resolve every active allocation and upcoming booking before deactivating an employee."><ErrorSummary message="Only Admin users can initiate employee deactivation." /></ScreenShell>;
  }

  return (
    <>
      <style>{`
        .clearance-layout { max-width: 800px; margin: 0 auto; }
        .blocker-section { margin-top: 32px; border-top: 1px solid #33404D; padding-top: 32px; }
        .blocker-item { display: flex; justify-content: space-between; align-items: center; padding: 16px; background: linear-gradient(135deg, rgba(27, 49, 74, .7), rgba(12, 27, 43, .6)); border: 1px solid rgba(174, 213, 255, .18); border-radius: 10px; margin-bottom: 12px; box-shadow: 0 10px 25px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.04); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        .blocker-title { font-weight: 600; color: #F3F6F8; margin-bottom: 4px; }
        .blocker-meta { font-size: 13px; color: #9EABB8; }
      `}</style>
      
      <ScreenShell
        title="Exit Clearance"
        description="Resolve every active allocation and upcoming booking before deactivating an employee."
      >
        <div className="clearance-layout">
          <div className="panel" style={{ padding: 32 }}>
            <form onSubmit={handleDeactivate} style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <FormField label="Employee ID">
                  <Input 
                    value={employeeId}
                    onChange={e => setEmployeeId(e.target.value)}
                    placeholder="e.g. usr-12345"
                    required
                  />
                </FormField>
              </div>
              <Button type="submit" disabled={deactivating}>
                {deactivating ? "Checking..." : "Deactivate Employee"}
              </Button>
            </form>

            {error && (
              <div style={{ marginTop: 24 }}>
                <ErrorSummary message={error.message || "An error occurred."} />
              </div>
            )}

            {success && (
              <div style={{ marginTop: 24, padding: 24, background: "#173C2D", borderRadius: 8, border: "1px solid #2A5C44", textAlign: "center" }}>
                <div style={{ color: "#7DE2AE", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Deactivation Complete</div>
                <div style={{ color: "#F3F6F8", fontSize: 14 }}>The employee account has been securely deactivated.</div>
              </div>
            )}

            {clearanceData && (
              <div className="blocker-section">
                <div style={{ marginBottom: 24, padding: 16, background: "#4B2227", borderRadius: 8, border: "1px solid #6D2932" }}>
                  <h3 style={{ margin: "0 0 8px", color: "#FF9AA5", fontSize: 16 }}>Clearance Blocked</h3>
                  <p style={{ margin: 0, color: "#F3F6F8", fontSize: 14 }}>
                    Employee {clearanceData.employee?.name || employeeId} has active items that must be resolved.
                  </p>
                </div>

                {clearanceData.active_allocations?.length > 0 && (
                  <div style={{ marginBottom: 32 }}>
                    <h4 style={{ margin: "0 0 16px", color: "#F3F6F8", fontSize: 15 }}>Active Custody</h4>
                    {clearanceData.active_allocations.map((alloc: any) => (
                      <div key={alloc.id} className="blocker-item">
                        <div>
                          <div className="blocker-title">{alloc.asset?.name || alloc.asset_id}</div>
                          <div className="blocker-meta">Allocated since: {formatDate(alloc.allocated_at || alloc.assigned_at)}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Button style={{ background: "transparent", color: "#F3F6F8", border: "1px solid #33404D" }} onClick={() => navigate("/transfer-requests")}>Transfer</Button>
                          <Button onClick={() => handleReturnAllocation(alloc.id)}>Return Asset</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {clearanceData.upcoming_bookings?.length > 0 && (
                  <div style={{ marginBottom: 32 }}>
                    <h4 style={{ margin: "0 0 16px", color: "#F3F6F8", fontSize: 15 }}>Upcoming Bookings</h4>
                    {clearanceData.upcoming_bookings.map((booking: any) => (
                      <div key={booking.id} className="blocker-item">
                        <div>
                          <div className="blocker-title">{booking.asset?.name || booking.asset_id}</div>
                          <div className="blocker-meta">
                            {formatDate(booking.start_time)} - {formatDate(booking.end_time)}
                          </div>
                        </div>
                        <Button style={{ background: "#4B2227", color: "#FF9AA5", border: "1px solid #6D2932" }} onClick={() => handleCancelBooking(booking.id)}>Cancel Booking</Button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ borderTop: "1px solid #33404D", paddingTop: 24, display: "flex", justifyContent: "flex-end" }}>
                  <Button 
                    onClick={() => handleDeactivate()} 
                    disabled={deactivating || clearanceData.active_allocations?.length > 0 || clearanceData.upcoming_bookings?.length > 0}
                  >
                    Retry Deactivation
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </ScreenShell>
      {toast && <Toast message={toast} />}
    </>
  );
}

