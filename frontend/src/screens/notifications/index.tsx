import { useState, useEffect } from "react";
import { ScreenShell, Skeleton, Button, EmptyState, ErrorSummary } from "../../design-system";
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
    throw body.error;
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at?: string;
}

interface ActivityLog {
  id: string;
  actor?: string;
  actor_id?: string;
  action: string;
  entity_type: string;
  entity_identifier?: string;
  entity_id?: string;
  timestamp?: string | null;
  created_at?: string;
}

function formatDate(value: unknown): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleString()
    : "Date unavailable";
}

export function NotificationsScreen() {
  const [activeTab, setActiveTab] = useState<"notifications" | "activity">("notifications");

  // Notifications State
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifs, setLoadingNotifs] = useState(true);

  // Activity Log State
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [filterAction, setFilterAction] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (activeTab === "notifications") {
      fetchNotifications();
    } else {
      fetchActivityLog();
    }
  }, [activeTab, filterAction]);

  async function fetchNotifications() {
    setLoadingNotifs(true);
    setLoadError("");
    try {
      const data = await mFetch<{ notifications: Notification[]; unread_count: number }>("/notifications");
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch (err: any) {
      setLoadError(err?.message || "Unable to load notifications.");
    } finally {
      setLoadingNotifs(false);
    }
  }

  async function fetchActivityLog() {
    setLoadingActivity(true);
    setLoadError("");
    try {
      const qs = filterAction ? `?action=${encodeURIComponent(filterAction)}` : "";
      const data = await mFetch<{ activity: ActivityLog[] }>(`/activity-log${qs}`);
      setActivityLogs(data.activity || []);
    } catch (err: any) {
      setLoadError(err?.message || "Unable to load activity log.");
    } finally {
      setLoadingActivity(false);
    }
  }

  async function handleMarkRead(id: string) {
    try {
      await mFetch(`/notifications/${id}/read`, {
        method: "PATCH",
        body: JSON.stringify({ read: true }),
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <>
      <style>{`
        .tabs { display: flex; gap: 16px; border-bottom: 1px solid #33404D; margin-bottom: 24px; padding-bottom: 8px; }
        .tab-btn { background: none; border: none; color: #9EABB8; font-size: 15px; font-weight: 600; cursor: pointer; padding: 8px 16px; border-radius: 6px; }
        .tab-btn:hover { background: #1E262F; color: #F3F6F8; }
        .tab-btn.active { background: #19334E; color: #8FC8FF; }
        
        .notif-card { background: #141A21; border: 1px solid #33404D; border-radius: 8px; padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
        .notif-card.unread { border-left: 4px solid #5AA7FF; background: #111B27; }
        .notif-msg { font-size: 14px; color: #F3F6F8; margin-bottom: 4px; }
        .notif-time { font-size: 12px; color: #9EABB8; }
        
        .act-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .act-table th { text-align: left; padding: 12px; color: #9EABB8; font-weight: 600; text-transform: uppercase; font-size: 11px; border-bottom: 1px solid #33404D; }
        .act-table td { padding: 12px; border-bottom: 1px solid #1F2730; color: #F3F6F8; }
        .act-table tr:hover td { background: rgba(255,255,255,0.02); }
      `}</style>

      <ScreenShell
        title="Notifications and Activity"
        description="Review personal notifications and the append-only operational history."
      >
        <div className="tabs">
          <button 
            className={`tab-btn ${activeTab === "notifications" ? "active" : ""}`}
            onClick={() => setActiveTab("notifications")}
          >
            Notifications {unreadCount > 0 && <span style={{ background: "#5AA7FF", color: "#000", padding: "2px 8px", borderRadius: 99, marginLeft: 8, fontSize: 12 }}>{unreadCount}</span>}
          </button>
          <button 
            className={`tab-btn ${activeTab === "activity" ? "active" : ""}`}
            onClick={() => setActiveTab("activity")}
          >
            Activity Log
          </button>
        </div>
        {loadError && <ErrorSummary message={loadError} />}

        {activeTab === "notifications" && (
          <div>
            {loadingNotifs ? (
              <Skeleton lines={5} />
            ) : notifications.length === 0 ? (
              <EmptyState title="You're all caught up. New activity will appear here." />
            ) : (
              <div>
                {notifications.map(n => (
                  <div key={n.id} className={`notif-card ${n.read ? "" : "unread"}`}>
                    <div>
                      <div className="notif-msg">{n.message}</div>
                      <div className="notif-time">{formatDate(n.created_at)}</div>
                    </div>
                    {!n.read && (
                      <Button style={{ background: "transparent", color: "#F3F6F8", border: "1px solid #33404D" }} onClick={() => handleMarkRead(n.id)}>Mark Read</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "activity" && (
          <div className="panel" style={{ padding: 0 }}>
            <div style={{ padding: 16, borderBottom: "1px solid #33404D" }}>
              <input 
                type="text" 
                placeholder="Filter by action (e.g., ALLOCATE_ASSET)..." 
                style={{ background: "#0B0F14", border: "1px solid #33404D", color: "#F3F6F8", padding: "8px 12px", borderRadius: 6, width: 300 }}
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
              />
            </div>
            
            {loadingActivity ? (
              <div style={{ padding: 24 }}><Skeleton lines={5} /></div>
            ) : activityLogs.length === 0 ? (
              <div style={{ padding: 24 }}><EmptyState title="No activity matches your filters." /></div>
            ) : (
              <table className="act-table">
                <thead>
                  <tr>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity Type</th>
                    <th>Identifier</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {activityLogs.map(log => (
                    <tr key={log.id}>
                      <td>{log.actor || log.actor_id || "System"}</td>
                      <td><span style={{color: "#8FC8FF", background: "#19334E", padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 700}}>{log.action}</span></td>
                      <td>{log.entity_type}</td>
                      <td>{log.entity_identifier || log.entity_id || "—"}</td>
                      <td>{formatDate(log.timestamp || log.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </ScreenShell>
    </>
  );
}

