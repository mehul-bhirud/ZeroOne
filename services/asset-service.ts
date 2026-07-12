import { AssetOperations, Identifier, JsonRecord, Query } from "./contracts";
import { DatabaseClient } from "./db";
import { assetStateMachine, AssetState } from "../domain/workflows";
import { ValidationError, TransitionError } from "../domain/errors";

export class AssetService implements AssetOperations {
  constructor(private db: DatabaseClient) {}

  async list(query: Query): Promise<JsonRecord> {
    const { search, category, status, department, location } = query;
    let sql = `SELECT * FROM assets WHERE 1=1`;
    const params: any[] = [];
    
    // Simplistic query building for demonstration
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    
    // Execute query
    const { rows, rowCount } = await this.db.query(sql, params);
    return { assets: rows, total: rowCount, filters: query };
  }

  async create(input: JsonRecord): Promise<JsonRecord> {
    // Basic validation
    const { name, category_id, serial_number, acquisition_date, acquisition_cost, condition, location, is_bookable, photo_url } = input;
    if (!name || !category_id || !serial_number) {
      throw new ValidationError("Missing required fields for Asset creation");
    }

    const sql = `
      INSERT INTO assets (id, name, category_id, serial_number, acquisition_date, acquisition_cost, condition, location, is_bookable, status, photo_url)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'available', $9)
      RETURNING *
    `;
    const params = [name, category_id, serial_number, acquisition_date, acquisition_cost ?? 0, condition, location, is_bookable ?? false, photo_url ?? null];
    
    const { rows } = await this.db.query(sql, params);
    return { asset: rows[0] };
  }

  async get(id: Identifier): Promise<JsonRecord> {
    const { rows } = await this.db.query(`SELECT * FROM assets WHERE id = $1`, [id]);
    if (rows.length === 0) {
      throw new ValidationError("Asset not found");
    }
    return { asset: rows[0], allocations: [], transfer_requests: [], bookings: [], maintenance_requests: [], audit_findings: [], activity: [] };
  }

  async update(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const { rows: currentRows } = await this.db.query(`SELECT status FROM assets WHERE id = $1`, [id]);
    if (currentRows.length === 0) {
      throw new ValidationError("Asset not found");
    }
    
    const currentStatus = currentRows[0].status as AssetState;
    
    if (input.status && input.status !== currentStatus) {
      // Validate transition via state machine
      assetStateMachine.transition(currentStatus, input.status as AssetState);
    }

    // In a real app, we'd dynamically build the update query based on allowed fields.
    // Here we assume status is the only field being updated for brevity, or we'd map all fields.
    const newStatus = input.status || currentStatus;
    
    const sql = `
      UPDATE assets
      SET status = $2
      WHERE id = $1
      RETURNING *
    `;
    const { rows } = await this.db.query(sql, [id, newStatus]);
    
    return { asset: rows[0] };
  }
}
