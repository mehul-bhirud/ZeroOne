import { Pool, type PoolClient } from "pg";
import { hashPassword } from "../../auth/password";

export const expectedSeedCounts = {
  departments: 4,
  users: 8,
  asset_categories: 5,
  assets: 18,
  allocations: 5,
  transfer_requests: 2,
  bookings: 6,
  maintenance_requests: 6,
  audit_cycles: 2,
  audit_assignments: 3,
  audit_findings: 6,
  notifications: 8,
  activity_log: 20,
} as const;

const ids = {
  departments: ["10000000-0000-0000-0000-000000000001", "10000000-0000-0000-0000-000000000002", "10000000-0000-0000-0000-000000000003", "10000000-0000-0000-0000-000000000004"],
  users: ["20000000-0000-0000-0000-000000000001", "20000000-0000-0000-0000-000000000002", "20000000-0000-0000-0000-000000000003", "20000000-0000-0000-0000-000000000004", "20000000-0000-0000-0000-000000000005", "20000000-0000-0000-0000-000000000006", "20000000-0000-0000-0000-000000000007", "20000000-0000-0000-0000-000000000008"],
  categories: ["30000000-0000-0000-0000-000000000001", "30000000-0000-0000-0000-000000000002", "30000000-0000-0000-0000-000000000003", "30000000-0000-0000-0000-000000000004", "30000000-0000-0000-0000-000000000005"],
  assets: Array.from({ length: 18 }, (_, index) => `40000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`),
} as const;

const departments = [
  { id: ids.departments[0], name: "Operations", status: "active" },
  { id: ids.departments[1], name: "Information Technology", status: "active" },
  { id: ids.departments[2], name: "Facilities", status: "active" },
  { id: ids.departments[3], name: "Engineering", status: "active" },
];

const users = [
  { id: ids.users[0], name: "Aarav Mehta", email: "admin@assetflow.local", role: "admin", department_id: ids.departments[0] },
  { id: ids.users[1], name: "Nisha Rao", email: "manager@assetflow.local", role: "asset_manager", department_id: ids.departments[1] },
  { id: ids.users[2], name: "Priya Shah", email: "priya@assetflow.local", role: "department_head", department_id: ids.departments[1] },
  { id: ids.users[3], name: "Kabir Singh", email: "kabir@assetflow.local", role: "department_head", department_id: ids.departments[0] },
  { id: ids.users[4], name: "Meera Iyer", email: "meera@assetflow.local", role: "employee", department_id: ids.departments[1] },
  { id: ids.users[5], name: "Rohan Das", email: "rohan@assetflow.local", role: "employee", department_id: ids.departments[0] },
  { id: ids.users[6], name: "Ishita Verma", email: "ishita@assetflow.local", role: "employee", department_id: ids.departments[3] },
  { id: ids.users[7], name: "Arjun Nair", email: "arjun@assetflow.local", role: "employee", department_id: ids.departments[2] },
];

const categories = [
  { id: ids.categories[0], name: "Computing", custom_fields: { vendor: "Acme", warranty_years: 3 } },
  { id: ids.categories[1], name: "AV Equipment", custom_fields: { vendor: "Lumina", resolution: "4K" } },
  { id: ids.categories[2], name: "Furniture", custom_fields: { material: "recycled steel" } },
  { id: ids.categories[3], name: "Network", custom_fields: { managed: true, rack_units: 2 } },
  { id: ids.categories[4], name: "Mobile Devices", custom_fields: { carrier: "unlocked" } },
];

