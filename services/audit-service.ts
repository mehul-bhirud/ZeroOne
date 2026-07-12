import { AuditOperations, Identifier, JsonRecord, Query } from "./contracts";
import { DatabaseClient } from "./db";
import { AuthorizationError, BusinessConflictError, ValidationError, TransitionError } from "../domain/errors";
import { auditStateMachine, AuditState } from "../domain/workflows";

type AuditCycleRow = {
  id: string;
  scope_department_id: string | null;
  scope_location: string | null;
  date_range_start: string;
  date_range_end: string;
  status: AuditState;
  created_by: string;
};

type AuditFindingRow = {
  id: string;
  audit_cycle_id: string;
  asset_id: string;
  result: "verified" | "missing" | "damaged";
  notes: string | null;
};

const auditResults = new Set(["verified", "missing", "damaged"]);

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function dateValue(value: unknown): string | undefined {
  const date = stringValue(value);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

function summary(findings: AuditFindingRow[]) {
  return {
    verified: findings.filter((finding) => finding.result === "verified").length,
    missing: findings.filter((finding) => finding.result === "missing").length,
    damaged: findings.filter((finding) => finding.result === "damaged").length,
    total: findings.length,
  };
}

export class AuditService implements AuditOperations {
  constructor(private db: DatabaseClient) {}

  async create(input: JsonRecord): Promise<JsonRecord> {
    const start = dateValue(input.date_range_start);
    const end = dateValue(input.date_range_end);
    const createdBy = stringValue(input.created_by);
    const departmentId = input.scope_department_id == null ? null : stringValue(input.scope_department_id);
    const location = input.scope_location == null ? null : stringValue(input.scope_location);

    if (!start || !end || !createdBy || (input.scope_department_id != null && !departmentId) || (input.scope_location != null && !location)) {
      throw new ValidationError("date_range_start, date_range_end, and created_by are required; scope values must be valid strings");
    }
    if (end < start) throw new ValidationError("date_range_end must be on or after date_range_start");

    const existing = await this.db.query<{ id: string }>(`
      SELECT id FROM audit_cycles
      WHERE status <> 'closed'
        AND scope_department_id IS NOT DISTINCT FROM $1
        AND scope_location IS NOT DISTINCT FROM $2
        AND daterange(date_range_start, date_range_end, '[]')
          && daterange($3::date, $4::date, '[]')
      LIMIT 1
    `, [departmentId, location, start, end]);
    if (existing.rows.length > 0) {
      throw new BusinessConflictError("AUDIT_CYCLE_EXISTS", "An active audit cycle already covers this scope and date range.", { audit_cycle_id: existing.rows[0].id });
    }

    const { rows } = await this.db.query<AuditCycleRow>(`
      INSERT INTO audit_cycles (id, scope_department_id, scope_location, date_range_start, date_range_end, status, created_by)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'draft', $5)
      RETURNING *
    `, [departmentId, location, start, end, createdBy]);
    return { audit_cycle: rows[0] };
  }

  async assignAuditors(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const auditorIds = Array.isArray(input.auditor_ids) ? input.auditor_ids : [];
    if (auditorIds.length === 0 || auditorIds.some((auditorId) => !stringValue(auditorId))) {
      throw new ValidationError("auditor_ids must contain at least one valid user id");
    }

    return this.db.transaction(async (client) => {
      const { rows: cycleRows } = await client.query<AuditCycleRow>("SELECT * FROM audit_cycles WHERE id = $1 FOR UPDATE", [id]);
      if (cycleRows.length === 0) throw new ValidationError("Audit cycle not found");
      if (cycleRows[0].status === "closed") throw new BusinessConflictError("AUDIT_CYCLE_CLOSED", "Closed audit cycles cannot receive new auditors.");

      const assignments = [];
      for (const rawAuditorId of auditorIds) {
        const auditorId = stringValue(rawAuditorId)!;
        const user = await client.query<{ id: string }>("SELECT id FROM users WHERE id = $1", [auditorId]);
        if (user.rows.length === 0) throw new ValidationError("Auditor user was not found", { auditor_id: auditorId });
        const existing = await client.query("SELECT 1 FROM audit_assignments WHERE audit_cycle_id = $1 AND auditor_id = $2", [id, auditorId]);
        if (existing.rows.length > 0) {
          throw new BusinessConflictError("AUDITOR_ALREADY_ASSIGNED", "That auditor is already assigned to this audit cycle.", { auditor_id: auditorId });
        }
        const { rows } = await client.query(`
          INSERT INTO audit_assignments (id, audit_cycle_id, auditor_id)
          VALUES (gen_random_uuid(), $1, $2)
          RETURNING *
        `, [id, auditorId]);
        assignments.push(rows[0]);
      }
      return { assignments };
    });
  }

  async updateFindings(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const rawFindings = Array.isArray(input.findings)
      ? input.findings
      : [{ asset_id: input.asset_id, result: input.result, notes: input.notes }];
    const userId = stringValue(input.user_id);
    const userRole = stringValue(input.user_role);
    if (!userId || !userRole || rawFindings.length === 0) throw new ValidationError("findings, user_id, and user_role are required");

    return this.db.transaction(async (client) => {
      const { rows: cycleRows } = await client.query<AuditCycleRow>("SELECT * FROM audit_cycles WHERE id = $1 FOR UPDATE", [id]);
      if (cycleRows.length === 0) throw new ValidationError("Audit cycle not found");
      const cycle = cycleRows[0];
      if (cycle.status === "closed") throw new BusinessConflictError("AUDIT_CYCLE_CLOSED", "Closed audit cycles cannot be edited.");

      let authorized = userRole === "admin" || userRole === "asset_manager";
      if (!authorized) {
        const assignment = await client.query("SELECT 1 FROM audit_assignments WHERE audit_cycle_id = $1 AND auditor_id = $2", [id, userId]);
        authorized = assignment.rows.length > 0;
      }
      if (!authorized) throw new AuthorizationError("User is not authorized to update findings for this audit cycle");

      const findings: AuditFindingRow[] = [];
      for (const rawFinding of rawFindings) {
        if (!rawFinding || typeof rawFinding !== "object") throw new ValidationError("Each finding must be an object");
        const finding = rawFinding as Record<string, unknown>;
        const assetId = stringValue(finding.asset_id);
        const result = stringValue(finding.result);
        const notes = finding.notes == null ? null : stringValue(finding.notes);
        if (!assetId || !result || !auditResults.has(result) || (finding.notes != null && notes == null)) {
          throw new ValidationError("Each finding requires an asset_id and result of verified, missing, or damaged");
        }

        const asset = await client.query<{ id: string; location: string }>("SELECT id, location FROM assets WHERE id = $1", [assetId]);
        if (asset.rows.length === 0) throw new ValidationError("Asset was not found", { asset_id: assetId });
        if (cycle.scope_location && asset.rows[0].location !== cycle.scope_location) {
          throw new BusinessConflictError("AUDIT_ASSET_OUT_OF_SCOPE", "The asset is outside this audit cycle's location scope.", { asset_id: assetId, scope_location: cycle.scope_location });
        }

        const { rows } = await client.query<AuditFindingRow>(`
          INSERT INTO audit_findings (id, audit_cycle_id, asset_id, result, notes)
          VALUES (gen_random_uuid(), $1, $2, $3, $4)
          ON CONFLICT (audit_cycle_id, asset_id)
          DO UPDATE SET result = EXCLUDED.result, notes = EXCLUDED.notes
          RETURNING *
        `, [id, assetId, result, notes]);
        findings.push(rows[0]);
      }
      return { findings, finding: findings[0] };
    });
  }

  async close(id: Identifier, input: JsonRecord): Promise<JsonRecord> {
    const closedBy = stringValue(input.closed_by);
    if (input.confirmation !== true || !closedBy) throw new ValidationError("confirmation: true and closed_by are required to close an audit cycle");

    return this.db.transaction(async (client) => {
      const { rows: cycleRows } = await client.query<AuditCycleRow>("SELECT * FROM audit_cycles WHERE id = $1 FOR UPDATE", [id]);
      if (cycleRows.length === 0) throw new ValidationError("Audit cycle not found");
      const cycle = cycleRows[0];
      if (cycle.status === "closed") throw new TransitionError("AuditCycle", "closed", "closed");
      if (cycle.status !== "active") throw new BusinessConflictError("INVALID_AUDIT_STATE", "Only active audit cycles can be closed.", { status: cycle.status });

      const scopedAssets = await client.query<{ id: string }>(`
        SELECT id FROM assets
        WHERE ($1::text IS NULL OR location = $1)
      `, [cycle.scope_location]);
      const { rows: findingRows } = await client.query<AuditFindingRow>("SELECT * FROM audit_findings WHERE audit_cycle_id = $1", [id]);
      const scopedIds = new Set(scopedAssets.rows.map((asset) => asset.id));
      const scopedFindings = findingRows.filter((finding) => scopedIds.has(finding.asset_id));
      if (scopedFindings.length < scopedAssets.rows.length) {
        throw new ValidationError("Every asset in the audit scope must have a finding before closure", {
          scoped_assets: scopedAssets.rows.length,
          findings: scopedFindings.length,
        });
      }

      await client.query("UPDATE audit_cycles SET status = 'closed' WHERE id = $1", [id]);
      const missingIds = scopedFindings.filter((finding) => finding.result === "missing").map((finding) => finding.asset_id);
      const lostAssets = missingIds.length === 0
        ? []
        : (await client.query(`UPDATE assets SET status = 'lost' WHERE id = ANY($1::uuid[]) RETURNING *`, [missingIds])).rows;
      const discrepancySummary = summary(scopedFindings);

      await client.query(`
        INSERT INTO activity_log (id, actor_id, action, entity_type, entity_id, metadata)
        VALUES (gen_random_uuid(), $1, 'close', 'AuditCycle', $2, $3)
      `, [closedBy, id, JSON.stringify({ lost_assets_count: lostAssets.length })]);
      await client.query(`
        INSERT INTO notifications (id, user_id, type, message)
        SELECT gen_random_uuid(), id, 'audit_closed', 'Audit cycle closed with ' || $1 || ' lost assets'
        FROM users WHERE role IN ('admin', 'asset_manager')
      `, [lostAssets.length]);

      return {
        audit_cycle: { ...cycle, status: "closed" },
        assets_marked_lost: lostAssets,
        discrepancy_summary: discrepancySummary,
      };
    });
  }

  async discrepancyReport(id: Identifier, _query?: Query): Promise<JsonRecord> {
    const { rows: cycleRows } = await this.db.query<AuditCycleRow>("SELECT * FROM audit_cycles WHERE id = $1", [id]);
    if (cycleRows.length === 0) throw new ValidationError("Audit cycle not found");
    const { rows: findings } = await this.db.query<AuditFindingRow>("SELECT * FROM audit_findings WHERE audit_cycle_id = $1 ORDER BY asset_id", [id]);
    return { audit_cycle: cycleRows[0], findings, summary: summary(findings) };
  }
}
