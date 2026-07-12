import { describe, it, expect, vi, beforeEach } from "vitest";
import { MaintenanceService } from "../../services/maintenance-service";
import { DatabaseClient } from "../../services/db";
import { BusinessConflictError, ValidationError } from "../../domain/errors";

describe("MaintenanceService", () => {
  let db: DatabaseClient;
  let service: MaintenanceService;

  beforeEach(() => {
    db = {
      query: vi.fn(),
      transaction: vi.fn(async (cb) => cb(db)),
    } as unknown as DatabaseClient;
    service = new MaintenanceService(db);
  });

  describe("approve", () => {
    it("transitions pending to approved and updates asset status to under_maintenance", async () => {
      // Mock getAndTransition (fetches maintenance request)
      vi.mocked(db.query).mockResolvedValueOnce({ 
        rows: [{ id: "m1", asset_id: "a1", raised_by: "u1", status: "pending" }], 
        rowCount: 1 
      }); // SELECT for getAndTransition
      vi.mocked(db.query).mockResolvedValueOnce({ 
        rows: [{ id: "m1", asset_id: "a1", raised_by: "u1", status: "approved" }], 
        rowCount: 1 
      }); // UPDATE maintenance_request

      // Mock update asset status
      vi.mocked(db.query).mockResolvedValueOnce({ 
        rows: [{ id: "a1", status: "available" }], 
        rowCount: 1 
      }); // SELECT asset status FOR UPDATE
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE asset status

      // Mock ActivityLog insert
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1 });
      
      // Mock Notification insert
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await service.approve("m1", { approved_by: "a1" });
      expect((result.maintenance_request as any).status).toBe("approved");

      // Verify asset status update was called
      expect(db.query).toHaveBeenCalledWith(
        "UPDATE assets SET status = 'under_maintenance' WHERE id = $1", 
        ["a1"]
      );
    });

    it("cannot enter Under Maintenance before maintenance approval (enforced by AssetService separately)", () => {
      // Tested in asset-service.test.ts
    });
  });

  describe("resolve", () => {
    it("transitions to resolved and returns asset to available", async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ 
        rows: [{ id: "m1", asset_id: "a1", raised_by: "u1", status: "in_progress" }], 
        rowCount: 1 
      }); 
      vi.mocked(db.query).mockResolvedValueOnce({ 
        rows: [{ id: "m1", asset_id: "a1", raised_by: "u1", status: "resolved" }], 
        rowCount: 1 
      });

      // Asset query
      vi.mocked(db.query).mockResolvedValueOnce({ 
        rows: [{ id: "a1", status: "under_maintenance" }], 
        rowCount: 1 
      }); 
      // Update asset
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Log
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Notification
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await service.resolve("m1", { resolved_by: "t1" });
      expect((result.maintenance_request as any).status).toBe("resolved");

      expect(db.query).toHaveBeenCalledWith(
        "UPDATE assets SET status = $2 WHERE id = $1", 
        ["a1", "available"]
      );
    });
  });
});
