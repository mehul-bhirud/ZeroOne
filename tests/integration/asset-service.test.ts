import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssetService } from "../../services/asset-service";
import { DatabaseClient } from "../../services/db";
import { BusinessConflictError } from "../../domain/errors";

describe("AssetService", () => {
  let db: DatabaseClient;
  let service: AssetService;

  beforeEach(() => {
    db = {
      query: vi.fn(),
      transaction: vi.fn(async (cb) => cb(db)),
    } as unknown as DatabaseClient;
    service = new AssetService(db);
  });

  describe("update", () => {
    it("cannot enter Under Maintenance directly via update", async () => {
      vi.mocked(db.query).mockResolvedValue({ 
        rows: [{ status: "available" }], 
        rowCount: 1 
      });

      await expect(service.update("a1", { status: "under_maintenance" })).rejects.toThrowError(BusinessConflictError);
      await expect(service.update("a1", { status: "under_maintenance" })).rejects.toThrowError("Asset cannot be placed directly into maintenance. Use the maintenance approval workflow.");
    });
  });
});
