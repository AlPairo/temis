import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("clients/local-vector-store", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    vi.doUnmock("../../src/config/index.js");
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))
    );
  });

  async function importLocalVectorStore(filePath: string) {
    vi.doMock("../../src/config/index.js", () => ({
      config: {
        LOCAL_VECTOR_STORE_FILE: filePath
      }
    }));

    return import("../../src/clients/local-vector-store.js");
  }

  it("upserts, queries, filters, and deletes vectors using the local store file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pichufy-local-store-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "store.json");
    const { createLocalVectorStoreClient } = await importLocalVectorStore(filePath);
    const client = createLocalVectorStoreClient();

    await expect(client.getCollections()).resolves.toEqual({ collections: [] });
    await expect(client.collectionExists("docs")).resolves.toBe(false);

    await client.upsert("docs", {
      points: [
        { id: "p1", vector: [1, 0], payload: { type: "a" } },
        { id: "p2", vector: [0.5, 0.5], payload: { type: "b" } },
        { id: "p3", vector: [0, 1], payload: { type: "a" } }
      ]
    });

    await expect(client.getCollections()).resolves.toEqual({
      collections: [{ name: "docs" }]
    });
    await expect(client.collectionExists("docs")).resolves.toBe(true);

    const topTwo = await client.query("docs", { vector: [1, 0], limit: 2 });
    expect(topTwo.points.map((point) => point.id)).toEqual(["p1", "p2"]);

    const filtered = await client.query("docs", {
      vector: [1, 0],
      filter: { must: [{ key: "type", match: { value: "a" } }] }
    });
    expect(filtered.points.map((point) => point.id)).toEqual(["p1", "p3"]);

    const minOneLimit = await client.query("docs", { vector: [1, 0], limit: 0 });
    expect(minOneLimit.points).toHaveLength(1);
    expect(minOneLimit.points[0]?.id).toBe("p1");

    const zeroScore = await client.query("docs", { vector: [1], limit: 1 });
    expect(zeroScore.points[0]?.score).toBe(0);

    await client.delete("docs", { filter: { must: [{ key: "type", match: { value: "a" } }] } });
    const afterFilteredDelete = await client.query("docs", { vector: [1, 0], limit: 10 });
    expect(afterFilteredDelete.points.map((point) => point.id)).toEqual(["p2"]);

    await client.delete("docs", {});
    await expect(client.query("docs", { vector: [1, 0] })).resolves.toEqual({ points: [] });
  });
});

