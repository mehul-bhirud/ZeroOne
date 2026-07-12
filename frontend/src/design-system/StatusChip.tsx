export const statusTone = {
  Available: "positive",
  Allocated: "info",
  Reserved: "warning",
  "Under Maintenance": "warning",
  Lost: "danger",
  Retired: "neutral",
  Disposed: "neutral",
  Pending: "warning",
  Approved: "positive",
  Rejected: "danger",
  "Technician Assigned": "info",
  "In Progress": "info",
  Resolved: "positive",
  Upcoming: "info",
  Ongoing: "positive",
  Completed: "neutral",
  Cancelled: "neutral",
  "No Show": "danger",
} as const;

export type Status = keyof typeof statusTone;

export function StatusChip({ status }: { status: Status }) {
  return <span className={`status-chip status-chip--${statusTone[status]}`}>{status}</span>;
}

