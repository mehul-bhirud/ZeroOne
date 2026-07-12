import { AssetOperations, Identifier, JsonRecord, Query } from "./contracts";
import { DatabaseClient } from "./db";
import { assetStateMachine, AssetState } from "../domain/workflows";
import { ValidationError, TransitionError, BusinessConflictError } from "../domain/errors";

export class AssetService implements AssetOperations {
  constructor(private db: DatabaseClient) {}

  async list(query: Query): Promise<JsonRecord> {
    const { search, category, status, department, location } = query;
    let sql = `SELECT * FROM assets WHERE 1=1`;
    const params: any[] = [];

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    if (category) {
      params.push(category);
      sql += ` AND category_id = $${params.length}`;
    }

    if (location) {
      params.push(location);
      sql += ` AND location = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      sql += ` AND (name ILIKE $${i} OR asset_tag ILIKE $${i} OR serial_number ILIKE $${i})`;
    }
    
    // Execute query
    const { rows, rowCount } = await this.db.query(sql, params);
    return { assets: rows, total: rowCount, filters: query };
  }

  async create(input: JsonRecord): Promise<JsonRecord> {
    // Basic validation
    const { name, category_id, serial_number, acquisition_date, acquisition_cost, condition, location, is_bookable, photo_url } = input;
    if (!name || !category_id || !serial_number || !acquisition_date || !condition || !location) {
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
    const [allocations, transferRequests, bookings, maintenanceRequests, auditFindings, activity] = await Promise.all([
      this.db.query(`SELECT * FROM allocations WHERE asset_id = $1 ORDER BY allocated_at DESC`, [id]),
      this.db.query(`SELECT * FROM transfer_requests WHERE asset_id = $1 ORDER BY status, id`, [id]),
      this.db.query(`SELECT * FROM bookings WHERE asset_id = $1 ORDER BY start_time DESC`, [id]),
      this.db.query(`SELECT * FROM maintenance_requests WHERE asset_id = $1 ORDER BY status, id`, [id]),
      this.db.query(`SELECT * FROM audit_findings WHERE asset_id = $1 ORDER BY audit_cycle_id DESC`, [id]),
      this.db.query(`SELECT * FROM activity_log WHERE entity_type = 'Asset' AND entity_id = $1 ORDER BY id DESC`, [id]),
    ]);
    return {
      asset: rows[0],
      allocations: allocations.rows,
      transfer_requests: transferRequests.rows,
      bookings: bookings.rows,
      maintenance_requests: maintenanceRequests.rows,
      audit_findings: auditFindings.rows,
      activity: activity.rows,
    };
  }

  async update(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const { rows: currentRows } = await this.db.query(`SELECT status FROM assets WHERE id = $1`, [id]);
    if (currentRows.length === 0) {
      throw new ValidationError("Asset not found");
    }
    
    const currentStatus = currentRows[0].status as AssetState;
    
    if (input.status && input.status !== currentStatus) {
      if (input.status === 'under_maintenance') {
        throw new BusinessConflictError("INVALID_TRANSITION", "Asset cannot be placed directly into maintenance. Use the maintenance approval workflow.");
      }
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
