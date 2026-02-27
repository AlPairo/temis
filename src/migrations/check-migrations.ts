import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPostgresClient } from "../clients/postgres.js";

const currentFilePath = fileURLToPath(import.meta.url);
export const defaultMigrationsDir = path.resolve(path.dirname(currentFilePath), "../../migrations");

export interface CheckMigrationsDependencies {
  migrationsDir?: string;
  readdirFn?: typeof readdir;
  getPostgresClientFn?: typeof getPostgresClient;
}

export async function assertMigrationsCurrent(dependencies: CheckMigrationsDependencies = {}): Promise<void> {
  const migrationsDir = dependencies.migrationsDir ?? defaultMigrationsDir;
  const readdirFn = dependencies.readdirFn ?? readdir;
  const getPostgresClientFn = dependencies.getPostgresClientFn ?? getPostgresClient;
  const files = (await readdirFn(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    return;
  }

  const { pool } = await getPostgresClientFn();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const appliedResult = await pool.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations"
  );
  const applied = new Set(appliedResult.rows.map((row) => row.filename));

  const pending = files.filter((file) => !applied.has(file));
  if (pending.length > 0) {
    throw new Error(`Pending migrations detected: ${pending.join(", ")}. Run npm run migrate.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertMigrationsCurrent()
    .then(() => console.log("Migrations are up to date."))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