const assets = [
  ["Operations Laptop", 0, "allocated", false, 10], ["Design Laptop", 0, "allocated", false, 5], ["Field Tablet", 4, "allocated", false, 3],
  ["Hot Desk Monitor", 1, "available", true, 7], ["Ergonomic Chair", 2, "available", false, 4], ["Conference Display", 1, "reserved", true, 2],
  ["Training Room Projector", 1, "reserved", true, 1], ["Network Switch", 3, "under_maintenance", false, 20], ["Server Rack UPS", 3, "under_maintenance", false, 35],
  ["Retired Laptop A", 0, "lost", false, 140], ["Retired Laptop B", 0, "lost", false, 180], ["Old Desk", 2, "retired", false, 120],
  ["Old Projector", 1, "retired", false, 150], ["Disposed Printer", 1, "disposed", false, 210], ["Disposed Phone", 4, "disposed", false, 240],
  ["Audit Candidate Laptop", 0, "available", false, 120], ["Ghost Risk Monitor", 1, "available", true, 180], ["Ghost Risk Tablet", 4, "available", true, 365],
].map(([name, categoryIndex, status, isBookable, verifiedDaysAgo], index) => ({
  id: ids.assets[index],
  name: name as string,
  category_id: ids.categories[categoryIndex as number],
  serial_number: `AF-DEMO-${String(index + 1).padStart(3, "0")}`,
  status: status as string,
  is_bookable: isBookable as boolean,
  verifiedDaysAgo: verifiedDaysAgo as number,
}));

