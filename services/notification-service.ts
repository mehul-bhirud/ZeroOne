import { DatabaseClient } from "./db";

export async function triggerNotification(
  db: DatabaseClient,
  userId: string,
  type: string,
  message: string
): Promise<void> {
  await db.query(`
    INSERT INTO notifications (id, user_id, type, message, read)
    VALUES (gen_random_uuid(), $1, $2, $3, false)
  `, [userId, type, message]);
}

export const NotificationTriggers = {
  allocation: async (db: DatabaseClient, userId: string, assetTag: string, action: string) => {
    await triggerNotification(db, userId, "allocation", `Asset ${assetTag} allocation has been ${action}.`);
  },
  transfer: async (db: DatabaseClient, userId: string, assetTag: string, action: string) => {
    await triggerNotification(db, userId, "transfer", `Transfer request for Asset ${assetTag} has been ${action}.`);
  },
  booking: async (db: DatabaseClient, userId: string, assetTag: string, action: string) => {
    await triggerNotification(db, userId, "booking", `Booking for Asset ${assetTag} has been ${action}.`);
  },
  maintenance: async (db: DatabaseClient, userId: string, assetTag: string, action: string) => {
    await triggerNotification(db, userId, "maintenance", `Maintenance for Asset ${assetTag} has been ${action}.`);
  },
  overdueReturn: async (db: DatabaseClient, userId: string, assetTag: string) => {
    await triggerNotification(db, userId, "overdue_return", `Return for Asset ${assetTag} is overdue.`);
  },
  auditDiscrepancy: async (db: DatabaseClient, userId: string, cycleId: string) => {
    await triggerNotification(db, userId, "audit_discrepancy", `Audit cycle ${cycleId} closed with discrepancies.`);
  },
  exitClearance: async (db: DatabaseClient, userId: string) => {
    await triggerNotification(db, userId, "exit_clearance", `Exit clearance required.`);
  }
};
