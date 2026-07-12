import { TransferOperations, Identifier, JsonRecord } from "./contracts";
import { DatabaseClient } from "./db";
import { BusinessConflictError, ValidationError } from "../domain/errors";

export class TransferService implements TransferOperations {
  constructor(private db: DatabaseClient) {}

  async create(input: JsonRecord): Promise<JsonRecord> {
    const { asset_id, from_holder, to_holder, requested_by } = input;
    
    if (!asset_id || !from_holder || !to_holder || !requested_by) {
      throw new ValidationError("Missing required transfer request fields");
    }

    const sql = `
      INSERT INTO transfer_requests (id, asset_id, from_holder, to_holder, requested_by, status)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'pending')
      RETURNING *
    `;
    const { rows } = await this.db.query(sql, [asset_id, JSON.stringify(from_holder), JSON.stringify(to_holder), requested_by]);
    
    return { transfer_request: rows[0] };
  }

  async approve(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const { approved_by } = input;

    return await this.db.transaction(async (client) => {
      // Find the pending transfer request
      const { rows: trRows } = await client.query(`SELECT * FROM transfer_requests WHERE id = $1 AND status = 'pending' FOR UPDATE`, [id]);
      if (trRows.length === 0) {
        throw new BusinessConflictError("INVALID_TRANSFER_STATE", "Transfer request not found or already resolved.");
      }
      const transferRequest = trRows[0];

      // Find the active allocation for this asset
      const { rows: allocRows } = await client.query(`SELECT * FROM allocations WHERE asset_id = $1 AND returned_at IS NULL FOR UPDATE`, [transferRequest.asset_id]);
      if (allocRows.length === 0) {
        throw new BusinessConflictError("INVALID_ALLOCATION_STATE", "Asset does not have an active allocation to transfer from.");
      }
      const previousAllocation = allocRows[0];

      const fromHolder: any = transferRequest.from_holder;
      if (
        fromHolder?.holder_type !== previousAllocation.holder_type ||
        fromHolder?.holder_id !== previousAllocation.holder_id
      ) {
        throw new BusinessConflictError(
          "CUSTODY_CHANGED",
          "Asset custody changed since this transfer request was created. Refresh and create a new transfer request.",
          { asset_id: transferRequest.asset_id, current_allocation: previousAllocation, requested_from: fromHolder },
        );
      }

      // Mark transfer as approved
      const { rows: updatedTrRows } = await client.query(`
        UPDATE transfer_requests 
        SET status = 'approved', approved_by = $2 
        WHERE id = $1 
        RETURNING *
      `, [id, approved_by]);

      // Return the previous allocation
      const { rows: oldAllocRows } = await client.query(`
        UPDATE allocations
        SET returned_at = now()
        WHERE id = $1
        RETURNING *
      `, [previousAllocation.id]);

      // Create new allocation for to_holder
      // Since to_holder is JSONB we assume it contains { holder_type, holder_id, expected_return_date }
      const toHolder = transferRequest.to_holder;
      const { rows: newAllocRows } = await client.query(`
        INSERT INTO allocations (id, asset_id, holder_type, holder_id, expected_return_date, allocated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, now())
        RETURNING *
      `, [transferRequest.asset_id, toHolder.holder_type, toHolder.holder_id, toHolder.expected_return_date || null]);

      // Write ActivityLog
      await client.query(`
        INSERT INTO activity_log (id, actor_id, action, entity_type, entity_id, metadata)
        VALUES (gen_random_uuid(), $1, 'transfer_approved', 'Asset', $2, $3)
      `, [approved_by, transferRequest.asset_id, JSON.stringify({ transfer_request_id: id })]);

      return {
        transfer_request: updatedTrRows[0],
        previous_allocation: oldAllocRows[0],
        new_allocation: newAllocRows[0]
      };
    });
  }

  async reject(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const { reason } = input;
    const { rows } = await this.db.query(`
      UPDATE transfer_requests
      SET status = 'rejected'
      WHERE id = $1 AND status = 'pending'
      RETURNING *
    `, [id]);

    if (rows.length === 0) {
      throw new BusinessConflictError("INVALID_TRANSFER_STATE", "Transfer request not found or already resolved.");
    }

    return { transfer_request: rows[0] };
  }
}
