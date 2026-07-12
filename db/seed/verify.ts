import { Pool } from "pg";
import { assertSeed } from "./index";

const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required.");

const pool = new Pool({ connectionString });
const client = await pool.connect();
try {
  const summary = await assertSeed(client);
  console.log(JSON.stringify({ verified: true, counts: summary }, null, 2));
} finally {
  client.release();
  await pool.end();
}
