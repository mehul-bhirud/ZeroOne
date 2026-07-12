import { exec, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Client } = pg;
const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationRoot = path.dirname(fileURLToPath(import.meta.url));
const baseConnectionString = process.env.MIGRATION_DATABASE_URL
  ?? process.env.DATABASE_URL
  ?? "postgres://assetflow:assetflow@localhost:5432/assetflow";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function databaseUrlFor(name) {
  const url = new URL(baseConnectionString);
  url.pathname = `/${name}`;
  return url.toString();
}

async function runSqlFile(client, filename) {
  console.log(`running ${filename}`);
  await client.query(await readFile(path.join(migrationRoot, filename), "utf8"));
}

async function runSeed(databaseUrl) {
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    MIGRATION_DATABASE_URL: databaseUrl,
    SEED_ALLOW_RESET: "true",
    SEED_DEMO_PASSWORD: "AssetFlow-Database-Proof-2026!",
  };
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = await execAsync(`${npmCommand} run db:seed`, { cwd: repoRoot, env, maxBuffer: 10 * 1024 * 1024 });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  const verify = await execAsync(`${npmCommand} run db:seed:verify`, { cwd: repoRoot, env, maxBuffer: 10 * 1024 * 1024 });
  process.stdout.write(verify.stdout);
  process.stderr.write(verify.stderr);
}

async function inspectCatalog(client) {
  const indexes = (await client.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")).rows.map((row) => row.indexname);
  for (const required of [
    "asset_categories_custom_fields_gin",
    "allocations_one_active_per_asset_idx",
    "bookings_no_active_overlap_excl",
  ]) {
    assert(indexes.includes(required), `missing required index/constraint index ${required}`);
  }

  const constraints = (await client.query("SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace")).rows.map((row) => row.conname);
  for (const required of [
    "bookings_valid_time_range_ck",
    "audit_cycles_valid_date_range_ck",
    "assets_acquisition_cost_nonnegative_ck",
    "allocations_returned_after_allocated_ck",
  ]) {
    assert(constraints.includes(required), `missing required constraint ${required}`);
  }

  const triggers = (await client.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal")).rows.map((row) => row.tgname);
  for (const required of ["activity_log_append_only", "users_exit_clearance_guard_trg"]) {
    assert(triggers.includes(required), `missing required trigger ${required}`);
  }
  const exitClearanceFunction = (await client.query("SELECT pg_get_functiondef('enforce_user_exit_clearance()'::regprocedure) AS definition")).rows[0].definition;
  assert(exitClearanceFunction.includes("users_exit_clearance_required"), "exit-clearance trigger does not preserve its locked constraint diagnostic");

  const roles = (await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'assetflow_app'")).rowCount;
  assert(roles === 1, "assetflow_app role is missing");

  const views = (await client.query("SELECT viewname FROM pg_views WHERE schemaname = 'public'")).rows.map((row) => row.viewname);
  for (const required of [
    "v_ghost_risk",
    "v_utilization",
    "v_maintenance_frequency",
    "v_department_allocation_summary",
    "v_booking_heatmap",
    "v_dashboard_kpis",
  ]) {
    assert(views.includes(required), `missing analytics view ${required}`);
  }

  const counts = {
    ghostRisk: Number((await client.query("SELECT count(*) AS count FROM v_ghost_risk")).rows[0].count),
    utilization: Number((await client.query("SELECT count(*) AS count FROM v_utilization")).rows[0].count),
    maintenance: Number((await client.query("SELECT count(*) AS count FROM v_maintenance_frequency")).rows[0].count),
    departments: Number((await client.query("SELECT count(*) AS count FROM v_department_allocation_summary")).rows[0].count),
    heatmap: Number((await client.query("SELECT count(*) AS count FROM v_booking_heatmap")).rows[0].count),
    dashboard: Number((await client.query("SELECT count(*) AS count FROM v_dashboard_kpis")).rows[0].count),
  };
  assert(counts.ghostRisk > 0, "v_ghost_risk is empty after seeding");
  assert(counts.utilization === 18, `expected 18 utilization rows, got ${counts.utilization}`);
  assert(counts.maintenance === 18, `expected 18 maintenance rows, got ${counts.maintenance}`);
  assert(counts.departments === 4, `expected 4 department summary rows, got ${counts.departments}`);
  assert(counts.heatmap > 0, "v_booking_heatmap is empty after seeding");
  assert(counts.dashboard === 1, `expected one dashboard KPI row, got ${counts.dashboard}`);
  console.log(`catalog and analytics proof passed: ghost=${counts.ghostRisk}, heatmap=${counts.heatmap}, dashboard=${counts.dashboard}`);
}

const databaseName = `assetflow_verify_${randomUUID().replaceAll("-", "")}`;
const adminUrl = new URL(baseConnectionString);
adminUrl.pathname = "/postgres";
const targetUrl = databaseUrlFor(databaseName);
let admin;
let target;

try {
  admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  console.log(`created throwaway database ${databaseName}`);

  target = new Client({ connectionString: targetUrl });
  await target.connect();
  for (const migration of [
    "001_extensions.sql",
    "002_schema_v0.sql",
    "003_canonical_constraints.sql",
    "004_activity_log_append_only.sql",
    "005_analytics_views.sql",
    "006_exit_clearance.sql",
  ]) {
    await runSqlFile(target, migration);
  }

  await runSqlFile(target, "verify_003_constraints.sql");
  await target.query("ALTER SEQUENCE asset_tag_seq RESTART WITH 1");
  console.log("reset sequence after rollback-only verifier so the seed proves AF-0001 on a clean fixture");

  await runSeed(targetUrl);
  const rbac = await execFileAsync(process.execPath, [path.join(migrationRoot, "verify_rbac_smoke.mjs")], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: targetUrl, MIGRATION_DATABASE_URL: targetUrl },
    maxBuffer: 10 * 1024 * 1024,
  });
  process.stdout.write(rbac.stdout);
  process.stderr.write(rbac.stderr);
  for (const verifier of [
    "verify_004_activity_log.sql",
    "verify_005_analytics_views.sql",
    "verify_006_exit_clearance.sql",
  ]) {
    await runSqlFile(target, verifier);
  }
  await inspectCatalog(target);
  await target.end();
  target = undefined;

  const concurrency = await execFileAsync(process.execPath, [path.join(migrationRoot, "verify_concurrency.mjs")], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: targetUrl, MIGRATION_DATABASE_URL: targetUrl },
    maxBuffer: 10 * 1024 * 1024,
  });
  process.stdout.write(concurrency.stdout);
  process.stderr.write(concurrency.stderr);
  console.log(`clean migration, seed, catalog, and concurrency proof passed for ${databaseName}`);
} finally {
  await target?.end().catch(() => undefined);
  if (admin) {
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1", [databaseName]).catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`).catch((error) => {
      console.error(`failed to drop throwaway database ${databaseName}: ${error.message}`);
      process.exitCode = 1;
    });
    await admin.end();
  }
}
