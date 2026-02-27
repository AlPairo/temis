import { beforeEach, describe, expect, it, vi } from "vitest";

describe("migrations/check-migrations", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns when no sql files exist", async () => {
    const { assertMigrationsCurrent } = await import("../../src/migrations/check-migrations.js");

    await expect(
      assertMigrationsCurrent({
        readdirFn: vi.fn().mockResolvedValue(["README.md"]),
        getPostgresClientFn: vi.fn()
      })
    ).resolves.toBeUndefined();
  });

  it("throws when pending migrations exist", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ filename: "0001_initial.sql" }] })
    };
    const getPostgresClientFn = vi.fn().mockResolvedValue({ pool });

    const { assertMigrationsCurrent } = await import("../../src/migrations/check-migrations.js");

    await expect(
      assertMigrationsCurrent({
        readdirFn: vi.fn().mockResolvedValue(["0001_initial.sql", "0002_next.sql"]),
        getPostgresClientFn
      })
    ).rejects.toThrow(/Pending migrations detected: 0002_next.sql/);

    expect(getPostgresClientFn).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("passes when all migrations are already applied", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ filename: "0001.sql" }, { filename: "0002.sql" }] })
    };

    const { assertMigrationsCurrent } = await import("../../src/migrations/check-migrations.js");

    await expect(
      assertMigrationsCurrent({
        readdirFn: vi.fn().mockResolvedValue(["0001.sql", "0002.sql"]),
        getPostgresClientFn: vi.fn().mockResolvedValue({ pool })
      })
    ).resolves.toBeUndefined();
  });
});

describe("migrations/run-migrations", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns empty list when no migrations exist", async () => {
    const { runMigrations } = await import("../../src/migrations/run-migrations.js");

    await expect(
      runMigrations({
        readdirFn: vi.fn().mockResolvedValue([])
      })
    ).resolves.toEqual([]);
  });

  it("applies only pending migrations and strips UTF-8 BOM", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const withTransactionFn = vi.fn(async (operation: (client: { query: (...args: any[]) => Promise<any> }) => Promise<any>) => {
      const client = {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
          calls.push({ sql, params });
          if (/SELECT EXISTS/i.test(sql)) {
            const filename = params?.[0];
            return { rows: [{ exists: filename === "0001.sql" }] };
          }
          return { rows: [] };
        })
      };
      return operation(client as any);
    });
    const readFileFn = vi.fn(async (_path: string) => "\uFEFFSELECT 42;");

    const { runMigrations } = await import("../../src/migrations/run-migrations.js");

    const applied = await runMigrations({
      migrationsDir: "C:\\fake\\migrations",
      readdirFn: vi.fn().mockResolvedValue(["0002.sql", "README.md", "0001.sql"]),
      readFileFn: readFileFn as any,
      withTransactionFn: withTransactionFn as any
    });

    expect(applied).toEqual(["0002.sql"]);
    expect(readFileFn).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.sql === "SELECT 42;")).toBe(true);
    expect(calls.some((c) => /INSERT INTO schema_migrations/i.test(c.sql) && c.params?.[0] === "0002.sql")).toBe(true);
  });
});
