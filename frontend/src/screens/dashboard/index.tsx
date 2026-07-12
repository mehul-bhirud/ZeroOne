import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button, ErrorSummary, ScreenShell, Skeleton, StatusChip } from "../../design-system";
import { getToken } from "../../auth/api";
import { useAuth } from "../../auth/AuthContext";
import { FeatureNavigation } from "./FeatureNavigation";

// ── Database-backed KPI data ─────────────────────────────────────────────────
type Kpi = {
  available_assets: number;
  allocated_assets: number;
  maintenance_today: number;
  active_bookings: number;
  pending_transfers: number;
  upcoming_returns: number;
  overdue_returns: number;
  ghost_risk: number;
};

const emptyKpi: Kpi = {
  available_assets: 0,
  allocated_assets: 0,
  maintenance_today: 0,
  active_bookings: 0,
  pending_transfers: 0,
  upcoming_returns: 0,
  overdue_returns: 0,
  ghost_risk: 0,
};

// ── KPI card config ───────────────────────────────────────────────────────────
interface KpiConfig {
  key: keyof Kpi;
  label: string;
  icon: string;
  tone: "positive" | "info" | "warning" | "danger" | "neutral";
  note: string;
}

const kpiCards: KpiConfig[] = [
  { key: "available_assets",  label: "Available Assets",   icon: "\u2726",  tone: "positive", note: "Ready to allocate" },
  { key: "allocated_assets",  label: "Allocated Assets",   icon: "\u2B21",  tone: "info",     note: "Currently in use" },
  { key: "maintenance_today", label: "Maintenance Today",  icon: "\u2699",  tone: "warning",  note: "Scheduled jobs" },
  { key: "active_bookings",   label: "Active Bookings",    icon: "\u25C8",  tone: "info",     note: "Live reservations" },
  { key: "pending_transfers", label: "Pending Transfers",  icon: "\u21C4",  tone: "warning",  note: "Awaiting approval" },
  { key: "upcoming_returns",  label: "Upcoming Returns",   icon: "\u21A9",  tone: "neutral",  note: "Due within 7 days" },
  { key: "overdue_returns",   label: "Overdue Returns",    icon: "\u26A0",  tone: "danger",   note: "Immediate action" },
  { key: "ghost_risk",        label: "Ghost Risk",         icon: "\u25C9",  tone: "danger",   note: "Unverified custody" },
];

// Tone -> CSS class mapping (uses Sarthak's status-chip tokens as surface colours)
const tonePanel: Record<KpiConfig["tone"], string> = {
  positive: "kpi-card--positive",
  info:     "kpi-card--info",
  warning:  "kpi-card--warning",
  danger:   "kpi-card--danger",
  neutral:  "kpi-card--neutral",
};

