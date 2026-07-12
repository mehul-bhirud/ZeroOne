import { AllocationOperations, Identifier, JsonRecord } from "./contracts";
import { DatabaseClient } from "./db";
import { BusinessConflictError, ValidationError } from "../domain/errors";
import { assetStateMachine } from "../domain/workflows";

export class AllocationService implements AllocationOperations {
  constructor(private db: DatabaseClient) {}

  async create(input: JsonRecord): Promise<JsonRecord> {
    const { asset_id, holder_type, holder_id, expected_return_date } = input;
    
    if (!asset_id || !holder_type || !holder_id || !expected_return_date) {
      throw new ValidationError("Missing required allocation fields");
    }

    try {
      return await this.db.transaction(async (client) => {
        const { rows: assetRows } = await client.query<{ status: string }>(
          `SELECT status FROM assets WHERE id = $1 FOR UPDATE`,
          [asset_id],
        );
        if (assetRows.length === 0) {
          throw new ValidationError("Invalid asset_id");
        }

        assetStateMachine.transition(assetRows[0].status as any, "allocated");

        const sql = `
          INSERT INTO allocations (id, asset_id, holder_type, holder_id, expected_return_date, allocated_at)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, now())
          RETURNING *
        `;
        const params = [asset_id, holder_type, holder_id, expected_return_date];

        const { rows } = await client.query(sql, params);

        await client.query(`UPDATE assets SET status = 'allocated' WHERE id = $1`, [asset_id]);

        return { allocation: rows[0] };
      });
    } catch (error: any) {
      // 23505 is PostgreSQL unique_violation. If we later add a partial unique index for one active allocation,
      // map it (and the allocated -> allocated transition) to the demo-critical ASSET_ALREADY_ALLOCATED error.
      if (
        (error.code === "23505" && error.constraint === "one_active_allocation") ||
        (error.code === "INVALID_TRANSITION" && error.details?.entity === "Asset" && error.details?.from === "allocated" && error.details?.to === "allocated")
      ) {
        const { rows: allocRows } = await this.db.query(`
          SELECT a.*, u.name as holder_name
          FROM allocations a
          LEFT JOIN users u ON a.holder_id = u.id
          WHERE a.asset_id = $1 AND a.returned_at IS NULL
          ORDER BY a.allocated_at DESC
          LIMIT 1
        `, [asset_id]);

        const currentAllocation = allocRows[0];
        const holderName = currentAllocation?.holder_name || "Unknown";

        const { rows: assetRows } = await this.db.query(`SELECT * FROM assets WHERE id = $1`, [asset_id]);
        const asset = assetRows[0];
        const assetTag = asset?.asset_tag || asset_id;

        throw new BusinessConflictError(
          "ASSET_ALREADY_ALLOCATED",
          `${assetTag} is with ${holderName}. Request a transfer instead.`,
          {
            asset,
            current_allocation: currentAllocation,
            current_holder: currentAllocation
              ? {
                  holder_type: currentAllocation.holder_type,
                  holder_id: currentAllocation.holder_id,
                  holder_name: currentAllocation.holder_name,
                }
              : null,
            transfer_request_path: "/transfer-requests",
          },
        );
      }
      throw error;
    }
  }

  async returnAsset(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const { return_condition_notes } = input;
    
    return await this.db.transaction(async (client) => {
      // Atomically return the allocation (prevents double-returns under concurrency)
      const { rows: updatedAllocRows } = await client.query(`
        UPDATE allocations 
        SET returned_at = now(), return_condition_notes = $2
        WHERE id = $1 AND returned_at IS NULL
        RETURNING *
      `, [id, return_condition_notes]);

      if (updatedAllocRows.length === 0) {
        throw new BusinessConflictError("INVALID_ALLOCATION_STATE", "Allocation not found or already returned");
      }

      const allocation = updatedAllocRows[0];
      const { rows: assetRows } = await client.query(`
        UPDATE assets
        SET status = 'available'
        WHERE id = $1
        RETURNING *
      `, [allocation.asset_id]);

      return {
        allocation: updatedAllocRows[0],
        asset: assetRows[0]
      };
    });
  }
}
