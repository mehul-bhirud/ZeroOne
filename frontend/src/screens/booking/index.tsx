import { useState, useEffect, useCallback } from "react";
import { Button, ErrorSummary, FormField, Input, ScreenShell, Skeleton, StatusChip, Toast } from "../../design-system";
import { getToken } from "../../auth/api";

// ── Types matching the API contract ──────────────────────────────────────────
interface Booking {
  id: string;
  asset_id: string;
  asset_name?: string;
  booked_by: string;
  booked_by_name?: string;
  start_time: string; // ISO timestamptz
  end_time: string;   // ISO timestamptz
  status: "upcoming" | "ongoing" | "completed" | "cancelled" | "no_show";
  reason?: string;
}

interface Asset {
  id: string;
  name: string;
  asset_tag: string;
  status: string;
  is_bookable: boolean;
}

// BOOKING_OVERLAP error detail shape from Mehul's backend
interface OverlapDetails {
  asset: Asset;
  conflicting_booking: Booking;
}

interface ApiError {
  code: string;
  message: string;
  details?: OverlapDetails | Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const API = "/api/v1";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });
}

function fmtShortTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

/** Returns a local datetime-local string offset to user's TZ for <input> default values */
function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Turn a datetime-local value into a full ISO string with timezone */
function toISOWithTimezone(localStr: string): string {
  return new Date(localStr).toISOString();
}

function durationMins(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

type BookingDisplayStatus = "Upcoming" | "Ongoing" | "Completed" | "Cancelled" | "No Show";

function formatBookingStatus(status: Booking["status"]): BookingDisplayStatus {
  const labels: Record<Booking["status"], BookingDisplayStatus> = {
    upcoming: "Upcoming",
    ongoing: "Ongoing",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No Show",
  };
  return labels[status];
}

const FIXTURE_MODE =
  import.meta.env.DEV && import.meta.env.VITE_USE_FIXTURES === "true";

// ── Mock bookable assets (replace with real fetch when backend is up) ─────────
const MOCK_ASSETS: Asset[] = [
  { id: "a-001", name: "Projector — Epson EB-S41", asset_tag: "AF-0021", status: "Available", is_bookable: true },
  { id: "a-002", name: "Conference Room A", asset_tag: "AF-0035", status: "Available", is_bookable: true },
  { id: "a-003", name: "Canon EOS R5", asset_tag: "AF-0047", status: "Available", is_bookable: true },
  { id: "a-004", name: "MacBook Pro 14\" (Shared)", asset_tag: "AF-0058", status: "Available", is_bookable: true },
  { id: "a-005", name: "Dell Precision Workstation", asset_tag: "AF-0066", status: "Under Maintenance", is_bookable: false },
];

// ── Mock timeline bookings for a selected asset ────────────────────────────────
function mockBookings(assetId: string): Booking[] {
  const now = new Date();
  const h = (offsetHours: number, d = 0) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, now.getHours() + offsetHours).toISOString();

  if (assetId === "a-001") return [
    { id: "b-001", asset_id: "a-001", booked_by: "u-1", booked_by_name: "Priya Nair",   start_time: h(-3), end_time: h(-1), status: "completed" },
    { id: "b-002", asset_id: "a-001", booked_by: "u-2", booked_by_name: "Ankit Joshi",  start_time: h(1),  end_time: h(3),  status: "upcoming" },
    { id: "b-003", asset_id: "a-001", booked_by: "u-3", booked_by_name: "Sneha Iyer",   start_time: h(4),  end_time: h(6),  status: "upcoming" },
  ];
  if (assetId === "a-002") return [
    { id: "b-004", asset_id: "a-002", booked_by: "u-4", booked_by_name: "Karan Singh",  start_time: h(-1), end_time: h(1),  status: "ongoing" },
    { id: "b-005", asset_id: "a-002", booked_by: "u-5", booked_by_name: "Rahul Mehta",  start_time: h(2),  end_time: h(4),  status: "upcoming" },
  ];
  return [];
}

