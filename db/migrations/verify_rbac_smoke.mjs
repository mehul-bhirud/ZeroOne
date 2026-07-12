import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 34567;
const baseUrl = `http://127.0.0.1:${port}/api/v1`;
const password = "AssetFlow-Database-Proof-2026!";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer(child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`auth server exited before smoke test (code ${child.exitCode})`);
    try {
      const response = await fetch(`${baseUrl}/auth/me`);
      if (response.status === 401) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("auth server did not become ready within five seconds");
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  return { response, body };
}

const child = spawn(process.execPath, [
  path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"),
  path.join(repoRoot, "auth", "server.ts"),
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_PORT: String(port),
    JWT_SECRET: "assetflow-rbac-smoke-secret-longer-than-32-characters",
    JWT_ISSUER: "assetflow",
    JWT_AUDIENCE: "assetflow-api",
    JWT_TTL_SECONDS: "3600",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (chunk) => process.stdout.write(`[auth] ${chunk}`));
child.stderr.on("data", (chunk) => process.stderr.write(`[auth] ${chunk}`));

try {
  await waitForServer(child);
  const users = [
    ["admin@assetflow.local", "admin"],
    ["manager@assetflow.local", "asset_manager"],
    ["priya@assetflow.local", "department_head"],
    ["meera@assetflow.local", "employee"],
  ];
  const tokens = [];
  for (const [email, role] of users) {
    const login = await requestJson(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert(login.response.status === 200, `${role} login returned ${login.response.status}`);
    assert(login.body.user.role === role, `${email} returned role ${login.body.user.role}, expected ${role}`);
    const me = await requestJson(`${baseUrl}/auth/me`, {
      headers: { authorization: `Bearer ${login.body.access_token}` },
    });
    assert(me.response.status === 200 && me.body.user.role === role, `${role} /me smoke failed`);
    const assets = await requestJson(`${baseUrl}/assets`, {
      headers: { authorization: `Bearer ${login.body.access_token}` },
    });
    assert(assets.response.status === 200, `${role} asset read returned ${assets.response.status}`);
    tokens.push([role, login.body.access_token]);
  }

  const adminToken = tokens.find(([role]) => role === "admin")?.[1];
  const employeeToken = tokens.find(([role]) => role === "employee")?.[1];
  assert(adminToken && employeeToken, "RBAC smoke tokens were not created");
  for (const route of [
    "/departments",
    "/employees",
    "/transfer-requests",
    "/reports/utilization",
    "/reports/maintenance-frequency",
    "/reports/department-allocation-summary",
    "/reports/booking-heatmap",
    "/reports/ghost-risk",
    "/dashboard/kpis",
  ]) {
    const response = await fetch(`${baseUrl}${route}`, { headers: { authorization: `Bearer ${adminToken}` } });
    assert(response.status === 200, `${route} returned ${response.status}`);
  }
  const exportResponse = await fetch(`${baseUrl}/reports/export?report=ghost-risk&format=csv`, { headers: { authorization: `Bearer ${adminToken}` } });
  assert(exportResponse.status === 200 && (exportResponse.headers.get("content-type") ?? "").includes("text/csv"), "reports export route did not return CSV");
  const allocationProbe = await requestJson(`${baseUrl}/allocations`, {
    method: "POST",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: "{}",
  });
  assert(allocationProbe.response.status === 400, `allocation route validation returned ${allocationProbe.response.status}`);
  const transferProbe = await requestJson(`${baseUrl}/transfer-requests`, {
    method: "POST",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: "{}",
  });
  assert(transferProbe.response.status === 400, `transfer route validation returned ${transferProbe.response.status}`);
  const employeeAllocation = await requestJson(`${baseUrl}/allocations`, {
    method: "POST",
    headers: { authorization: `Bearer ${employeeToken}`, "content-type": "application/json" },
    body: "{}",
  });
  assert(employeeAllocation.response.status === 403, `employee allocation guard returned ${employeeAllocation.response.status}`);

  for (const [role, token] of tokens) {
    const cycle = await requestJson(`${baseUrl}/audit-cycles`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{}",
    });
    if (role === "admin") {
      assert(cycle.response.status !== 403, "admin was denied the admin-only audit-cycle route");
    } else {
      assert(cycle.response.status === 403, `${role} was not denied the admin-only audit-cycle route`);
    }
  }
  console.log("RBAC smoke passed: admin, asset_manager, department_head, and employee logged in; role-sensitive routes enforced");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 1000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
