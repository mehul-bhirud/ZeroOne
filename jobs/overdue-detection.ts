import { DatabaseClient } from "../services/db";
import { logActivity } from "../services/activity-log";
import { NotificationTriggers } from "../services/notification-service";

function isUserHolder(holderType: unknown): boolean {
  return holderType === "user" || holderType === "employee";
}

export interface ScheduledJob {
  name: string;
  run(db: DatabaseClient, now?: Date): Promise<{ processed: number }>;
}

export const overdueDetectionJob: ScheduledJob = {
  name: "overdue-allocation-detection",
  async run(db: DatabaseClient, now: Date = new Date()) {
    let processed = 0;
    await db.transaction(async (client) => {
      // 1. Process overdue allocations
      const { rows: overdueAllocations } = await client.query(`
        SELECT a.id, a.asset_id, a.holder_type, a.holder_id, ast.asset_tag 
        FROM allocations a
        JOIN assets ast ON a.asset_id = ast.id
        WHERE a.returned_at IS NULL 
          AND a.expected_return_date < $1::date
      `, [now.toISOString().split('T')[0]]);

      for (const alloc of overdueAllocations) {
        if (isUserHolder(alloc.holder_type)) {
          await NotificationTriggers.overdueReturn(client, alloc.holder_id, alloc.asset_tag || alloc.asset_id);
          await logActivity(client, null, "overdue_detected", "Allocation", alloc.id, {});
          processed++;
        }
      }

      // 2. Bookings Status Maintenance
      const { rows: expiredBookings } = await client.query(`
        SELECT id, status, booked_by, asset_id
        FROM bookings
        WHERE status IN ('upcoming', 'ongoing')
          AND end_time < $1
      `, [now.toISOString()]);

      for (const booking of expiredBookings) {
        const nextStatus = booking.status === 'upcoming' ? 'no_show' : 'completed';
        
        await client.query(`UPDATE bookings SET status = $2 WHERE id = $1`, [booking.id, nextStatus]);
        await logActivity(client, null, "status_updated_by_job", "Booking", booking.id, { from: booking.status, to: nextStatus });
        processed++;
      }
    });

    return { processed };
  },
};
