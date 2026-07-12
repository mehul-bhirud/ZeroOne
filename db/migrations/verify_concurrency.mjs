import { randomUUID } from "node:crypto";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required for the concurrency proof.");
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectBlockedInsert({ first, second, firstInsert, secondInsert, expectedCode, expectedConstraint }) {
  await first.query("BEGIN");
  await second.query("BEGIN");
  await first.query(firstInsert);

  const losingInsert = second.query(secondInsert)
    .then(() => ({ ok: true }))
    .catch((error) => ({ ok: false, error }));

  await sleep(100);
  await first.query("COMMIT");
  const result = await losingInsert;
  await second.query("ROLLBACK");

  assert(!result.ok, `expected the competing write to fail with ${expectedCode}`);
  assert(result.error.code === expectedCode, `expected ${expectedCode}, got ${result.error.code}`);
  assert(result.error.constraint === expectedConstraint, `expected ${expectedConstraint}, got ${result.error.constraint}`);
}

const owner = new Client({ connectionString });
const allocationFirst = new Client({ connectionString });
const allocationSecond = new Client({ connectionString });
const bookingFirst = new Client({ connectionString });
const bookingSecond = new Client({ connectionString });

const categoryId = randomUUID();
const userId = randomUUID();
const allocationAssetId = randomUUID();
const bookingAssetId = randomUUID();
const allocationId = randomUUID();
const competingAllocationId = randomUUID();
const bookingId = randomUUID();
const competingBookingId = randomUUID();

try {
  await Promise.all([owner, allocationFirst, allocationSecond, bookingFirst, bookingSecond].map((client) => client.connect()));

  await owner.query(
    "INSERT INTO asset_categories (id, name, custom_fields) VALUES ($1, $2, '{}'::jsonb)",
    [categoryId, `Concurrency ${categoryId}`],
  );
  await owner.query(
    "INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)",
    [userId, "Concurrency User", `${categoryId}@example.test`, "test-only-password-hash"],
  );
  await owner.query(
    "INSERT INTO assets (id, name, category_id, serial_number, acquisition_date, condition, location) VALUES ($1, $2, $3, $4, CURRENT_DATE, 'good', 'Concurrency Lab'), ($5, $6, $3, $7, CURRENT_DATE, 'good', 'Concurrency Lab')",
    [allocationAssetId, "Allocation Race Asset", categoryId, `ALLOC-${categoryId}`, bookingAssetId, "Booking Race Asset", `BOOK-${categoryId}`],
  );

  await expectBlockedInsert({
    first: allocationFirst,
    second: allocationSecond,
    firstInsert: {
      text: "INSERT INTO allocations (id, asset_id, holder_type, holder_id, expected_return_date) VALUES ($1, $2, 'user', $3, CURRENT_DATE + 7)",
      values: [allocationId, allocationAssetId, userId],
    },
    secondInsert: {
      text: "INSERT INTO allocations (id, asset_id, holder_type, holder_id, expected_return_date) VALUES ($1, $2, 'user', $3, CURRENT_DATE + 14)",
      values: [competingAllocationId, allocationAssetId, userId],
    },
    expectedCode: "23505",
    expectedConstraint: "allocations_one_active_per_asset_idx",
  });
  console.log("allocation concurrency: one committed, loser 23505 allocations_one_active_per_asset_idx");

  await expectBlockedInsert({
    first: bookingFirst,
    second: bookingSecond,
    firstInsert: {
      text: "INSERT INTO bookings (id, asset_id, booked_by, start_time, end_time) VALUES ($1, $2, $3, '2035-01-01 09:00+00', '2035-01-01 10:00+00')",
      values: [bookingId, bookingAssetId, userId],
    },
    secondInsert: {
      text: "INSERT INTO bookings (id, asset_id, booked_by, start_time, end_time) VALUES ($1, $2, $3, '2035-01-01 09:30+00', '2035-01-01 10:30+00')",
      values: [competingBookingId, bookingAssetId, userId],
    },
    expectedCode: "23P01",
    expectedConstraint: "bookings_no_active_overlap_excl",
  });
  console.log("booking concurrency: one committed, loser 23P01 bookings_no_active_overlap_excl");
} finally {
  try {
    await Promise.allSettled([
      allocationFirst.query("ROLLBACK"),
      allocationSecond.query("ROLLBACK"),
      bookingFirst.query("ROLLBACK"),
      bookingSecond.query("ROLLBACK"),
    ]);
    await owner.query("DELETE FROM bookings WHERE id = ANY($1::uuid[])", [[bookingId, competingBookingId]]);
    await owner.query("DELETE FROM allocations WHERE id = ANY($1::uuid[])", [[allocationId, competingAllocationId]]);
    await owner.query("DELETE FROM assets WHERE id = ANY($1::uuid[])", [[allocationAssetId, bookingAssetId]]);
    await owner.query("DELETE FROM users WHERE id = $1", [userId]);
    await owner.query("DELETE FROM asset_categories WHERE id = $1", [categoryId]);
  } finally {
    await Promise.allSettled([owner.end(), allocationFirst.end(), allocationSecond.end(), bookingFirst.end(), bookingSecond.end()]);
  }
}