describe("clients/openai", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("../../src/config/index.js");
    vi.doUnmock("openai");
  });

  async function importOpenAIClientModule(options?: {
    mockInfra?: boolean;
    retrieveMock?: ReturnType<typeof vi.fn>;
  }) {
    if (options?.mockInfra) {
      vi.stubEnv("MOCK_INFRA_CLIENTS", "1");
    } else {
      vi.stubEnv("MOCK_INFRA_CLIENTS", "0");
    }

    vi.doMock("../../src/config/index.js", () => ({
      config: {
        OPENAI_API_KEY: "key-123",
        OPENAI_MODEL: "gpt-test"
      }
    }));

    const retrieveMock =
      options?.retrieveMock ??
      vi.fn(async () => ({
        id: "gpt-test"
      }));
    const OpenAIConstructor = vi.fn().mockImplementation(() => ({
      models: { retrieve: retrieveMock },
      embeddings: {
        create: vi.fn()
      }
    }));

    vi.doMock("openai", () => ({
      default: OpenAIConstructor
    }));

    const mod = await import("../../src/clients/openai.js");
    return { mod, OpenAIConstructor, retrieveMock };
  }

  it("uses the in-process mock client when MOCK_INFRA_CLIENTS=1", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { mod, OpenAIConstructor } = await importOpenAIClientModule({ mockInfra: true });

    const first = await mod.getOpenAIClient();
    const second = await mod.getOpenAIClient();
    expect(first).toBe(second);
    expect(OpenAIConstructor).not.toHaveBeenCalled();

    await expect(first.healthCheck()).resolves.toEqual({ status: "ok" });
    await expect(first.client.models.retrieve("ignored")).resolves.toEqual({ id: "gpt-test" });
    await expect(first.client.embeddings.create({ model: "gpt-test", input: ["a", "b"] } as any)).resolves.toEqual({
      data: [
        { index: 0, embedding: [0.01, 0.02, 0.03] },
        { index: 1, embedding: [0.01, 0.02, 0.03] }
      ]
    });

    await mod.shutdownOpenAIClient();
    expect(infoSpy).toHaveBeenCalledWith("[clients/openai] shutdown complete");
  });

  it("constructs the real client and retries health checks after transient errors", async () => {
    vi.useFakeTimers();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const retrieveMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ id: "gpt-test" });

    const { mod, OpenAIConstructor } = await importOpenAIClientModule({ retrieveMock });
    const singleton = await mod.getOpenAIClient();

    expect(OpenAIConstructor).toHaveBeenCalledWith({
      apiKey: "key-123",
      maxRetries: 2,
      timeout: 7000
    });
    expect(infoSpy).toHaveBeenCalledWith("[clients/openai] initialized singleton");

    const healthPromise = singleton.healthCheck();
    await vi.advanceTimersByTimeAsync(300);

    await expect(healthPromise).resolves.toEqual({ status: "ok" });
    expect(retrieveMock).toHaveBeenCalledTimes(2);
    expect(retrieveMock.mock.calls[0]?.[0]).toBe("gpt-test");
    expect(retrieveMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("reports timeout/abort errors from health checks", async () => {
    vi.useFakeTimers();
    const retrieveMock = vi.fn((_model: string, options?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => reject(new Error("request aborted")),
          { once: true }
        );
      });
    });

    const { mod } = await importOpenAIClientModule({ retrieveMock });
    const singleton = await mod.getOpenAIClient();

    const healthPromise = singleton.healthCheck();
    await vi.advanceTimersByTimeAsync(15000);

    await expect(healthPromise).resolves.toEqual({
      status: "error",
      details: "request aborted"
    });
    expect(retrieveMock).toHaveBeenCalledTimes(2);
  });
});

