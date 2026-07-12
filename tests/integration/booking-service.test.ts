import { describe, it, expect, vi, beforeEach } from "vitest";
import { BookingService } from "../../services/booking-service";
import { DatabaseClient } from "../../services/db";
import { BusinessConflictError, ValidationError } from "../../domain/errors";

describe("BookingService", () => {
  let db: DatabaseClient;
  let service: BookingService;

  beforeEach(() => {
    db = {
      query: vi.fn(),
      transaction: vi.fn(async (cb) => cb(db)),
    } as unknown as DatabaseClient;
    service = new BookingService(db);
  });

  describe("create", () => {
    it("cannot book an overlapping slot and allows a back-to-back slot", async () => {
      // Mock for allowed back-to-back
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [{ is_bookable: true }], rowCount: 1 }); // Asset check
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [{ id: "b1", status: "upcoming" }], rowCount: 1 }); // Insert success

      await expect(service.create({
        asset_id: "a1",
        booked_by: "u1",
        start_time: "2026-07-12T10:00:00Z",
        end_time: "2026-07-12T11:00:00Z"
      })).resolves.toEqual({ booking: { id: "b1", status: "upcoming" } });

      // Mock for overlapping conflict
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [{ is_bookable: true }], rowCount: 1 }); // Asset check
      
      const overlapError = new Error("overlap") as any;
      overlapError.code = "23P01";
      overlapError.constraint = "bookings_no_active_overlap_excl";
      
      vi.mocked(db.query).mockRejectedValueOnce(overlapError); // Insert fails
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [{ id: "b1", start_time: "2026-07-12T10:30:00Z", end_time: "2026-07-12T11:30:00Z" }], rowCount: 1 }); // Conflicting booking query
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [{ id: "a1", name: "Laptop" }], rowCount: 1 }); // Asset query

      await expect(service.create({
        asset_id: "a1",
        booked_by: "u1",
        start_time: "2026-07-12T10:30:00Z",
        end_time: "2026-07-12T11:30:00Z"
      })).rejects.toThrowError(BusinessConflictError);
    });

    it("requires end_time after start_time", async () => {
      await expect(service.create({
        asset_id: "a1",
        booked_by: "u1",
        start_time: "2026-07-12T11:00:00Z",
        end_time: "2026-07-12T10:00:00Z"
      })).rejects.toThrowError(ValidationError);
    });
  });

  describe("cancel (rescheduling part 1)", () => {
    it("transitions upcoming booking to cancelled", async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [{ status: "upcoming" }], rowCount: 1 }); // Current status
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [{ id: "b1", status: "cancelled" }], rowCount: 1 }); // Update result

      const result = await service.cancel("b1", { reason: "Rescheduling" });
      expect((result.booking as any).status).toBe("cancelled");
    });
  });

  describe("checkin", () => {
    it("allows check-in within 15-minute early window", async () => {
      const now = new Date();
      const start = new Date(now.getTime() + 10 * 60000); // 10 minutes from now (in window)
      const end = new Date(now.getTime() + 60 * 60000);

      vi.mocked(db.query).mockResolvedValueOnce({ 
        rows: [{ status: "upcoming", start_time: start.toISOString(), end_time: end.toISOString() }], 
        rowCount: 1 
      }); 
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [{ id: "b1", status: "ongoing" }], rowCount: 1 });

      const result = await service.checkin("b1");
      expect((result.booking as any).status).toBe("ongoing");
    });

    it("rejects check-in outside window", async () => {
      const now = new Date();
      const start = new Date(now.getTime() + 20 * 60000); // 20 minutes from now (too early)
      const end = new Date(now.getTime() + 60 * 60000);

      vi.mocked(db.query).mockResolvedValueOnce({ 
        rows: [{ status: "upcoming", start_time: start.toISOString(), end_time: end.toISOString() }], 
        rowCount: 1 
      }); 

      await expect(service.checkin("b1")).rejects.toThrowError(ValidationError);
    });
  });
});
