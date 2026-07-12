import { MaintenanceOperations, Identifier, JsonRecord } from "./contracts";
import { DatabaseClient } from "./db";
import { BusinessConflictError, ValidationError } from "../domain/errors";
import { maintenanceStateMachine, assetStateMachine, MaintenanceState, AssetState } from "../domain/workflows";

export class MaintenanceService implements MaintenanceOperations {
  constructor(private db: DatabaseClient) {}

  async list(query: JsonRecord = {}): Promise<JsonRecord> {
    const params: unknown[] = [];
    let sql = `
      SELECT m.*, a.name AS asset_name, a.asset_tag, u.name AS raised_by_name,
             CURRENT_TIMESTAMP AS created_at
      FROM maintenance_requests m
      JOIN assets a ON a.id = m.asset_id
      JOIN users u ON u.id = m.raised_by
      WHERE 1 = 1
    `;
    const status = typeof query.status === "string" ? query.status : undefined;
    const assetId = typeof query.asset_id === "string" ? query.asset_id : undefined;
    if (status) {
      params.push(status);
      sql += ` AND m.status = $${params.length}`;
    }
    if (assetId) {
      params.push(assetId);
      sql += ` AND m.asset_id = $${params.length}`;
    }
    sql += " ORDER BY m.id";
    const { rows } = await this.db.query(sql, params);
    return { maintenance_requests: rows };
  }

  async create(input: JsonRecord): Promise<JsonRecord> {
    const { asset_id, raised_by, issue_description, priority, photo_url } = input;

    if (!asset_id || !raised_by || !issue_description || !priority) {
      throw new ValidationError("Missing required maintenance request fields");
    }

    return await this.db.transaction(async (client) => {
      // Check if asset exists
      const { rows: assetRows } = await client.query(`SELECT status FROM assets WHERE id = $1`, [asset_id]);
      if (assetRows.length === 0) {
        throw new ValidationError("Asset not found");
      }

      const { rows: openRequests } = await client.query(`
        SELECT id FROM maintenance_requests
        WHERE asset_id = $1 AND status IN ('pending', 'approved', 'technician_assigned', 'in_progress')
        LIMIT 1
      `, [asset_id]);
      if (openRequests.length > 0) {
        throw new BusinessConflictError("MAINTENANCE_REQUEST_EXISTS", "This asset already has an open maintenance request.", { maintenance_request_id: openRequests[0].id });
      }

      const sql = `
        INSERT INTO maintenance_requests (id, asset_id, raised_by, issue_description, priority, photo_url, status)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'pending')
        RETURNING *
      `;
      const { rows } = await client.query(sql, [asset_id, raised_by, issue_description, priority, photo_url ?? null]);
      const maintenanceRequest = rows[0];

      // Activity log
      await client.query(`
        INSERT INTO activity_log (id, actor_id, action, entity_type, entity_id, metadata)
        VALUES (gen_random_uuid(), $1, 'maintenance_requested', 'Asset', $2, $3)
      `, [raised_by, asset_id, JSON.stringify({ maintenance_request_id: maintenanceRequest.id, issue: issue_description })]);

      return { maintenance_request: maintenanceRequest };
    });
  }

  async approve(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const { approved_by } = input;
    if (!approved_by) throw new ValidationError("approved_by is required");

    return await this.db.transaction(async (client) => {
      const req = await this.getAndTransition(client, id, 'approved');

      // Update asset status
      const { rows: assetRows } = await client.query(`SELECT * FROM assets WHERE id = $1 FOR UPDATE`, [req.asset_id]);
      if (assetRows.length === 0) throw new ValidationError("Asset not found");
      const currentAssetStatus = assetRows[0].status as AssetState;
      
      assetStateMachine.transition(currentAssetStatus, 'under_maintenance');
      
      const { rows: updatedAssets } = await client.query(`UPDATE assets SET status = 'under_maintenance' WHERE id = $1 RETURNING *`, [req.asset_id]);

      // Activity log
      await client.query(`
        INSERT INTO activity_log (id, actor_id, action, entity_type, entity_id, metadata)
        VALUES (gen_random_uuid(), $1, 'maintenance_approved', 'Asset', $2, $3)
      `, [approved_by, req.asset_id, JSON.stringify({ maintenance_request_id: id })]);

      // Notification
      await this.notify(client, req.raised_by, 'maintenance_update', `Your maintenance request for asset ${req.asset_id} has been approved.`);

      return { maintenance_request: req, asset: updatedAssets[0] };
    });
  }

