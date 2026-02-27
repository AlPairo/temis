import { Pool } from "pg";
import { getDatabaseName, getTestPostgresAdminUrl, getTestPostgresUrl } from "./db-env.js";

const APP_TABLES = ["retrieval_events", "messages", "audit_events", "conversations", "users"];

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

export function createAdminPool(): Pool {
  return new Pool({
    connectionString: getTestPostgresAdminUrl()
  });
}

export function createTestDbPool(): Pool {
  return new Pool({
    connectionString: getTestPostgresUrl()
  });
}

export async function ensureTestDatabaseExists(): Promise<void> {
  const adminPool = createAdminPool();
  const dbName = getDatabaseName(getTestPostgresUrl());

  try {
    const exists = await adminPool.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [dbName]
    );

    if (!exists.rows[0]?.exists) {
      await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
    }
  } finally {
    await adminPool.end();
  }
}

export async function truncateAppTables(pool: Pool): Promise<void> {
  await pool.query(`TRUNCATE TABLE ${APP_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

export async function resetPublicSchema(pool: Pool): Promise<void> {
  if (process.env.ALLOW_TEST_DB_RESET !== "1") {
    throw new Error("Refusing to reset schema without ALLOW_TEST_DB_RESET=1");
  }

  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");
}