describe("clients/postgres", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("../../src/config/index.js");
    vi.doUnmock("pg");
  });

  async function importPostgresClientModule(options?: {
    mockInfra?: boolean;
    poolFactory?: ReturnType<typeof vi.fn>;
  }) {
    if (options?.mockInfra) {
      vi.stubEnv("MOCK_INFRA_CLIENTS", "1");
    } else {
      vi.stubEnv("MOCK_INFRA_CLIENTS", "0");
    }

    vi.doMock("../../src/config/index.js", () => ({
      config: {
        POSTGRES_URL: "postgres://test/db"
      }
    }));

    const PoolConstructor = options?.poolFactory ?? vi.fn();
    vi.doMock("pg", () => ({
      Pool: PoolConstructor
    }));

    const mod = await import("../../src/clients/postgres.js");
    return { mod, PoolConstructor };
  }

  it("uses the mock postgres client when MOCK_INFRA_CLIENTS=1", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { mod, PoolConstructor } = await importPostgresClientModule({ mockInfra: true });

    const singleton = await mod.getPostgresClient();
    expect(PoolConstructor).not.toHaveBeenCalled();
    await expect(singleton.healthCheck()).resolves.toEqual({ status: "ok" });
    await expect(singleton.pool.query("SELECT 1")).resolves.toEqual({ rows: [{ "?column?": 1 }] });
    await expect(singleton.pool.query("SELECT now()")).rejects.toThrow(/Mock Postgres/);

    await mod.shutdownPostgresClient();
    expect(infoSpy).toHaveBeenCalledWith("[clients/postgres] shutdown complete");
  });

  it("retries pool startup queries and coalesces concurrent initialization", async () => {
    vi.useFakeTimers();
    const pool = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error("db not ready"))
        .mockRejectedValueOnce(new Error("db still not ready"))
        .mockResolvedValue({ rows: [] }),
      end: vi.fn(async () => {}),
      connect: vi.fn()
    };
    const PoolConstructor = vi.fn().mockImplementation(() => pool);
    const { mod } = await importPostgresClientModule({ poolFactory: PoolConstructor });

    const promiseA = mod.getPostgresClient();
    const promiseB = mod.getPostgresClient();
    await vi.advanceTimersByTimeAsync(1000);

    const [clientA, clientB] = await Promise.all([promiseA, promiseB]);
    expect(clientA).toBe(clientB);
    expect(PoolConstructor).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenNthCalledWith(1, "SELECT 1");
    expect(pool.query).toHaveBeenNthCalledWith(2, "SELECT 1");
    expect(pool.query).toHaveBeenNthCalledWith(3, "SELECT 1");
  });

  it("exposes pool access and reports health check errors", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      end: vi.fn(async () => {}),
      connect: vi.fn()
    };
    const PoolConstructor = vi.fn().mockImplementation(() => pool);
    const { mod } = await importPostgresClientModule({ poolFactory: PoolConstructor });

    await expect(() => mod.getPostgresPool()).toThrow(/not initialized/);

    const singleton = await mod.getPostgresClient();
    expect(mod.getPostgresPool()).toBe(singleton.pool);

    pool.query.mockRejectedValueOnce(new Error("health failed"));
    await expect(singleton.healthCheck()).resolves.toEqual({
      status: "error",
      details: "health failed"
    });
  });

  it("commits successful transactions and rolls back failed ones", async () => {
    const txClient = {
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn()
    };
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      end: vi.fn(async () => {}),
      connect: vi.fn().mockResolvedValue(txClient)
    };
    const { mod } = await importPostgresClientModule({
      poolFactory: vi.fn().mockImplementation(() => pool)
    });

    await mod.getPostgresClient();

    const value = await mod.withTransaction(async (client) => {
      expect(client).toBe(txClient as any);
      await client.query("SELECT 42");
      return 42;
    });

    expect(value).toBe(42);
    expect(txClient.query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(txClient.query).toHaveBeenNthCalledWith(2, "SELECT 42");
    expect(txClient.query).toHaveBeenNthCalledWith(3, "COMMIT");
    expect(txClient.release).toHaveBeenCalledTimes(1);

    txClient.query.mockClear();
    txClient.release.mockClear();
    txClient.query.mockImplementation(async (...args: any[]) => {
      const sql = args[0] as string;
      if (sql === "BEGIN" || sql === "ROLLBACK") {
        return { rows: [] };
      }
      if (sql === "SELECT fail") {
        throw new Error("tx fail");
      }
      return { rows: [] };
    });

    await expect(
      mod.withTransaction(async (client) => {
        await client.query("SELECT fail");
        return 1;
      })
    ).rejects.toThrow("tx fail");

    expect(txClient.query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(txClient.query).toHaveBeenNthCalledWith(2, "SELECT fail");
    expect(txClient.query).toHaveBeenNthCalledWith(3, "ROLLBACK");
    expect(txClient.release).toHaveBeenCalledTimes(1);
  });

  it("shuts down and clears the singleton pool state", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      end: vi.fn(async () => {}),
      connect: vi.fn()
    };
    const PoolConstructor = vi.fn().mockImplementation(() => pool);
    const { mod } = await importPostgresClientModule({ poolFactory: PoolConstructor });

    const first = await mod.getPostgresClient();
    await mod.shutdownPostgresClient();
    const second = await mod.getPostgresClient();

    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(first).not.toBe(second);
    expect(PoolConstructor).toHaveBeenCalledTimes(2);
  });
});

