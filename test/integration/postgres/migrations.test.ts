import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createTestDbPool, ensureTestDatabaseExists, resetPublicSchema } from "./helpers/db-admin.js";
import { applyBackendAppEnvForTestDb } from "./helpers/db-env.js";

async function importMigrationModules() {
  applyBackendAppEnvForTestDb();
  vi.resetModules();
  const postgres = await import("../../../src/clients/postgres.js");
  postgres.resetPostgresClientForTests();
  const runMod = await import("../../../src/migrations/run-migrations.js");
  const checkMod = await import("../../../src/migrations/check-migrations.js");
  return { postgres, runMod, checkMod };
}

describe("migration integration", () => {
  let pool: Pool;

  beforeAll(async () => {
    applyBackendAppEnvForTestDb();
    await ensureTestDatabaseExists();
    pool = createTestDbPool();
  }, 30_000);

  beforeEach(async () => {
    if (process.env.ALLOW_TEST_DB_RESET !== "1") {
      throw new Error("Set ALLOW_TEST_DB_RESET=1 to run migration integration tests.");
    }
    await resetPublicSchema(pool);
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      vi.resetModules();
      const postgres = await import("../../../src/clients/postgres.js");
      await postgres.shutdownPostgresClient().catch(() => undefined);
      postgres.resetPostgresClientForTests();
    } finally {
      await pool.end();
    }
  });

  it("runMigrations applies pending files in sorted order and is idempotent", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pichufy-migrations-"));
    try {
      await writeFile(path.join(dir, "0002_second.sql"), "CREATE TABLE b_table (id INT PRIMARY KEY);\n");
      await writeFile(path.join(dir, "0001_first.sql"), "CREATE TABLE a_table (id INT PRIMARY KEY);\n");
      await writeFile(path.join(dir, "README.txt"), "ignore");

      const { runMod } = await importMigrationModules();

      const firstRun = await runMod.runMigrations({ migrationsDir: dir });
      expect(firstRun).toEqual(["0001_first.sql", "0002_second.sql"]);

      const secondRun = await runMod.runMigrations({ migrationsDir: dir });
      expect(secondRun).toEqual([]);

      const schemaMigrations = await pool.query<{ filename: string }>(
        "SELECT filename FROM schema_migrations ORDER BY filename ASC"
      );
      expect(schemaMigrations.rows.map((r) => r.filename)).toEqual(["0001_first.sql", "0002_second.sql"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runMigrations strips UTF-8 BOM and stops on failing migration", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pichufy-migrations-"));
    try {
      await writeFile(path.join(dir, "0001_ok.sql"), "\uFEFFCREATE TABLE bom_table (id INT PRIMARY KEY);\n");
      await writeFile(path.join(dir, "0002_fail.sql"), "SELECT * FROM missing_table;\n");
      await writeFile(path.join(dir, "0003_never.sql"), "CREATE TABLE never_table (id INT PRIMARY KEY);\n");

      const { runMod } = await importMigrationModules();

      await expect(runMod.runMigrations({ migrationsDir: dir })).rejects.toThrow();

      const applied = await pool.query<{ filename: string }>("SELECT filename FROM schema_migrations ORDER BY filename ASC");
      expect(applied.rows.map((row) => row.filename)).toEqual(["0001_ok.sql"]);

      const bomTable = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bom_table') AS exists"
      );
      expect(bomTable.rows[0]?.exists).toBe(true);

      const neverTable = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'never_table') AS exists"
      );
      expect(neverTable.rows[0]?.exists).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("assertMigrationsCurrent passes when all files are applied and throws on pending files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pichufy-migrations-"));
    try {
      await writeFile(path.join(dir, "0001_one.sql"), "CREATE TABLE one_table (id INT PRIMARY KEY);\n");
      await writeFile(path.join(dir, "0002_two.sql"), "CREATE TABLE two_table (id INT PRIMARY KEY);\n");
      await writeFile(path.join(dir, "README.md"), "ignore");

      const { runMod, checkMod } = await importMigrationModules();
      await runMod.runMigrations({ migrationsDir: dir });

      await expect(checkMod.assertMigrationsCurrent({ migrationsDir: dir })).resolves.toBeUndefined();

      await writeFile(path.join(dir, "0003_three.sql"), "CREATE TABLE three_table (id INT PRIMARY KEY);\n");
      await expect(checkMod.assertMigrationsCurrent({ migrationsDir: dir })).rejects.toThrow(/0003_three\.sql/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("applies backend migrations and reports current state", async () => {
    const { runMod, checkMod } = await importMigrationModules();

    const applied = await runMod.runMigrations();
    expect(Array.isArray(applied)).toBe(true);

    await expect(checkMod.assertMigrationsCurrent()).resolves.toBeUndefined();

    const requiredTables = await pool.query<{ table_name: string }>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('conversations', 'messages', 'retrieval_events', 'audit_events', 'users')
        ORDER BY table_name ASC
      `
    );
    expect(requiredTables.rows.map((row) => row.table_name)).toEqual([
      "audit_events",
      "conversations",
      "messages",
      "retrieval_events",
      "users"
    ]);
  });
});
