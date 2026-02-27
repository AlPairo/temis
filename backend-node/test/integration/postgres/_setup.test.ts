import { describe, expect, it } from "vitest";
import { createTestDbPool, ensureTestDatabaseExists } from "./helpers/db-admin.js";
import { assertLooksLikeTestDb, getTestPostgresUrl } from "./helpers/db-env.js";
import { applyBackendMigrationsToTestDb } from "./helpers/migrate.js";

describe("postgres integration setup", () => {
  it("validates the configured test DB URL, ensures the database exists, and runs migrations", async () => {
    const testUrl = getTestPostgresUrl();
    assertLooksLikeTestDb(testUrl);

    await ensureTestDatabaseExists();
    const applied = await applyBackendMigrationsToTestDb();

    const pool = createTestDbPool();
    try {
      const result = await pool.query<{ ok: number }>("SELECT 1 AS ok");
      expect(result.rows[0]?.ok).toBe(1);
      expect(Array.isArray(applied)).toBe(true);
    } finally {
      await pool.end();
    }
  }, 30_000);
});