describe("clients/qdrant", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("../../src/config/index.js");
    vi.doUnmock("../../src/clients/local-vector-store.js");
    vi.doUnmock("@qdrant/js-client-rest");
  });

  async function importQdrantClientModule(options?: {
    mockInfra?: boolean;
    appMode?: "local" | "prod";
    qdrantUrl?: string | undefined;
    qdrantClientFactory?: ReturnType<typeof vi.fn>;
    localStoreFactory?: ReturnType<typeof vi.fn>;
  }) {
    if (options?.mockInfra) {
      vi.stubEnv("MOCK_INFRA_CLIENTS", "1");
    } else {
      vi.stubEnv("MOCK_INFRA_CLIENTS", "0");
    }

    vi.doMock("../../src/config/index.js", () => ({
      config: {
        APP_MODE: options?.appMode ?? "prod",
        QDRANT_URL: options && "qdrantUrl" in options ? options.qdrantUrl : "http://localhost:6333",
        QDRANT_API_KEY: "secret",
        QDRANT_COLLECTION: "docs",
        LOCAL_VECTOR_STORE_FILE: "unused"
      }
    }));

    const localStoreFactory =
      options?.localStoreFactory ??
      vi.fn(() => ({
        getCollections: vi.fn(async () => ({ collections: [] }))
      }));
    vi.doMock("../../src/clients/local-vector-store.js", () => ({
      createLocalVectorStoreClient: localStoreFactory
    }));

    const QdrantClientConstructor =
      options?.qdrantClientFactory ?? vi.fn().mockImplementation(() => ({}));
    vi.doMock("@qdrant/js-client-rest", () => ({
      QdrantClient: QdrantClientConstructor
    }));

    const mod = await import("../../src/clients/qdrant.js");
    return { mod, QdrantClientConstructor, localStoreFactory };
  }

  it("uses the mock qdrant client when MOCK_INFRA_CLIENTS=1", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { mod, QdrantClientConstructor, localStoreFactory } = await importQdrantClientModule({
      mockInfra: true
    });

    const singleton = await mod.getQdrantClient();
    expect(QdrantClientConstructor).not.toHaveBeenCalled();
    expect(localStoreFactory).not.toHaveBeenCalled();
    await expect(singleton.healthCheck()).resolves.toEqual({ status: "ok" });
    await expect(singleton.client.getCollections()).resolves.toEqual({ collections: [] });

    await mod.shutdownQdrantClient();
    expect(infoSpy).toHaveBeenCalledWith("[clients/qdrant] shutdown complete");
  });

  it("uses the local file vector store in local APP_MODE", async () => {
    const localClient = {
      getCollections: vi.fn(async () => ({ collections: [{ name: "docs" }] }))
    };
    const { mod, QdrantClientConstructor, localStoreFactory } = await importQdrantClientModule({
      appMode: "local",
      qdrantUrl: undefined,
      localStoreFactory: vi.fn(() => localClient as any)
    });

    const singleton = await mod.getQdrantClient();
    expect(localStoreFactory).toHaveBeenCalledTimes(1);
    expect(QdrantClientConstructor).not.toHaveBeenCalled();
    await expect(singleton.healthCheck()).resolves.toEqual({
      status: "ok",
      details: "local file vector store"
    });

    localClient.getCollections.mockRejectedValueOnce(new Error("disk error"));
    await expect(singleton.healthCheck()).resolves.toEqual({
      status: "error",
      details: "disk error"
    });
  });

  it("retries remote qdrant startup and health-checks the configured collection", async () => {
    vi.useFakeTimers();
    const remoteClient = {
      getCollections: vi
        .fn()
        .mockRejectedValueOnce(new Error("qdrant not ready"))
        .mockRejectedValueOnce(new Error("qdrant still not ready"))
        .mockResolvedValue({ collections: [] }),
      collectionExists: vi.fn().mockResolvedValue(true)
    };

    const { mod, QdrantClientConstructor } = await importQdrantClientModule({
      appMode: "prod",
      qdrantClientFactory: vi.fn().mockImplementation(() => remoteClient as any)
    });

    const pending = mod.getQdrantClient();
    await vi.advanceTimersByTimeAsync(1000);
    const singleton = await pending;

    expect(QdrantClientConstructor).toHaveBeenCalledWith({
      url: "http://localhost:6333",
      apiKey: "secret",
      timeout: 5000
    });
    expect(remoteClient.getCollections).toHaveBeenCalledTimes(3);

    await expect(singleton.healthCheck()).resolves.toEqual({ status: "ok" });
    expect(remoteClient.collectionExists).toHaveBeenCalledWith("docs");
  });
});

