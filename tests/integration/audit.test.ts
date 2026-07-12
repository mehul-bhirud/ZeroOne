import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, PoolClient } from "pg";
import { AuditService } from "../../services/audit-service";
import { createDatabaseClient, type DatabaseClient } from "../../services/db";

const adminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://assetflow:assetflow@localhost:5433/assetflow";
const migrationFiles = ["001_extensions.sql", "002_schema_v0.sql", "003_canonical_constraints.sql", "004_activity_log_append_only.sql"];
let databaseName: string;
let adminPool: Pool;
let pool: Pool;
let service: AuditService;
let dbClient: DatabaseClient;

describe("Audit Integration", () => {
  beforeAll(async () => {
    databaseName = `assetflow_audit_${randomUUID().replaceAll("-", "")}`;
    adminPool = new Pool({ connectionString: adminUrl });
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    const target = new URL(adminUrl);
    target.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: target.toString() });
    
    for (const migration of migrationFiles) {
      await pool.query(await readFile(resolve(process.cwd(), "db", "migrations", migration), "utf8"));
    }

    dbClient = createDatabaseClient(pool);

    service = new AuditService(dbClient);
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
    await adminPool?.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    await adminPool?.end();
  });

  it("closing an audit cycle marks confirmed-missing assets as Lost", async () => {
    // 1. Arrange: Create user, category, and two assets
    const adminId = randomUUID();
    const catId = randomUUID();
    const asset1Id = randomUUID();
    const asset2Id = randomUUID();
    
    await dbClient.query(`
      INSERT INTO users (id, name, email, password_hash, role, status)
      VALUES ($1, 'Admin', 'admin@test.com', 'hash', 'admin', 'active')
    `, [adminId]);
    
    await dbClient.query(`
      INSERT INTO asset_categories (id, name) VALUES ($1, 'Laptops')
    `, [catId]);

    await dbClient.query(`
      INSERT INTO assets (id, name, category_id, asset_tag, serial_number, acquisition_date, condition, location, status)
      VALUES 
      ($1, 'MacBook', $3, 'TAG-1', 'SN-1', '2026-01-01', 'good', 'HQ', 'available'),
      ($2, 'Dell', $3, 'TAG-2', 'SN-2', '2026-01-01', 'good', 'HQ', 'available')
    `, [asset1Id, asset2Id, catId]);

    // Create Audit Cycle
    const { audit_cycle } = await service.create({
      date_range_start: '2026-07-01',
      date_range_end: '2026-07-31',
      created_by: adminId,
    }) as { audit_cycle: { id: string } };
    await dbClient.query("UPDATE audit_cycles SET status = 'active' WHERE id = $1", [audit_cycle.id]);
    
    // Assign Auditor
    await service.assignAuditors(audit_cycle.id, {
      auditor_ids: [adminId]
    });

    // Mark asset1 as verified, asset2 as missing
    await service.updateFindings(audit_cycle.id, {
      asset_id: asset1Id,
      result: 'verified',
      user_id: adminId,
      user_role: 'admin'
    });

    await service.updateFindings(audit_cycle.id, {
      asset_id: asset2Id,
      result: 'missing',
      user_id: adminId,
      user_role: 'admin'
    });

    // 2. Act: Close cycle
    const result = await service.close(audit_cycle.id, {
      confirmation: true,
      closed_by: adminId
    }) as { audit_cycle: { status: string }; assets_marked_lost: Array<{ id: string }> };

    // 3. Assert: 
    expect(result.audit_cycle.status).toBe('closed');
    expect(result.assets_marked_lost.length).toBe(1);
    expect(result.assets_marked_lost[0].id).toBe(asset2Id);
    
    // Verify DB state
    const { rows: assets } = await dbClient.query(`SELECT id, status FROM assets ORDER BY asset_tag`);
    expect(assets.find(a => a.id === asset1Id)?.status).toBe('available');
    expect(assets.find(a => a.id === asset2Id)?.status).toBe('lost');
    
    // Verify Activity Log
    const { rows: logs } = await dbClient.query(`SELECT * FROM activity_log WHERE entity_id = $1`, [audit_cycle.id]);
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe('close');
    
    // Verify Notification
    const { rows: notifs } = await dbClient.query(`SELECT * FROM notifications`);
    expect(notifs.length).toBe(1);
    expect(notifs[0].message).toContain('1 lost assets');
  });
});