const daysFrom = (now: Date, days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
const hoursFrom = (now: Date, hours: number) => new Date(now.getTime() + hours * 60 * 60 * 1000);

function requireSeedConfig(env: NodeJS.ProcessEnv): { connectionString: string; password: string } {
  if (env.SEED_ALLOW_RESET !== "true") throw new Error("Refusing destructive seed: set SEED_ALLOW_RESET=true for a development database.");
  const connectionString = env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required for seeding.");
  const url = new URL(connectionString);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const productionLikeName = /(^|[_-])(prod|production|stage|staging)([_-]|$)/i.test(databaseName);
  if (!databaseName || !['localhost', '127.0.0.1', '::1'].includes(url.hostname) || /^(postgres|template0|template1)$/i.test(databaseName) || productionLikeName) {
    throw new Error("Refusing destructive seed outside a local development database.");
  }
  const password = env.SEED_DEMO_PASSWORD ?? "";
  if (password.length < 12 || password === "replace-with-a-development-only-password") {
    throw new Error("SEED_DEMO_PASSWORD must be a non-placeholder development password of at least 12 characters.");
  }
  return { connectionString, password };
}

async function insertFixtures(client: PoolClient, now: Date, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  for (const department of departments) {
    await client.query("INSERT INTO departments (id, name, status) VALUES ($1, $2, $3)", [department.id, department.name, department.status]);
  }
  for (const user of users) {
    await client.query("INSERT INTO users (id, name, email, password_hash, role, department_id, status) VALUES ($1, $2, $3, $4, $5, $6, 'active')", [user.id, user.name, user.email, passwordHash, user.role, user.department_id]);
  }
  await client.query("UPDATE departments SET head_user_id = $1 WHERE id = $2", [ids.users[3], ids.departments[0]]);
  await client.query("UPDATE departments SET head_user_id = $1 WHERE id = $2", [ids.users[2], ids.departments[1]]);
  for (const category of categories) {
    await client.query("INSERT INTO asset_categories (id, name, custom_fields) VALUES ($1, $2, $3::jsonb)", [category.id, category.name, JSON.stringify(category.custom_fields)]);
  }
  for (const asset of assets) {
    await client.query("INSERT INTO assets (id, name, category_id, serial_number, acquisition_date, acquisition_cost, condition, location, is_bookable, status, last_verified_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)", [asset.id, asset.name, asset.category_id, asset.serial_number, daysFrom(now, -400), 500 + assets.indexOf(asset) * 125, "good", asset.name.includes("Desk") ? "Floor 2" : "HQ", asset.is_bookable, asset.status, daysFrom(now, -asset.verifiedDaysAgo)]);
  }
  const allocations = [
    ["50000000-0000-0000-0000-000000000001", ids.assets[0], ids.users[4], -20, -10, null],
    ["50000000-0000-0000-0000-000000000002", ids.assets[1], ids.users[6], -15, 3, null],
    ["50000000-0000-0000-0000-000000000003", ids.assets[2], ids.users[6], -8, null, null],
    ["50000000-0000-0000-0000-000000000004", ids.assets[3], ids.users[4], -60, -50, -50],
    ["50000000-0000-0000-0000-000000000005", ids.assets[4], ids.users[5], -70, -65, -65],
  ];
  for (const [id, assetId, holderId, allocatedDays, expectedReturnDays, returnedDays] of allocations) {
    await client.query("INSERT INTO allocations (id, asset_id, holder_type, holder_id, expected_return_date, allocated_at, returned_at, return_condition_notes) VALUES ($1, $2, 'user', $3, $4, $5, $6, $7)", [id, assetId, holderId, expectedReturnDays === null ? null : daysFrom(now, expectedReturnDays as number), daysFrom(now, allocatedDays as number), returnedDays === null ? null : daysFrom(now, returnedDays as number), returnedDays === null ? null : "Returned in good condition"]);
  }
  await client.query("INSERT INTO transfer_requests (id, asset_id, from_holder, to_holder, status, requested_by, approved_by) VALUES ($1, $2, $3::jsonb, $4::jsonb, 'pending', $5, NULL), ($6, $7, $8::jsonb, $9::jsonb, 'approved', $10, $11)", ["60000000-0000-0000-0000-000000000001", ids.assets[0], JSON.stringify({ type: "user", id: ids.users[4] }), JSON.stringify({ type: "user", id: ids.users[5] }), ids.users[4], "60000000-0000-0000-0000-000000000002", ids.assets[1], JSON.stringify({ type: "user", id: ids.users[5] }), JSON.stringify({ type: "user", id: ids.users[6] }), ids.users[5], ids.users[1]]);
  const tomorrow = daysFrom(now, 1); tomorrow.setUTCHours(9, 0, 0, 0);
  const bookings = [
    ["70000000-0000-0000-0000-000000000001", ids.assets[5], ids.users[2], "upcoming", tomorrow, new Date(tomorrow.getTime() + 60 * 60 * 1000)],
    ["70000000-0000-0000-0000-000000000002", ids.assets[5], ids.users[3], "upcoming", new Date(tomorrow.getTime() + 60 * 60 * 1000), new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000)],
    ["70000000-0000-0000-0000-000000000003", ids.assets[6], ids.users[4], "ongoing", hoursFrom(now, -0.5), hoursFrom(now, 0.5)],
    ["70000000-0000-0000-0000-000000000004", ids.assets[16], ids.users[5], "upcoming", daysFrom(now, 2), daysFrom(now, 2.04)],
    ["70000000-0000-0000-0000-000000000005", ids.assets[17], ids.users[6], "completed", daysFrom(now, -7), daysFrom(now, -6.96)],
    ["70000000-0000-0000-0000-000000000006", ids.assets[3], ids.users[7], "cancelled", daysFrom(now, 3), daysFrom(now, 3.04)],
  ];
  for (const [id, assetId, bookedBy, status, start, end] of bookings) {
    await client.query("INSERT INTO bookings (id, asset_id, booked_by, start_time, end_time, status) VALUES ($1, $2, $3, $4, $5, $6)", [id, assetId, bookedBy, start, end, status]);
  }
  const maintenanceStatuses = ["pending", "approved", "rejected", "technician_assigned", "in_progress", "resolved"];
  const maintenanceAssetIndexes = [3, 4, 5, 7, 8, 17];
  for (let index = 0; index < maintenanceStatuses.length; index += 1) {
    await client.query("INSERT INTO maintenance_requests (id, asset_id, raised_by, issue_description, priority, status, technician) VALUES ($1, $2, $3, $4, $5, $6, $7)", [`80000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`, ids.assets[maintenanceAssetIndexes[index]], ids.users[(index % 4) + 4], `Seeded maintenance issue ${index + 1}`, index < 2 ? "high" : "medium", maintenanceStatuses[index], index >= 3 ? "Technician Demo" : null]);
  }
  await client.query("INSERT INTO audit_cycles (id, scope_department_id, scope_location, date_range_start, date_range_end, status, created_by) VALUES ($1, $2, 'HQ', $3, $4, 'active', $5), ($6, $7, 'HQ', $8, $9, 'closed', $10)", ["90000000-0000-0000-0000-000000000001", ids.departments[1], daysFrom(now, -1), daysFrom(now, 30), ids.users[0], "90000000-0000-0000-0000-000000000002", ids.departments[0], daysFrom(now, -60), daysFrom(now, -30), ids.users[0]]);
  await client.query("INSERT INTO audit_assignments (id, audit_cycle_id, auditor_id) VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)", ["91000000-0000-0000-0000-000000000001", "90000000-0000-0000-0000-000000000001", ids.users[1], "91000000-0000-0000-0000-000000000002", "90000000-0000-0000-0000-000000000001", ids.users[2], "91000000-0000-0000-0000-000000000003", "90000000-0000-0000-0000-000000000002", ids.users[3]]);
  await client.query("INSERT INTO audit_findings (id, audit_cycle_id, asset_id, result, notes) VALUES ($1, $2, $3, 'missing', 'Seeded Ghost Radar discrepancy'), ($4, $5, $6, 'damaged', 'Cosmetic damage'), ($7, $8, $9, 'verified', 'Verified by auditor'), ($10, $11, $12, 'missing', 'Closed-cycle loss'), ($13, $14, $15, 'verified', 'Verified at close'), ($16, $17, $18, 'damaged', 'Closed-cycle damage')", ["92000000-0000-0000-0000-000000000001", "90000000-0000-0000-0000-000000000001", ids.assets[15], "92000000-0000-0000-0000-000000000002", "90000000-0000-0000-0000-000000000001", ids.assets[16], "92000000-0000-0000-0000-000000000003", "90000000-0000-0000-0000-000000000001", ids.assets[17], "92000000-0000-0000-0000-000000000004", "90000000-0000-0000-0000-000000000002", ids.assets[9], "92000000-0000-0000-0000-000000000005", "90000000-0000-0000-0000-000000000002", ids.assets[10], "92000000-0000-0000-0000-000000000006", "90000000-0000-0000-0000-000000000002", ids.assets[11]]);
  for (let index = 0; index < 8; index += 1) {
    await client.query("INSERT INTO notifications (id, user_id, type, message, read) VALUES ($1, $2, $3, $4, $5)", [`93000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`, ids.users[index % users.length], index % 2 === 0 ? "allocation" : "audit", index % 2 === 0 ? "A seeded asset is awaiting custody review." : "A seeded audit finding needs attention.", index > 4]);
  }
  for (let index = 0; index < expectedSeedCounts.activity_log; index += 1) {
    await client.query("INSERT INTO activity_log (id, actor_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)", [`95000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`, users[index % users.length].id, index % 2 === 0 ? "asset.updated" : "allocation.created", index % 2 === 0 ? "Asset" : "Allocation", index % 2 === 0 ? ids.assets[index % assets.length] : `50000000-0000-0000-0000-00000000000${(index % 5) + 1}`, JSON.stringify({ occurred_at: hoursFrom(now, -index).toISOString(), source: "seed" })]);
  }
}

