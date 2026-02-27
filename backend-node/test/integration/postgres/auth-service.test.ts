import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createTestDbPool, ensureTestDatabaseExists, truncateAppTables } from "./helpers/db-admin.js";
import { applyBackendAppEnvForTestDb } from "./helpers/db-env.js";
import { insertUser } from "./helpers/fixtures.js";
import { applyBackendMigrationsToTestDb } from "./helpers/migrate.js";

async function importAuthServiceWithMocks() {
  applyBackendAppEnvForTestDb();
  vi.resetModules();

  const jwtMocks = {
    JwtAuthError: class JwtAuthError extends Error {
      statusCode: number;
      constructor(message: string, statusCode = 401) {
        super(message);
        this.name = "JwtAuthError";
        this.statusCode = statusCode;
      }
    },
    isJwtAuthEnabled: vi.fn(),
    isJwtAuthRequired: vi.fn(),
    verifyJwtAndExtractUser: vi.fn()
  };
  const loggerMocks = {
    logWarn: vi.fn()
  };

  vi.doMock("../../../src/auth/jwt.js", () => jwtMocks);
  vi.doMock("../../../src/observability/logger.js", () => loggerMocks);

  const service = await import("../../../src/auth/service.js");
  const postgres = await import("../../../src/clients/postgres.js");
  postgres.resetPostgresClientForTests();
  return { service, jwtMocks, loggerMocks, postgres };
}

describe("auth/service Postgres integration", () => {
  let pool: Pool;

  beforeAll(async () => {
    applyBackendAppEnvForTestDb();
    await ensureTestDatabaseExists();
    await applyBackendMigrationsToTestDb();
    pool = createTestDbPool();
  }, 30_000);

  beforeEach(async () => {
    await truncateAppTables(pool);
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      vi.resetModules();
      applyBackendAppEnvForTestDb();
      const postgres = await import("../../../src/clients/postgres.js");
      await postgres.shutdownPostgresClient().catch(() => undefined);
      postgres.resetPostgresClientForTests();
    } finally {
      await pool.end();
    }
  });

  it("resolveVisibleUserIds returns correct sets for basic, admin, and supervisor recursion", async () => {
    const { service } = await importAuthServiceWithMocks();

    await insertUser(pool, { id: "sup-1", role: "supervisor" });
    await insertUser(pool, { id: "child-1", role: "basic", parentUserId: "sup-1", isActive: true });
    await insertUser(pool, { id: "grandchild-1", role: "basic", parentUserId: "child-1", isActive: true });
    await insertUser(pool, { id: "inactive-child", role: "basic", parentUserId: "sup-1", isActive: false });

    await expect(service.resolveVisibleUserIds({ userId: "basic-1", role: "basic" })).resolves.toEqual(["basic-1"]);
    await expect(service.resolveVisibleUserIds({ userId: "admin-1", role: "admin" })).resolves.toBeNull();

    const visible = await service.resolveVisibleUserIds({ userId: "sup-1", role: "supervisor" });
    expect(visible?.sort()).toEqual(["child-1", "grandchild-1", "sup-1"]);
    expect(visible).not.toContain("inactive-child");
  });

  it("resolveVisibleUserIds includes supervisor id even when not present in DB", async () => {
    const { service } = await importAuthServiceWithMocks();
    const visible = await service.resolveVisibleUserIds({ userId: "missing-supervisor", role: "supervisor" });
    expect(visible).toEqual(["missing-supervisor"]);
  });

  it("resolveAuthenticatedUser upserts user role, returns DB role, and logs mismatch", async () => {
    await insertUser(pool, { id: "user-1", role: "basic" });

    const { service, jwtMocks, loggerMocks } = await importAuthServiceWithMocks();
    jwtMocks.isJwtAuthEnabled.mockReturnValue(true);
    jwtMocks.isJwtAuthRequired.mockReturnValue(true);
    jwtMocks.verifyJwtAndExtractUser.mockReturnValue({ userId: "user-1", role: "admin" });

    const request = {
      headers: {
        authorization: "Bearer token-123"
      }
    } as any;

    const resolved = await service.resolveAuthenticatedUser(request);
    expect(resolved).toEqual({ userId: "user-1", role: "basic" });

    expect(loggerMocks.logWarn).toHaveBeenCalledWith(
      "auth.jwt.role_claim_mismatch",
      { requestId: null },
      expect.objectContaining({
        user_id: "user-1",
        jwt_role: "admin",
        db_role: "basic"
      })
    );
  });

  it("buildSessionViewerScope handles visible vs mine and includeDeleted permissions", async () => {
    await insertUser(pool, { id: "sup-2", role: "supervisor" });
    await insertUser(pool, { id: "child-2", role: "basic", parentUserId: "sup-2", isActive: true });

    const { service, jwtMocks } = await importAuthServiceWithMocks();
    jwtMocks.isJwtAuthEnabled.mockReturnValue(true);
    jwtMocks.isJwtAuthRequired.mockReturnValue(false);
    jwtMocks.verifyJwtAndExtractUser.mockReturnValue({ userId: "sup-2", role: "supervisor" });

    const request = {
      headers: {
        authorization: "Bearer sup-token"
      }
    } as any;

    const visibleScope = await service.buildSessionViewerScope({
      request,
      requestedScope: "visible",
      requestedIncludeDeleted: true
    });
    expect(visibleScope.viewer).toEqual({ userId: "sup-2", role: "supervisor" });
    expect(visibleScope.includeDeleted).toBe(true);
    expect(visibleScope.visibleUserIds?.sort()).toEqual(["child-2", "sup-2"]);

    const mineScope = await service.buildSessionViewerScope({
      request,
      requestedScope: "mine",
      requestedIncludeDeleted: true
    });
    expect(mineScope.visibleUserIds).toEqual(["sup-2"]);
    expect(mineScope.includeDeleted).toBe(true);
  });
});
