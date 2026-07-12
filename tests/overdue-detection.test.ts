import { describe, expect, it, vi } from "vitest";
import { overdueDetectionJob } from "../jobs/overdue-detection";
import type { DatabaseClient } from "../services/db";

describe("overdue detection job", () => {
  it("notifies user holders and advances expired bookings", async () => {
    const db = {
      transaction: vi.fn(async (callback) => callback(db as unknown as DatabaseClient)),
      query: vi.fn(),
    } as unknown as DatabaseClient;
    vi.mocked(db.query)
      .mockResolvedValueOnce({ rows: [{ id: "allocation-1", holder_type: "user", holder_id: "user-1", asset_tag: "AF-0001" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "booking-1", status: "upcoming", booked_by: "user-1", asset_id: "asset-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(overdueDetectionJob.run(db, new Date("2026-07-12T12:00:00Z"))).resolves.toEqual({ processed: 2 });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO notifications"), expect.any(Array));
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE bookings SET status"), ["booking-1", "no_show"]);
  });
});
