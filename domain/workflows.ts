import { StateMachine } from "./state-machine";

export type AssetState = "available" | "allocated" | "reserved" | "under_maintenance" | "lost" | "retired" | "disposed";
export type MaintenanceState = "pending" | "approved" | "rejected" | "technician_assigned" | "in_progress" | "resolved";
export type BookingState = "upcoming" | "ongoing" | "completed" | "cancelled" | "no_show";
export type TransferState = "pending" | "approved" | "rejected";
export type AuditState = "draft" | "active" | "closed";

export const assetStateMachine = new StateMachine<AssetState>("Asset", {
  available: ["allocated", "reserved", "under_maintenance", "lost", "retired", "disposed"],
  allocated: ["available", "under_maintenance", "lost", "retired"],
  reserved: ["available", "allocated", "under_maintenance"],
  under_maintenance: ["available", "retired", "disposed"],
  lost: ["available", "retired", "disposed"],
  retired: ["disposed"],
  disposed: [],
});

export const maintenanceStateMachine = new StateMachine<MaintenanceState>("MaintenanceRequest", {
  pending: ["approved", "rejected"],
  approved: ["technician_assigned"],
  rejected: [],
  technician_assigned: ["in_progress"],
  in_progress: ["resolved"],
  resolved: [],
});

export const bookingStateMachine = new StateMachine<BookingState>("Booking", {
  upcoming: ["ongoing", "cancelled", "no_show"],
  ongoing: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
});

export const transferStateMachine = new StateMachine<TransferState>("TransferRequest", {
  pending: ["approved", "rejected"],
  approved: [],
  rejected: [],
});

export const auditStateMachine = new StateMachine<AuditState>("AuditCycle", {
  draft: ["active"],
  active: ["closed"],
  closed: [],
});

