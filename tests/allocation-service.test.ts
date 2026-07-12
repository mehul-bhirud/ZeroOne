import { describe, expect, it } from "vitest";

import { AllocationService } from "../services/allocation-service";
import type { DatabaseClient } from "../services/db";

describe("AllocationService", () => {
  it("maps the canonical active-allocation index violation", async () => {
    const assetId = "40000000-0000-0000-0000-000000000001";
    const currentAllocation = {
      id: "50000000-0000-0000-0000-000000000001",
      asset_id: assetId,
      holder_type: "user",
      holder_id: "20000000-0000-0000-0000-000000000005",
      holder_name: "Meera Iyer",
      returned_at: null,
    };

    let lookup = 0;
    const db: DatabaseClient = {
      transaction: async () => {
        throw {
          code: "23505",
          constraint: "allocations_one_active_per_asset_idx",
        };
      },
      query: async <T = any>() => {
        lookup += 1;
        if (lookup === 1) return { rows: [currentAllocation] as T[], rowCount: 1 };
        return { rows: [{ id: assetId, asset_tag: "AF-0001" }] as T[], rowCount: 1 };
      },
    };

    const service = new AllocationService(db);

    await expect(service.create({
      asset_id: assetId,
      holder_type: "user",
      holder_id: "20000000-0000-0000-0000-000000000006",
      expected_return_date: "2026-07-20",
    })).rejects.toMatchObject({
      kind: "conflict",
      code: "ASSET_ALREADY_ALLOCATED",
      message: "AF-0001 is with Meera Iyer. Request a transfer instead.",
      details: {
        asset: { id: assetId, asset_tag: "AF-0001" },
        current_allocation: currentAllocation,
        current_holder: {
          holder_type: "user",
          holder_id: currentAllocation.holder_id,
          holder_name: "Meera Iyer",
        },
        transfer_request_path: "/transfer-requests",
      },
    });
  });
});
