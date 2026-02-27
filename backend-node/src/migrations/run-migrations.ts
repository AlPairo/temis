import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withTransaction } from "../clients/postgres.js";

const currentFilePath = fileURLToPath(import.meta.url);
export const defaultMigrationsDir = path.resolve(path.dirname(currentFilePath), "../../migrations");

export interface RunMigrationsDependencies {
  migrationsDir?: string;
  readdirFn?: typeof readdir;
  readFileFn?: typeof readFile;
  withTransactionFn?: typeof withTransaction;
}

export async function runMigrations(dependencies: RunMigrationsDependencies = {}): Promise<string[]> {
  const migrationsDir = dependencies.migrationsDir ?? defaultMigrationsDir;
  const readdirFn = dependencies.readdirFn ?? readdir;
  const readFileFn = dependencies.readFileFn ?? readFile;
  const withTransactionFn = dependencies.withTransactionFn ?? withTransaction;

  const filenames = (await readdirFn(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  if (filenames.length === 0) {
    return [];
  }

  await withTransactionFn(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  });

  const applied: string[] = [];

  for (const filename of filenames) {
    const alreadyAppliedResult = await withTransactionFn(async (client) => {
      return client.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE filename = $1) AS exists",
        [filename]
      );
    });

    if (alreadyAppliedResult.rows[0]?.exists) {
      continue;
    }

    const migrationSql = (await readFileFn(path.join(migrationsDir, filename), "utf8")).replace(/^\uFEFF/, "");

    await withTransactionFn(async (client) => {
      await client.query(migrationSql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
    });

    applied.push(filename);
  }

  return applied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then((applied) => {
      if (applied.length === 0) {
        console.log("No pending migrations.");
      } else {
        console.log(`Applied migrations: ${applied.join(", ")}`);
      }
    })
    .catch((error) => {
      console.error("Migration failed", error);
      process.exitCode = 1;
    });
}
