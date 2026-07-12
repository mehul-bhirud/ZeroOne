import { BookingOperations, Identifier, JsonRecord, Query } from "./contracts";
import { DatabaseClient } from "./db";
import { BusinessConflictError, ValidationError } from "../domain/errors";
import { bookingStateMachine } from "../domain/workflows";
import { logActivity } from "./activity-log";
import { NotificationTriggers } from "./notification-service";

export class BookingService implements BookingOperations {
  constructor(private db: DatabaseClient) {}

  async list(query: Query): Promise<JsonRecord> {
    const { asset_id, from, to } = query;
    let sql = `SELECT * FROM bookings WHERE 1=1`;
    const params: any[] = [];

    if (asset_id) {
      params.push(asset_id);
      sql += ` AND asset_id = $${params.length}`;
    }
    if (from) {
      params.push(from);
      sql += ` AND start_time >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      sql += ` AND end_time <= $${params.length}`;
    }

    sql += ` ORDER BY start_time ASC`;

    const { rows } = await this.db.query(sql, params);
    return { bookings: rows };
  }

  async create(input: JsonRecord): Promise<JsonRecord> {
    const { asset_id, booked_by, start_time, end_time } = input;

    if (!asset_id || !booked_by || !start_time || !end_time) {
      throw new ValidationError("Missing required booking fields");
    }

    const startDate = new Date(start_time as string);
    const endDate = new Date(end_time as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new ValidationError("Invalid start_time or end_time format");
    }

    if (endDate <= startDate) {
      throw new ValidationError("end_time must be after start_time");
    }

    try {
      return await this.db.transaction(async (client) => {
        const { rows: assetRows } = await client.query(`SELECT * FROM assets WHERE id = $1 FOR UPDATE`, [asset_id]);
        if (assetRows.length === 0) {
          throw new ValidationError("Invalid asset_id");
        }
        if (!assetRows[0].is_bookable) {
          throw new ValidationError("Asset is not bookable");
        }

        const sql = `
          INSERT INTO bookings (id, asset_id, booked_by, start_time, end_time, status)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, 'upcoming')
          RETURNING *
        `;
        const params = [asset_id, booked_by, start_time, end_time];

        const { rows } = await client.query(sql, params);
        const booking = rows[0];

        await logActivity(client, (input.actor_id as string) || (booked_by as string), "create", "Booking", booking.id, {
          asset_id,
          start_time,
          end_time,
        });

        await NotificationTriggers.booking(client, booked_by as string, assetRows[0].asset_tag || (asset_id as string), "created");

        return { booking };
      });
    } catch (error: any) {
      if (error.code === '23P01' && error.constraint === 'bookings_no_active_overlap_excl') {
        const { rows: conflictingRows } = await this.db.query(`
          SELECT * FROM bookings 
          WHERE asset_id = $1 
            AND status IN ('upcoming', 'ongoing')
            AND tstzrange(start_time, end_time, '[)') && tstzrange($2, $3, '[)')
          ORDER BY start_time ASC
          LIMIT 1
        `, [asset_id, start_time, end_time]);
        
        const { rows: assetRows } = await this.db.query(`SELECT * FROM assets WHERE id = $1`, [asset_id]);

        throw new BusinessConflictError(
          "BOOKING_OVERLAP",
          "That time overlaps an existing booking. Choose a different slot.",
          {
            asset: assetRows[0],
            conflicting_booking: conflictingRows[0],
          }
        );
      }
      if (error.code === '23514' && error.constraint === 'bookings_valid_time_range_ck') {
         throw new ValidationError("end_time must be after start_time");
      }
      throw error;
    }
  }

  async cancel(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const { reason } = input;
    return await this.db.transaction(async (client) => {
      const { rows } = await client.query(`SELECT status, booked_by, asset_id FROM bookings WHERE id = $1 FOR UPDATE`, [id]);
      if (rows.length === 0) {
        throw new ValidationError("Booking not found");
      }
      
      const booking = rows[0];
      const currentStatus = booking.status;
      try {
        bookingStateMachine.transition(currentStatus as any, "cancelled");
      } catch (e: any) {
         throw new BusinessConflictError("INVALID_BOOKING_STATE", "Booking no longer cancellable");
      }

      const { rows: updatedRows } = await client.query(`
        UPDATE bookings 
        SET status = 'cancelled'
        WHERE id = $1
        RETURNING *
      `, [id]);
      
      const cancelledBooking = updatedRows[0];

      const { rows: assetRows } = await client.query(`SELECT asset_tag FROM assets WHERE id = $1`, [booking.asset_id]);

      await logActivity(client, (input.actor_id as string) || (booking.booked_by as string), "cancel", "Booking", id as string, {
        reason,
      });

      await NotificationTriggers.booking(client, booking.booked_by, assetRows[0].asset_tag || booking.asset_id, "cancelled");

      return { booking: cancelledBooking };
    });
  }

  async checkin(id: Identifier, input?: JsonRecord): Promise<JsonRecord> {
    return await this.db.transaction(async (client) => {
      const { rows } = await client.query(`SELECT status, start_time, end_time, booked_by, asset_id FROM bookings WHERE id = $1 FOR UPDATE`, [id]);
      if (rows.length === 0) {
        throw new ValidationError("Booking not found");
      }

      const booking = rows[0];
      const now = new Date();
      const startTime = new Date(booking.start_time);
      const endTime = new Date(booking.end_time);
      
      // 15-minute early window
      const checkinWindowStart = new Date(startTime.getTime() - 15 * 60000);

      if (now < checkinWindowStart || now > endTime) {
        throw new ValidationError("outside check-in window", {
          current_time: now.toISOString(),
          checkin_window_start: checkinWindowStart.toISOString(),
          checkin_window_end: endTime.toISOString(),
        });
      }

      try {
        bookingStateMachine.transition(booking.status as any, "ongoing");
      } catch (e: any) {
        throw new BusinessConflictError("INVALID_BOOKING_STATE", "Booking cannot be checked in");
      }

      const { rows: updatedRows } = await client.query(`
        UPDATE bookings
        SET status = 'ongoing'
        WHERE id = $1
        RETURNING *
      `, [id]);

      const checkedInBooking = updatedRows[0];

      const { rows: assetRows } = await client.query(`SELECT asset_tag FROM assets WHERE id = $1`, [booking.asset_id]);

      await logActivity(client, (input?.actor_id as string) || (booking.booked_by as string), "checkin", "Booking", id as string, {});

      await NotificationTriggers.booking(client, booking.booked_by, assetRows[0].asset_tag || booking.asset_id, "checked in");

      return { booking: checkedInBooking };
    });
  }
}