  async reject(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const { rejected_by, reason } = input;
    if (!rejected_by || typeof reason !== "string" || !reason.trim()) throw new ValidationError("rejected_by and reason are required");

    return await this.db.transaction(async (client) => {
      const req = await this.getAndTransition(client, id, 'rejected');

      // Activity log
      await client.query(`
        INSERT INTO activity_log (id, actor_id, action, entity_type, entity_id, metadata)
        VALUES (gen_random_uuid(), $1, 'maintenance_rejected', 'Asset', $2, $3)
      `, [rejected_by, req.asset_id, JSON.stringify({ maintenance_request_id: id, reason: reason || null })]);

      // Notification
      await this.notify(client, req.raised_by, 'maintenance_update', `Your maintenance request for asset ${req.asset_id} was rejected.`);

      return { maintenance_request: req };
    });
  }

  async assignTechnician(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const { assigned_by, technician } = input;
    if (!assigned_by || !technician) throw new ValidationError("assigned_by and technician are required");

    return await this.db.transaction(async (client) => {
      const req = await this.getAndTransition(client, id, 'technician_assigned', { technician });

      // Activity log
      await client.query(`
        INSERT INTO activity_log (id, actor_id, action, entity_type, entity_id, metadata)
        VALUES (gen_random_uuid(), $1, 'technician_assigned', 'Asset', $2, $3)
      `, [assigned_by, req.asset_id, JSON.stringify({ maintenance_request_id: id, technician })]);

      return { maintenance_request: req };
    });
  }

  async start(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const { actor_id } = input;
    if (!actor_id) throw new ValidationError("actor_id is required");

    return await this.db.transaction(async (client) => {
      const req = await this.getAndTransition(client, id, 'in_progress');

      // Activity log
      await client.query(`
        INSERT INTO activity_log (id, actor_id, action, entity_type, entity_id, metadata)
        VALUES (gen_random_uuid(), $1, 'maintenance_started', 'Asset', $2, $3)
      `, [actor_id, req.asset_id, JSON.stringify({ maintenance_request_id: id })]);

      return { maintenance_request: req };
    });
  }

  async resolve(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const { resolved_by, resolution_notes, return_state = 'available' } = input;
    if (!resolved_by) throw new ValidationError("resolved_by is required");

    return await this.db.transaction(async (client) => {
      const req = await this.getAndTransition(client, id, 'resolved');

      // Transition asset out of under_maintenance
      const { rows: assetRows } = await client.query(`SELECT * FROM assets WHERE id = $1 FOR UPDATE`, [req.asset_id]);
      if (assetRows.length === 0) throw new ValidationError("Asset not found");
      const currentAssetStatus = assetRows[0].status as AssetState;
      
      const targetState = return_state as AssetState;
      assetStateMachine.transition(currentAssetStatus, targetState);
      
      const { rows: updatedAssets } = await client.query(`UPDATE assets SET status = $2 WHERE id = $1 RETURNING *`, [req.asset_id, targetState]);

      // Activity log
      await client.query(`
        INSERT INTO activity_log (id, actor_id, action, entity_type, entity_id, metadata)
        VALUES (gen_random_uuid(), $1, 'maintenance_resolved', 'Asset', $2, $3)
      `, [resolved_by, req.asset_id, JSON.stringify({ maintenance_request_id: id, resolution_notes, return_state: targetState })]);

      // Notification
      await this.notify(client, req.raised_by, 'maintenance_update', `Your maintenance request for asset ${req.asset_id} has been resolved.`);

      return { maintenance_request: req, asset: updatedAssets[0] };
    });
  }

  private async getAndTransition(
    client: DatabaseClient, 
    id: Identifier, 
    targetState: MaintenanceState, 
    additionalUpdates: Record<string, any> = {}
  ): Promise<any> {
    const { rows } = await client.query(`SELECT * FROM maintenance_requests WHERE id = $1 FOR UPDATE`, [id]);
    if (rows.length === 0) {
      throw new ValidationError("Maintenance request not found");
    }

    const req = rows[0];
    const currentStatus = req.status as MaintenanceState;
    maintenanceStateMachine.transition(currentStatus, targetState);

    let updateSql = `UPDATE maintenance_requests SET status = $2`;
    const params: any[] = [id, targetState];

    let index = 3;
    for (const [key, value] of Object.entries(additionalUpdates)) {
      updateSql += `, ${key} = $${index}`;
      params.push(value);
      index++;
    }

    updateSql += ` WHERE id = $1 RETURNING *`;

    const { rows: updatedRows } = await client.query(updateSql, params);
    return updatedRows[0];
  }

  private async notify(client: DatabaseClient, user_id: string, type: string, message: string) {
    await client.query(`
      INSERT INTO notifications (id, user_id, type, message)
      VALUES (gen_random_uuid(), $1, $2, $3)
    `, [user_id, type, message]);
  }
}