// ── Main component ────────────────────────────────────────────────────────────
export function BookingScreen() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetLoadError, setAssetLoadError] = useState<string | null>(null);
  
  // Asset selection
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const selectedAsset = assets.find((a) => a.id === selectedAssetId) ?? null;

  useEffect(() => {
    async function loadAssets() {
      if (FIXTURE_MODE) {
        setAssets(MOCK_ASSETS);
        return;
      }
      setAssetLoadError(null);
      try {
        const res = await fetch(`${API}/assets`, {
          headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
          throw new Error(body?.error?.message ?? "Unable to load bookable assets. Please try again.");
        }
        const data = await res.json();
        setAssets((data.assets ?? []).filter((a: Asset) => a.is_bookable));
      } catch (err) {
        setAssetLoadError(err instanceof Error ? err.message : "Unable to load bookable assets. Please try again.");
      }
    }
    void loadAssets();
  }, []);

  // Timeline state
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Form state
  const now = new Date();
  const [startTime, setStartTime] = useState(toLocalInputValue(new Date(now.getTime() + 60 * 60 * 1000)));
  const [endTime, setEndTime]     = useState(toLocalInputValue(new Date(now.getTime() + 2 * 60 * 60 * 1000)));
  const [submitting, setSubmitting] = useState(false);

  // 409 BOOKING_OVERLAP inline guardrail
  const [overlapError, setOverlapError] = useState<OverlapDetails | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);

  // Toast for success / recoverable failures
  const [toast, setToast] = useState<string | null>(null);

  // Action pending state (checkin / cancel per booking id)
  const [actionPending, setActionPending] = useState<Record<string, boolean>>({});

  // Reschedule mode: holds the booking being rescheduled
  const [rescheduleBookingId, setRescheduleBookingId] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Fetch timeline ───────────────────────────────────────────────────────
  const fetchTimeline = useCallback(async (assetId: string) => {
    setLoadingTimeline(true);
    setOverlapError(null);
    setGenericError(null);
    try {
      const res = await fetch(`${API}/bookings?asset_id=${assetId}`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed to load bookings");
      const data = await res.json();
      setBookings(data.bookings ?? []);
    } catch {
      // Use mock data while backend is not yet wired
      setBookings(mockBookings(assetId));
    } finally {
      setLoadingTimeline(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAssetId) fetchTimeline(selectedAssetId);
    else setBookings([]);
  }, [selectedAssetId, fetchTimeline]);

  // ── POST /bookings ────────────────────────────────────────────────────────
  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAssetId) return;
    setOverlapError(null);
    setGenericError(null);
    setSubmitting(true);

    const body = {
      asset_id: selectedAssetId,
      start_time: toISOWithTimezone(startTime),
      end_time:   toISOWithTimezone(endTime),
    };

    try {
      const res = await fetch(`${API}/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 201) {
        const data = await res.json();
        // Optimistically add to timeline
        setBookings((prev) => [...prev, data.booking]);
        showToast("Booking confirmed ✓");
        if (rescheduleBookingId) setRescheduleBookingId(null);
        return;
      }

      const err: { error: ApiError } = await res.json();

      if (res.status === 409 && err.error.code === "BOOKING_OVERLAP") {
        // ── The guardrail: surface conflicting_booking inline ─────────────
        setOverlapError(err.error.details as OverlapDetails);
      } else {
        setGenericError(err.error.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setGenericError("Network error — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── POST /bookings/:id/checkin ────────────────────────────────────────────
  async function handleCheckin(bookingId: string) {
    setActionPending((p) => ({ ...p, [bookingId]: true }));
    try {
      const res = await fetch(`${API}/bookings/${bookingId}/checkin`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!res.ok) {
        const err: { error: ApiError } = await res.json();
        showToast(`Check-in failed: ${err.error.message}`);
        return;
      }
      const data = await res.json();
      setBookings((prev) => prev.map((b) => b.id === bookingId ? data.booking : b));
      showToast("Checked in successfully ✓");
    } catch {
      showToast("Network error — check-in could not be completed.");
    } finally {
      setActionPending((p) => ({ ...p, [bookingId]: false }));
    }
  }

  // ── POST /bookings/:id/cancel ─────────────────────────────────────────────
  async function handleCancel(bookingId: string) {
    setActionPending((p) => ({ ...p, [bookingId]: true }));
    try {
      const res = await fetch(`${API}/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
        },
        body: JSON.stringify({ reason: "Cancelled by user" }),
      });
      if (!res.ok) {
        const err: { error: ApiError } = await res.json();
        showToast(`Cancellation failed: ${err.error.message}`);
        return;
      }
      const data = await res.json();
      setBookings((prev) => prev.map((b) => b.id === bookingId ? data.booking : b));
      showToast("Booking cancelled.");
    } catch {
      showToast("Network error — cancellation could not be completed.");
    } finally {
      setActionPending((p) => ({ ...p, [bookingId]: false }));
    }
  }

  // ── Reschedule = cancel + new booking ────────────────────────────────────
  async function handleReschedule(bookingId: string) {
    // Step 1: cancel existing booking
    setActionPending((p) => ({ ...p, [bookingId]: true }));
    try {
      const res = await fetch(`${API}/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
        },
        body: JSON.stringify({ reason: "Rescheduling" }),
      });
      if (!res.ok) {
        const err: { error: ApiError } = await res.json();
        showToast(`Cannot reschedule: ${err.error.message}`);
        return;
      }
      const data = await res.json();
      setBookings((prev) => prev.map((b) => b.id === bookingId ? data.booking : b));
      // Step 2: open the form pre-filled so user creates new booking
      setRescheduleBookingId(bookingId);
      showToast("Booking cancelled. Pick a new time slot below.");
    } catch {
      showToast("Network error — reschedule could not be started.");
    } finally {
      setActionPending((p) => ({ ...p, [bookingId]: false }));
    }
  }

  // ── Timeline bar layout helpers ───────────────────────────────────────────
  const dayStart = new Date();
  dayStart.setHours(8, 0, 0, 0);
  const DAY_MINS = 16 * 60; // 8 AM → midnight

  function timelinePercent(iso: string) {
    const mins = (new Date(iso).getTime() - dayStart.getTime()) / 60000;
    return Math.max(0, Math.min(100, (mins / DAY_MINS) * 100));
  }

  function timelineWidth(start: string, end: string) {
    const mins = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
    return Math.max(0.5, Math.min(100, (mins / DAY_MINS) * 100));
  }

  const nowPercent = timelinePercent(new Date().toISOString());

  return (
    <>
      <style>{`
        /* ── Booking screen layout ─────────────────────────────── */
        .booking-layout {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 1050px) { .booking-layout { grid-template-columns: 1fr; } }

        /* ── Asset picker ──────────────────────────────────────── */
        .asset-picker {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 10px;
          margin-bottom: 28px;
        }
        .asset-tile {
          border: 1px solid #33404D;
          border-radius: 12px;
          background: #141A21;
          padding: 14px 16px;
          cursor: pointer;
          transition: border-color .15s, background .15s;
          text-align: left;
        }
        .asset-tile:hover:not(:disabled) { border-color: #5AA7FF; background: #19334E22; }
        .asset-tile--selected { border-color: #5AA7FF; background: #19334E44; }
        .asset-tile:disabled  { opacity: .45; cursor: not-allowed; }
        .asset-tile-name { font-size: 13px; font-weight: 700; color: #F3F6F8; margin-bottom: 4px; }
        .asset-tile-tag  { font-size: 11px; color: #9EABB8; }

        /* ── Timeline ──────────────────────────────────────────── */
        .timeline-section { margin-bottom: 28px; }
        .section-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: #5AA7FF;
          margin: 0 0 12px;
        }
        .timeline-track {
          position: relative;
          height: 56px;
          background: #141A21;
          border: 1px solid #33404D;
          border-radius: 10px;
          overflow: hidden;
        }
        .timeline-now {
          position: absolute;
          top: 0; bottom: 0;
          width: 2px;
          background: #5AA7FF;
          opacity: .8;
          z-index: 2;
        }
        .timeline-now::after {
          content: "now";
          position: absolute;
          top: 4px;
          left: 4px;
          font-size: 9px;
          color: #5AA7FF;
          font-weight: 700;
          letter-spacing: .06em;
        }
        .timeline-block {
          position: absolute;
          top: 8px; bottom: 8px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          padding: 0 8px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          cursor: default;
        }
        .timeline-block--Upcoming   { background: #19334E; color: #8FC8FF; }
        .timeline-block--Ongoing    { background: #173C2D; color: #7DE2AE; }
        .timeline-block--Completed  { background: #29323B; color: #C6D0D8; }
        .timeline-block--Cancelled  { background: #29323B; color: #C6D0D8; opacity: .5; }
        .timeline-block--No\ Show   { background: #4B2227; color: #FF9AA5; }
        .timeline-labels {
          display: flex;
          justify-content: space-between;
          margin-top: 4px;
        }
        .timeline-label { font-size: 10px; color: #9EABB8; }

        /* ── Booking list ──────────────────────────────────────── */
        .booking-list { display: flex; flex-direction: column; gap: 10px; }
        .booking-card {
          border: 1px solid #33404D;
          border-radius: 12px;
          background: #141A21;
          padding: 16px;
        }
        .booking-card--Ongoing  { border-color: #2A5C44; }
        .booking-card--Upcoming { border-color: #1D3F66; }
        .booking-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }
        .booking-card-times { font-size: 13px; font-weight: 700; color: #F3F6F8; }
        .booking-card-meta  { font-size: 12px; color: #9EABB8; margin-top: 3px; }
        .booking-card-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }

        .action-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 1px solid transparent;
          border-radius: 8px;
          padding: 6px 13px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: filter .12s;
        }
        .action-btn:disabled { opacity: .45; cursor: not-allowed; }
        .action-btn:not(:disabled):hover { filter: brightness(1.15); }
        .action-btn--checkin    { background: #173C2D; color: #7DE2AE; border-color: #2A5C44; }
        .action-btn--cancel     { background: #4B2227; color: #FF9AA5; border-color: #6B2E35; }
        .action-btn--reschedule { background: #493714; color: #FFD47A; border-color: #6B521F; }

        /* ── Booking form panel ────────────────────────────────── */
        .booking-form-panel {
          border: 1px solid #33404D;
          border-radius: 14px;
          background: #141A21;
          padding: 24px;
          position: sticky;
          top: 24px;
        }
        .form-panel-title {
          font-size: 16px;
          font-weight: 700;
          color: #F3F6F8;
          margin: 0 0 6px;
        }
        .form-panel-sub {
          font-size: 12px;
          color: #9EABB8;
          margin: 0 0 20px;
        }
        .reschedule-banner {
          background: #493714;
          border: 1px solid #6B521F;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 12px;
          color: #FFD47A;
          margin-bottom: 16px;
        }

        /* ── 409 Overlap guardrail ─────────────────────────────── */
        .overlap-guardrail {
          background: #1F1118;
          border: 1.5px solid #6B2E35;
          border-radius: 12px;
          padding: 16px;
          margin-top: 16px;
        }
        .overlap-guardrail-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
          color: #FF9AA5;
          margin-bottom: 10px;
        }
        .overlap-guardrail-icon {
          width: 22px; height: 22px;
          background: #4B2227;
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px;
        }
        .overlap-slot {
          background: #141A21;
          border: 1px solid #33404D;
          border-radius: 8px;
          padding: 12px 14px;
        }
        .overlap-slot-label { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #9EABB8; margin-bottom: 4px; }
        .overlap-slot-time  { font-size: 14px; font-weight: 700; color: #FF9AA5; margin-bottom: 2px; }
        .overlap-slot-meta  { font-size: 12px; color: #9EABB8; }
        .overlap-hint {
          margin-top: 10px;
          font-size: 12px;
          color: #9EABB8;
        }
        .overlap-hint strong { color: #FFD47A; }

        /* ── Generic error ─────────────────────────────────────── */
        .field-error {
          background: #351B20;
          border-left: 3px solid #F87171;
          border-radius: 0 6px 6px 0;
          padding: 10px 14px;
          font-size: 12px;
          color: #FF9AA5;
          margin-top: 12px;
        }

        /* ── Empty prompt ──────────────────────────────────────── */
        .empty-prompt {
          border: 1px dashed #33404D;
          border-radius: 12px;
          padding: 40px 24px;
          text-align: center;
          color: #9EABB8;
          font-size: 14px;
        }
        .empty-prompt span { display: block; font-size: 28px; margin-bottom: 10px; opacity: .4; }
      `}</style>

      <ScreenShell
        title="Resource Booking"
        description="Find an available resource and reserve a non-overlapping time slot."
      >
        {/* ── Asset picker ─────────────────────────────────────── */}
        <section aria-label="Select a resource" style={{ marginBottom: 28 }}>
          <p className="section-title" style={{ marginBottom: 12 }}>Select a Resource</p>
          {assetLoadError && <ErrorSummary message={assetLoadError} />}
          <div className="asset-picker">
            {assets.map((asset) => (
              <button
                key={asset.id}
                id={`asset-tile-${asset.id}`}
                className={`asset-tile${selectedAssetId === asset.id ? " asset-tile--selected" : ""}`}
                disabled={!asset.is_bookable}
                onClick={() => {
                  setSelectedAssetId(asset.id);
                  setOverlapError(null);
                  setGenericError(null);
                  setRescheduleBookingId(null);
                }}
                title={!asset.is_bookable ? "This asset is not bookable" : undefined}
              >
                <div className="asset-tile-name">{asset.name}</div>
                <div className="asset-tile-tag">{asset.asset_tag}</div>
                <div style={{ marginTop: 6 }}>
                  <StatusChip status={asset.status as "Available" | "Under Maintenance"} />
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Main two-column layout ─────────────────────────────── */}
        <div className="booking-layout">
          {/* LEFT — Timeline + booking list */}
          <div>
            {!selectedAsset ? (
              <div className="empty-prompt">
                <span>◈</span>
                Select a resource above to view its booking timeline.
              </div>
            ) : loadingTimeline ? (
              <Skeleton lines={4} />
            ) : (
              <>
                {/* ── Timeline bar ────────────────────────────────── */}
                <section className="timeline-section" aria-label="Booking timeline">
                  <p className="section-title">Today's Timeline — {selectedAsset.name}</p>
                  <div className="timeline-track" role="img" aria-label="Visual timeline of today's bookings">
                    {/* Now indicator */}
                    <div className="timeline-now" style={{ left: `${nowPercent}%` }} aria-hidden="true" />
                    {/* Booking blocks */}
                    {bookings
                      .filter((b) => b.status !== "cancelled")
                      .map((b) => (
                        <div
                          key={b.id}
                          className={`timeline-block timeline-block--${b.status}`}
                          style={{
                            left:  `${timelinePercent(b.start_time)}%`,
                            width: `${timelineWidth(b.start_time, b.end_time)}%`,
                          }}
                          title={`${b.booked_by_name ?? "User"}: ${fmtShortTime(b.start_time)} – ${fmtShortTime(b.end_time)}`}
                        >
                          {b.booked_by_name?.split(" ")[0]}
                        </div>
                      ))}
                  </div>
                  <div className="timeline-labels" aria-hidden="true">
                    <span className="timeline-label">8:00 AM</span>
                    <span className="timeline-label">12:00 PM</span>
                    <span className="timeline-label">4:00 PM</span>
                    <span className="timeline-label">8:00 PM</span>
                    <span className="timeline-label">12:00 AM</span>
                  </div>
                </section>

                {/* ── Booking list ─────────────────────────────────── */}
                <section aria-label="Booking list">
                  <p className="section-title">All Bookings for {selectedAsset.name}</p>
                  {bookings.length === 0 ? (
                    <div className="empty-prompt">
                      <span>◈</span>
                      No bookings yet. Reserve a slot using the form.
                    </div>
                  ) : (
                    <div className="booking-list">
                      {bookings.map((b) => {
                        const isPending = actionPending[b.id];
                        const canCheckin = b.status === "upcoming" || b.status === "ongoing";
                        const canCancel = b.status === "upcoming" || b.status === "ongoing";
                        const canReschedule = b.status === "upcoming";

                        return (
                          <article key={b.id} className={`booking-card booking-card--${b.status}`}>
                            <div className="booking-card-header">
                              <div>
                                <div className="booking-card-times">
                                  {fmtShortTime(b.start_time)} – {fmtShortTime(b.end_time)}
                                  <span style={{ fontSize: 11, color: "#9EABB8", fontWeight: 400, marginLeft: 8 }}>
                                    ({durationMins(b.start_time, b.end_time)} min)
                                  </span>
                                </div>
                                <div className="booking-card-meta">
                                  {fmtTime(b.start_time).split(",")[0]} · Booked by {b.booked_by_name ?? "Unknown"}
                                </div>
                              </div>
                              <StatusChip status={formatBookingStatus(b.status)} />
                            </div>

                            {(canCheckin || canCancel || canReschedule) && (
                              <div className="booking-card-actions">
                                {canCheckin && (
                                  <button
                                    id={`checkin-${b.id}`}
                                    className="action-btn action-btn--checkin"
                                    disabled={isPending}
                                    onClick={() => handleCheckin(b.id)}
                                  >
                                    ✓ Check In
                                  </button>
                                )}
                                {canReschedule && (
                                  <button
                                    id={`reschedule-${b.id}`}
                                    className="action-btn action-btn--reschedule"
                                    disabled={isPending}
                                    onClick={() => handleReschedule(b.id)}
                                  >
                                    ↻ Reschedule
                                  </button>
                                )}
                                {canCancel && (
                                  <button
                                    id={`cancel-${b.id}`}
                                    className="action-btn action-btn--cancel"
                                    disabled={isPending}
                                    onClick={() => handleCancel(b.id)}
                                  >
                                    ✕ Cancel
                                  </button>
                                )}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>

          {/* RIGHT — Booking form */}
          <div className="booking-form-panel">
            <p className="form-panel-title">
              {rescheduleBookingId ? "Pick a New Time Slot" : "New Booking"}
            </p>
            <p className="form-panel-sub">
              {selectedAsset
                ? `Reserve ${selectedAsset.name} (${selectedAsset.asset_tag})`
                : "Select a resource first."}
            </p>

            {rescheduleBookingId && (
              <div className="reschedule-banner">
                ↻ Rescheduling — the previous booking was cancelled. Choose your new slot and confirm.
              </div>
            )}

            <form id="booking-form" onSubmit={handleBook} noValidate>
              <FormField label="Start Time">
                <Input
                  id="booking-start-time"
                  type="datetime-local"
                  required
                  disabled={!selectedAsset || submitting}
                  value={startTime}
                  min={toLocalInputValue(new Date())}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    setOverlapError(null);
                    setGenericError(null);
                  }}
                />
              </FormField>

              <FormField label="End Time">
                <Input
                  id="booking-end-time"
                  type="datetime-local"
                  required
                  disabled={!selectedAsset || submitting}
                  value={endTime}
                  min={startTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setOverlapError(null);
                    setGenericError(null);
                  }}
                />
              </FormField>

              <Button
                id="booking-submit"
                type="submit"
                disabled={!selectedAsset || submitting || !startTime || !endTime}
                style={{ width: "100%", marginTop: 8 }}
              >
                {submitting ? "Confirming…" : rescheduleBookingId ? "Confirm New Slot" : "Book Resource"}
              </Button>

              {/* ── 409 BOOKING_OVERLAP guardrail ─────────────────────
                  Extracts conflicting_booking from error.details and
                  renders the exact conflicting time directly inline.
              ────────────────────────────────────────────────────────── */}
              {overlapError && (
                <div className="overlap-guardrail" role="alert" aria-live="assertive">
                  <div className="overlap-guardrail-title">
                    <span className="overlap-guardrail-icon" aria-hidden="true">⊘</span>
                    Time slot already taken
                  </div>
                  <div className="overlap-slot">
                    <div className="overlap-slot-label">Conflicting Booking</div>
                    <div className="overlap-slot-time">
                      {fmtShortTime(overlapError.conflicting_booking.start_time)}
                      {" "}–{" "}
                      {fmtShortTime(overlapError.conflicting_booking.end_time)}
                    </div>
                    <div className="overlap-slot-meta">
                      {fmtTime(overlapError.conflicting_booking.start_time).split(",")[0]}
                      {" · "}
                      <StatusChip status={formatBookingStatus(overlapError.conflicting_booking.status)} />
                    </div>
                  </div>
                  <p className="overlap-hint">
                    Choose a slot before{" "}
                    <strong>{fmtShortTime(overlapError.conflicting_booking.start_time)}</strong>
                    {" "}or after{" "}
                    <strong>{fmtShortTime(overlapError.conflicting_booking.end_time)}</strong>.
                    Back-to-back bookings are allowed.
                  </p>
                </div>
              )}

              {/* Generic non-overlap errors */}
              {genericError && (
                <div className="field-error" role="alert">
                  {genericError}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Toast */}
        {toast && <Toast message={toast} />}
      </ScreenShell>
    </>
  );
}