// ── Component ─────────────────────────────────────────────────────────────────
export function DashboardScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [kpi, setKpi] = useState<Kpi>(emptyKpi);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getToken();
    fetch("/api/v1/dashboard/kpis", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error?.message ?? "Unable to load dashboard KPIs.");
        }
        return response.json() as Promise<Kpi>;
      })
      .then(setKpi)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      {/* Inline styles — scoped to dashboard, re-uses design-system tokens */}
      <style>{`
        /* ── KPI grid ──────────────────────────────────────────── */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 32px;
        }
        @media (max-width: 1100px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }

        .kpi-card {
          border: 1px solid #33404D;
          border-radius: 14px;
          background: #141A21;
          padding: 22px 20px 18px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          position: relative;
          overflow: hidden;
          transition: transform .15s ease, box-shadow .15s ease;
        }
        .kpi-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.35); }

        /* Tone accent strip (top border) */
        .kpi-card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 3px;
          border-radius: 14px 14px 0 0;
        }
        .kpi-card--positive::before { background: #7DE2AE; }
        .kpi-card--info::before     { background: #8FC8FF; }
        .kpi-card--warning::before  { background: #FFD47A; }
        .kpi-card--danger::before   { background: #FF9AA5; }
        .kpi-card--neutral::before  { background: #C6D0D8; }

        /* Icon bubble */
        .kpi-icon {
          width: 36px; height: 36px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 17px;
          margin-bottom: 6px;
        }
        .kpi-card--positive .kpi-icon { background: #173C2D; color: #7DE2AE; }
        .kpi-card--info     .kpi-icon { background: #19334E; color: #8FC8FF; }
        .kpi-card--warning  .kpi-icon { background: #493714; color: #FFD47A; }
        .kpi-card--danger   .kpi-icon { background: #4B2227; color: #FF9AA5; }
        .kpi-card--neutral  .kpi-icon { background: #29323B; color: #C6D0D8; }

        .kpi-value {
          font-size: 40px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: -.02em;
          color: #F3F6F8;
        }
        .kpi-label  { font-size: 13px; font-weight: 700; color: #F3F6F8; }
        .kpi-note   { font-size: 12px; color: #9EABB8; margin-top: 2px; }

        /* ── Overdue section ───────────────────────────────────── */
        .overdue-section {
          border: 1px solid #4B2227;
          border-radius: 14px;
          background: #1A1116;
          padding: 24px;
          margin-bottom: 32px;
        }
        .overdue-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          gap: 12px;
        }
        .overdue-title-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .overdue-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px; height: 28px;
          border-radius: 8px;
          background: #4B2227;
          color: #FF9AA5;
          font-size: 15px;
        }
        .overdue-heading {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: #FF9AA5;
        }
        .overdue-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13.5px;
        }
        .overdue-table th {
          text-align: left;
          padding: 0 12px 10px 0;
          color: #9EABB8;
          font-weight: 600;
          letter-spacing: .04em;
          text-transform: uppercase;
          font-size: 11px;
          border-bottom: 1px solid #33404D;
        }
        .overdue-table td {
          padding: 12px 12px 12px 0;
          border-bottom: 1px solid #1F2730;
          vertical-align: middle;
        }
        .overdue-table tr:last-child td { border-bottom: none; }
        .overdue-table tr:hover td { background: rgba(75,34,39,.18); }
        .asset-name  { font-weight: 600; color: #F3F6F8; }
        .asset-id    { font-size: 11px; color: #9EABB8; margin-top: 2px; }
        .days-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
        }
        .days-pill--critical { background: #4B2227; color: #FF9AA5; }
        .days-pill--warn     { background: #493714; color: #FFD47A; }
        .days-pill--mild     { background: #29323B; color: #C6D0D8; }

        /* ── Quick actions ─────────────────────────────────────── */
        .quick-actions-section { margin-bottom: 40px; }
        .quick-actions-title {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: #5AA7FF;
          margin: 0 0 14px;
        }
        .quick-actions-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .qa-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 0;
          border-radius: 10px;
          padding: 11px 20px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: filter .15s ease, transform .12s ease;
        }
        .qa-btn:hover  { filter: brightness(1.12); transform: translateY(-1px); }
        .qa-btn:active { transform: translateY(0); filter: brightness(.95); }
        .qa-btn--primary  { background: #5AA7FF; color: #07111B; }
        .qa-btn--positive { background: #173C2D; color: #7DE2AE; border: 1px solid #2A5C44; }
        .qa-btn--warning  { background: #493714; color: #FFD47A; border: 1px solid #6B521F; }

        /* ── Feature nav ───────────────────────────────────────── */
        .feature-nav nav {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 32px;
        }
        .feature-nav a {
          display: inline-block;
          padding: 7px 16px;
          border-radius: 8px;
          background: #1E262F;
          color: #9EABB8;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          border: 1px solid #33404D;
          transition: background .15s, color .15s;
        }
        .feature-nav a:hover { background: #29323B; color: #F3F6F8; }
      `}</style>

      <ScreenShell
        title="Operations Dashboard"
        description="Monitor custody, reservations, maintenance, returns, and ghost risk."
      >
        {/* Feature nav */}
        <div className="feature-nav">
          <FeatureNavigation role={user?.role ?? "employee"} />
        </div>

        {error && <ErrorSummary message={error} />}
        {loading && <Skeleton lines={4} />}

        {/* ── Quick Actions ─────────────────────────────────────── */}
        <section className="quick-actions-section" aria-label="Quick actions">
          <h2 className="quick-actions-title">Quick Actions</h2>
          <div className="quick-actions-row">
            <button
              id="qa-register-asset"
              className="qa-btn qa-btn--primary"
              onClick={() => navigate("/assets")}
            >
              <span>+</span> Register Asset
            </button>
            <button
              id="qa-book-resource"
              className="qa-btn qa-btn--positive"
              onClick={() => navigate("/bookings")}
            >
              <span>&#x25C8;</span> Book Resource
            </button>
            <button
              id="qa-raise-maintenance"
              className="qa-btn qa-btn--warning"
              onClick={() => navigate("/maintenance")}
            >
              <span>&#x2699;</span> Raise Maintenance Request
            </button>
          </div>
        </section>

        {/* ── KPI Cards ─────────────────────────────────────────── */}
        <section aria-label="KPI summary" className="kpi-grid">
          {kpiCards.map(({ key, label, icon, tone, note }) => (
            <div key={key} className={`kpi-card ${tonePanel[tone]}`}>
              <div className="kpi-icon">{icon}</div>
              <div className="kpi-value">{kpi[key]}</div>
              <div className="kpi-label">{label}</div>
              <div className="kpi-note">{note}</div>
              {/* StatusChip re-uses Sarthak's chip classes */}
              <div style={{ marginTop: 8 }}>
                <StatusChip
                  status={
                    tone === "positive" ? "Available"
                    : tone === "info"     ? "Ongoing"
                    : tone === "warning"  ? "Pending"
                    : tone === "danger"   ? "Lost"
                    : "Completed"
                  }
                />
              </div>
            </div>
          ))}
        </section>

        {/* ── Overdue Returns ───────────────────────────────────── */}
        <section className="overdue-section" aria-label="Overdue returns">
          <div className="overdue-header">
            <div className="overdue-title-row">
              <span className="overdue-badge" aria-hidden="true">&#x26A0;</span>
              <h2 className="overdue-heading">
                Overdue Returns &mdash; {kpi.overdue_returns} assets need immediate action
              </h2>
            </div>
            {/* Link to Allocation Action screen */}
            <Button
              id="overdue-allocation-action"
              onClick={() => navigate("/allocations")}
              style={{ background: "#FF9AA5", color: "#2C0A10", flexShrink: 0 }}
            >
              Allocation Action &rarr;
            </Button>
          </div>

          <p style={{ color: "#C6D0D8", margin: 0 }}>
            Open Allocation Action to review the current custody records and complete returns.
          </p>
        </section>
      </ScreenShell>
    </>
  );
}
