import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDbPool, ensureTestDatabaseExists, truncateAppTables } from "./helpers/db-admin.js";
import { applyBackendAppEnvForTestDb } from "./helpers/db-env.js";
import { applyBackendMigrationsToTestDb } from "./helpers/migrate.js";

describe("postgres client integration", () => {
  beforeAll(async () => {
    applyBackendAppEnvForTestDb();
    await ensureTestDatabaseExists();
    await applyBackendMigrationsToTestDb();
  }, 30_000);

  beforeEach(async () => {
    applyBackendAppEnvForTestDb();
    const pool = createTestDbPool();
    try {
      await truncateAppTables(pool);
    } finally {
      await pool.end();
    }

    vi.resetModules();
    const mod = await import("../../../src/clients/postgres.js");
    mod.resetPostgresClientForTests();
  });

  afterAll(async () => {
    vi.resetModules();
    applyBackendAppEnvForTestDb();
    const mod = await import("../../../src/clients/postgres.js");
    await mod.shutdownPostgresClient().catch(() => undefined);
    mod.resetPostgresClientForTests();
  });

  it("initializes and reuses the singleton and passes health checks", async () => {
    applyBackendAppEnvForTestDb();
    const mod = await import("../../../src/clients/postgres.js");

    const first = await mod.getPostgresClient();
    const second = await mod.getPostgresClient();

    expect(first).toBe(second);
    await expect(first.healthCheck()).resolves.toEqual({ status: "ok" });
  });

  it("getPostgresPool throws before initialization", async () => {
    applyBackendAppEnvForTestDb();
    const mod = await import("../../../src/clients/postgres.js");
    mod.resetPostgresClientForTests();

    expect(() => mod.getPostgresPool()).toThrow(/not initialized/i);
  });

  it("withTransaction commits on success", async () => {
    applyBackendAppEnvForTestDb();
    const mod = await import("../../../src/clients/postgres.js");

    const inserted = await mod.withTransaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `
          INSERT INTO users (id, role, display_name)
          VALUES ($1, 'basic', 'Committed User')
          RETURNING id
        `,
        ["tx-commit-user"]
      );
      return result.rows[0].id;
    });

    expect(inserted).toBe("tx-commit-user");

    const verifyPool = createTestDbPool();
    try {
      const verify = await verifyPool.query<{ id: string }>("SELECT id FROM users WHERE id = $1", ["tx-commit-user"]);
      expect(verify.rows.map((row) => row.id)).toEqual(["tx-commit-user"]);
    } finally {
      await verifyPool.end();
    }
  });

  it("withTransaction rolls back on error", async () => {
    applyBackendAppEnvForTestDb();
    const mod = await import("../../../src/clients/postgres.js");

    await expect(
      mod.withTransaction(async (client) => {
        await client.query(
          `
            INSERT INTO users (id, role, display_name)
            VALUES ($1, 'basic', 'Rolled Back User')
          `,
          ["tx-rollback-user"]
        );
        throw new Error("force rollback");
      })
    ).rejects.toThrow("force rollback");

    const verifyPool = createTestDbPool();
    try {
      const verify = await verifyPool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM users WHERE id = $1", [
        "tx-rollback-user"
      ]);
      expect(verify.rows[0]?.count).toBe("0");
    } finally {
      await verifyPool.end();
    }
  });

  it("shutdown and reset allow re-initialization", async () => {
    applyBackendAppEnvForTestDb();
    const mod = await import("../../../src/clients/postgres.js");

    const first = await mod.getPostgresClient();
    await mod.shutdownPostgresClient();

    const second = await mod.getPostgresClient();
    expect(second).not.toBe(first);

    mod.resetPostgresClientForTests();
  });
});