describe("clients/lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("logs when bootstrap is disabled and registers no hooks", async () => {
    const lifecycle = await import("../../src/clients/lifecycle.js");
    lifecycle.resetClientLifecycleStateForTests();

    const app = {
      addHook: vi.fn(),
      log: { info: vi.fn() }
    };

    lifecycle.registerClientLifecycle(app as any, { enableBootstrap: false });

    expect(app.log.info).toHaveBeenCalledWith(
      "Infrastructure bootstrap disabled (set ENABLE_INFRA_BOOTSTRAP=true to enable)."
    );
    expect(app.addHook).not.toHaveBeenCalled();
  });

  it("registers lifecycle hooks and runs health checks / shutdowns", async () => {
    const lifecycle = await import("../../src/clients/lifecycle.js");
    lifecycle.resetClientLifecycleStateForTests();

    const hooks = new Map<string, Function>();
    const app = {
      addHook: vi.fn((name: string, handler: Function) => {
        hooks.set(name, handler);
      }),
      log: { info: vi.fn() }
    };

    const openaiHealth = vi.fn(async () => ({ status: "ok" }));
    const postgresHealth = vi.fn(async () => ({ status: "ok" }));
    const qdrantHealth = vi.fn(async () => ({ status: "ok" }));
    const shutdownOpenAI = vi.fn(async () => {});
    const shutdownPostgres = vi.fn(async () => {});
    const shutdownQdrant = vi.fn(async () => {});
    const loadClientModules = vi.fn(async () => ({
      getOpenAIClient: vi.fn(async () => ({ healthCheck: openaiHealth })),
      shutdownOpenAIClient: shutdownOpenAI,
      getPostgresClient: vi.fn(async () => ({ healthCheck: postgresHealth })),
      shutdownPostgresClient: shutdownPostgres,
      getQdrantClient: vi.fn(async () => ({ healthCheck: qdrantHealth })),
      shutdownQdrantClient: shutdownQdrant
    }));

    lifecycle.registerClientLifecycle(app as any, {
      enableBootstrap: true,
      loadClientModules,
      registerProcessSignals: false
    });

    expect(hooks.has("onReady")).toBe(true);
    expect(hooks.has("onClose")).toBe(true);

    await hooks.get("onReady")!();
    expect(postgresHealth).toHaveBeenCalledTimes(1);
    expect(openaiHealth).toHaveBeenCalledTimes(1);
    expect(qdrantHealth).toHaveBeenCalledTimes(1);
    expect(app.log.info).toHaveBeenCalledWith("Infrastructure singletons initialized and health checked");

    await hooks.get("onClose")!();
    expect(shutdownQdrant).toHaveBeenCalledTimes(1);
    expect(shutdownOpenAI).toHaveBeenCalledTimes(1);
    expect(shutdownPostgres).toHaveBeenCalledTimes(1);
  });

  it("registers process signal handlers only once and exits after shutdown", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const lifecycle = await import("../../src/clients/lifecycle.js");
    lifecycle.resetClientLifecycleStateForTests();

    const handlers: Record<string, () => unknown> = {};
    const onceSpy = vi
      .spyOn(process, "once")
      .mockImplementation(((event: string, handler: () => void) => {
        handlers[event] = handler;
        return process as any;
      }) as any);

    const shutdownOpenAI = vi.fn(async () => {});
    const shutdownPostgres = vi.fn(async () => {});
    const shutdownQdrant = vi.fn(async () => {});
    const loadClientModules = vi.fn(async () => ({
      getOpenAIClient: vi.fn(async () => ({ healthCheck: vi.fn(async () => ({ status: "ok" })) })),
      shutdownOpenAIClient: shutdownOpenAI,
      getPostgresClient: vi.fn(async () => ({ healthCheck: vi.fn(async () => ({ status: "ok" })) })),
      shutdownPostgresClient: shutdownPostgres,
      getQdrantClient: vi.fn(async () => ({ healthCheck: vi.fn(async () => ({ status: "ok" })) })),
      shutdownQdrantClient: shutdownQdrant
    }));
    const exit = vi.fn();
    const app = {
      addHook: vi.fn(),
      log: { info: vi.fn() }
    };

    lifecycle.registerClientLifecycle(app as any, {
      enableBootstrap: true,
      loadClientModules,
      registerProcessSignals: true,
      exit
    });
    lifecycle.registerClientLifecycle(app as any, {
      enableBootstrap: true,
      loadClientModules,
      registerProcessSignals: true,
      exit
    });

    expect(onceSpy).toHaveBeenCalledTimes(2);
    expect(Object.keys(handlers).sort()).toEqual(["SIGINT", "SIGTERM"]);

    await Promise.resolve(handlers.SIGINT());

    expect(consoleInfo).toHaveBeenCalledWith("[lifecycle/process] received SIGINT");
    expect(shutdownQdrant).toHaveBeenCalledTimes(1);
    expect(shutdownOpenAI).toHaveBeenCalledTimes(1);
    expect(shutdownPostgres).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
