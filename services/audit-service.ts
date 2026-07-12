import { AuditOperations, Identifier, JsonRecord, Query } from "./contracts";
import { DatabaseClient } from "./db";
import { AuthorizationError, BusinessConflictError, ValidationError, TransitionError } from "../domain/errors";
import { auditStateMachine, AuditState } from "../domain/workflows";

export class AuditService implements AuditOperations {
  constructor(private db: DatabaseClient) {}

  async create(input: JsonRecord): Promise<JsonRecord> {
    const { scope_department_id, scope_location, date_range_start, date_range_end, created_by } = input;
    if (!date_range_start || !date_range_end || !created_by) {
      throw new ValidationError("Missing required fields: date_range_start, date_range_end, created_by");
    }

    const sql = `
      INSERT INTO audit_cycles (id, scope_department_id, scope_location, date_range_start, date_range_end, status, created_by)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'draft', $5)
      RETURNING *
    `;
    const { rows } = await this.db.query(sql, [
      scope_department_id || null, 
      scope_location || null, 
      date_range_start, 
      date_range_end, 
      created_by
    ]);
    return { audit_cycle: rows[0] };
  }

  async assignAuditors(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const { auditor_ids } = input;
    if (!Array.isArray(auditor_ids)) {
      throw new ValidationError("auditor_ids must be an array");
    }

    return await this.db.transaction(async (client) => {
      const assignments = [];
      for (const auditorId of auditor_ids) {
        const { rows } = await client.query(`
          INSERT INTO audit_assignments (id, audit_cycle_id, auditor_id)
          VALUES (gen_random_uuid(), $1, $2)
          ON CONFLICT (audit_cycle_id, auditor_id) DO NOTHING
          RETURNING *
        `, [id, auditorId]);
        if (rows.length > 0) assignments.push(rows[0]);
      }
      return { assignments };
    });
  }

  async updateFindings(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const { asset_id, result, notes, user_id, user_role } = input;
    
    if (!asset_id || !result || !user_id || !user_role) {
      throw new ValidationError("Missing required fields for updateFindings");
    }

    const isAuthorized = await this.db.transaction(async (client) => {
      if (user_role === 'admin' || user_role === 'asset_manager') {
        return true;
      }
      const { rows } = await client.query(`
        SELECT 1 FROM audit_assignments WHERE audit_cycle_id = $1 AND auditor_id = $2
      `, [id, user_id]);
      return rows.length > 0;
    });

    if (!isAuthorized) {
      throw new AuthorizationError("User is not authorized to update findings for this audit cycle");
    }

    const { rows } = await this.db.query(`
      INSERT INTO audit_findings (id, audit_cycle_id, asset_id, result, notes)
      VALUES (gen_random_uuid(), $1, $2, $3, $4)
      ON CONFLICT (audit_cycle_id, asset_id) 
      DO UPDATE SET result = EXCLUDED.result, notes = EXCLUDED.notes
      RETURNING *
    `, [id, asset_id, result, notes || null]);

    return { finding: rows[0] };
  }

  async close(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const { closed_by } = input;
    if (!closed_by) {
      throw new ValidationError("closed_by is required to close an audit cycle");
    }

    return await this.db.transaction(async (client) => {
      const { rows: cycleRows } = await client.query(`SELECT * FROM audit_cycles WHERE id = $1 FOR UPDATE`, [id]);
      if (cycleRows.length === 0) {
        throw new ValidationError("Audit cycle not found");
      }
      
      const cycle = cycleRows[0];
      const currentStatus = cycle.status as AuditState;
      
      if (currentStatus === 'closed') {
         throw new TransitionError("AuditCycle", "closed", "closed");
      }
      
      if (currentStatus === 'draft') {
         auditStateMachine.transition('draft', 'active');
         auditStateMachine.transition('active', 'closed');
      } else {
         auditStateMachine.transition(currentStatus, 'closed');
      }

      await client.query(`UPDATE audit_cycles SET status = 'closed' WHERE id = $1`, [id]);

      const { rows: findingRows } = await client.query(`
        SELECT asset_id FROM audit_findings WHERE audit_cycle_id = $1 AND result = 'missing'
      `, [id]);
      
      const lostAssets = [];

      if (findingRows.length > 0) {
        const assetIds = findingRows.map((r: any) => r.asset_id);
        const { rows: updatedAssets } = await client.query(`
          UPDATE assets 
          SET status = 'lost' 
          WHERE id = ANY($1) 
          RETURNING *
        `, [assetIds]);
        
        lostAssets.push(...updatedAssets);
      }
      
      await client.query(`
        INSERT INTO activity_log (id, actor_id, action, entity_type, entity_id, metadata)
        VALUES (gen_random_uuid(), $1, 'close', 'AuditCycle', $2, $3)
      `, [closed_by, id, JSON.stringify({ lost_assets_count: lostAssets.length })]);

      await client.query(`
        INSERT INTO notifications (id, user_id, type, message)
        SELECT gen_random_uuid(), id, 'audit_closed', 'Audit cycle closed with ' || $1 || ' lost assets'
        FROM users WHERE role IN ('admin', 'asset_manager')
      `, [lostAssets.length]);

      return { 
        audit_cycle: { ...cycle, status: 'closed' },
        assets_marked_lost: lostAssets 
      };
    });
  }

  async discrepancyReport(id: Identifier): Promise<JsonRecord> {
    const { rows } = await this.db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE result = 'verified') as verified_count,
        COUNT(*) FILTER (WHERE result = 'missing') as missing_count,
        COUNT(*) FILTER (WHERE result = 'damaged') as damaged_count,
        COUNT(*) as total_findings
      FROM audit_findings
      WHERE audit_cycle_id = $1
    `, [id]);

    return { 
      discrepancy: {
        verified: parseInt(rows[0].verified_count, 10),
        missing: parseInt(rows[0].missing_count, 10),
        damaged: parseInt(rows[0].damaged_count, 10),
        total: parseInt(rows[0].total_findings, 10)
      }
    };
  }
}