export async function assertSeed(client: PoolClient): Promise<Record<string, number>> {
  const summary: Record<string, number> = {};
  for (const [table, expected] of Object.entries(expectedSeedCounts)) {
    const result = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`);
    const count = Number(result.rows[0].count);
    if (count !== expected) throw new Error(`Seed verification failed for ${table}: expected ${expected}, got ${count}.`);
    summary[table] = count;
  }
  const statusCount = await client.query<{ count: string }>("SELECT count(DISTINCT status)::text AS count FROM assets");
  if (Number(statusCount.rows[0].count) !== 7) throw new Error("Seed verification failed: all seven asset statuses are required.");
  const ghostCount = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM assets WHERE last_verified_at <= now() - interval '90 days'");
  if (Number(ghostCount.rows[0].count) < 4) throw new Error("Seed verification failed: Ghost Radar needs at least four stale assets.");
  const overdueCount = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM allocations WHERE returned_at IS NULL AND expected_return_date < CURRENT_DATE");
  if (Number(overdueCount.rows[0].count) < 1) throw new Error("Seed verification failed: an overdue allocation is required.");
  const missingCount = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM audit_findings WHERE result = 'missing' AND audit_cycle_id = '90000000-0000-0000-0000-000000000001'");
  if (Number(missingCount.rows[0].count) < 1) throw new Error("Seed verification failed: confirmed-missing audit data is required.");
  const tags = await client.query<{ asset_tag: string }>("SELECT asset_tag FROM assets ORDER BY id");
  const expectedTags = Array.from({ length: expectedSeedCounts.assets }, (_, index) => `AF-${String(index + 1).padStart(4, "0")}`);
  if (tags.rows.map((row) => row.asset_tag).join(",") !== expectedTags.join(",")) throw new Error("Seed verification failed: asset tags are not deterministic.");
  const activityIds = await client.query<{ id: string }>("SELECT id::text AS id FROM activity_log ORDER BY id");
  const expectedActivityIds = Array.from({ length: expectedSeedCounts.activity_log }, (_, index) => `95000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`);
  if (activityIds.rows.map((row) => row.id).join(",") !== expectedActivityIds.join(",")) throw new Error("Seed verification failed: ActivityLog IDs are not deterministic.");
  const inconsistentMaintenance = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM maintenance_requests m JOIN assets a ON a.id = m.asset_id WHERE m.status = 'resolved' AND a.status = 'under_maintenance'");
  if (Number(inconsistentMaintenance.rows[0].count) !== 0) throw new Error("Seed verification failed: resolved maintenance cannot leave an asset under maintenance.");
  const approvedTransfer = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM transfer_requests t JOIN allocations a ON a.asset_id = t.asset_id AND a.returned_at IS NULL WHERE t.status = 'approved' AND a.holder_id = (t.to_holder->>'id')::uuid");
  if (Number(approvedTransfer.rows[0].count) < 1) throw new Error("Seed verification failed: approved transfer custody does not match the destination holder.");
  return summary;
}

export async function runSeed(env: NodeJS.ProcessEnv = process.env): Promise<Record<string, number>> {
  const { connectionString, password } = requireSeedConfig(env);
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  const now = new Date();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('assetflow-seed-v1'))");
    await client.query("TRUNCATE TABLE activity_log, notifications, audit_findings, audit_assignments, audit_cycles, maintenance_requests, bookings, transfer_requests, allocations, assets, asset_categories, users, departments RESTART IDENTITY CASCADE");
    await insertFixtures(client, now, password);
    const summary = await assertSeed(client);
    await client.query("COMMIT");
    const probeStart = daysFrom(now, 1); probeStart.setUTCHours(9, 30, 0, 0);
    const probeEnd = new Date(probeStart.getTime() + 60 * 60 * 1000);
    console.log(JSON.stringify({ seed: "assetflow-v1", generated_at: now.toISOString(), counts: summary, overlap_probe: { asset_id: ids.assets[5], start_time: probeStart.toISOString(), end_time: probeEnd.toISOString(), expected: "BOOKING_OVERLAP" } }, null, 2));
    return summary;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("db/seed/index.ts")) {
  runSeed().catch((error) => { console.error(error); process.exitCode = 1; });
}
