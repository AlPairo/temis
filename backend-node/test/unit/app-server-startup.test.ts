import { beforeEach, describe, expect, it, vi } from "vitest";

describe("app.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("buildAllowedFrontendOrigins returns defaults and localhost aliases", async () => {
    vi.doMock("fastify", () => ({ default: vi.fn() }));
    vi.doMock("@fastify/cors", () => ({ default: Symbol("cors") }));
    vi.doMock("../../src/clients/lifecycle.js", () => ({ registerClientLifecycle: vi.fn() }));
    vi.doMock("../../src/api/routes/health.js", () => ({ registerHealthRoute: vi.fn() }));
    vi.doMock("../../src/api/routes/infrastructure-health.js", () => ({ registerInfrastructureHealthRoute: vi.fn() }));
    vi.doMock("../../src/api/routes/index.js", () => ({ registerApiRoutes: vi.fn() }));
    vi.doMock("../../src/observability/metrics.js", () => ({
      registerMetricsRoutes: vi.fn(),
      registerRequestMetricsHooks: vi.fn()
    }));
    vi.doMock("../../src/observability/request-tracing.js", () => ({ registerRequestTraceHooks: vi.fn() }));
    const { buildAllowedFrontendOrigins } = await import("../../src/app.js");

    const defaults = buildAllowedFrontendOrigins(undefined);
    expect(defaults).toEqual(expect.arrayContaining(["http://localhost:5173", "http://127.0.0.1:5173"]));

    const custom = buildAllowedFrontendOrigins("http://localhost:3000, invalid-url, http://localhost:3000");
    expect(custom).toEqual(expect.arrayContaining(["http://localhost:3000", "http://127.0.0.1:3000", "invalid-url"]));
  });

  it("buildApp wires cors, hooks, lifecycle and routes with optional infra-health skip", async () => {
    const app = {
      register: vi.fn().mockResolvedValue(undefined)
    };
    const fastifyFactory = vi.fn(() => app);
    const corsPlugin = Symbol("cors");
    const registerClientLifecycle = vi.fn();
    const registerHealthRoute = vi.fn().mockResolvedValue(undefined);
    const registerInfrastructureHealthRoute = vi.fn().mockResolvedValue(undefined);
    const registerApiRoutes = vi.fn().mockResolvedValue(undefined);
    const registerMetricsRoutes = vi.fn().mockResolvedValue(undefined);
    const registerRequestMetricsHooks = vi.fn();
    const registerRequestTraceHooks = vi.fn();

    vi.doMock("fastify", () => ({ default: fastifyFactory }));
    vi.doMock("@fastify/cors", () => ({ default: corsPlugin }));
    vi.doMock("../../src/clients/lifecycle.js", () => ({ registerClientLifecycle }));
    vi.doMock("../../src/api/routes/health.js", () => ({ registerHealthRoute }));
    vi.doMock("../../src/api/routes/infrastructure-health.js", () => ({ registerInfrastructureHealthRoute }));
    vi.doMock("../../src/api/routes/index.js", () => ({ registerApiRoutes }));
    vi.doMock("../../src/observability/metrics.js", () => ({ registerMetricsRoutes, registerRequestMetricsHooks }));
    vi.doMock("../../src/observability/request-tracing.js", () => ({ registerRequestTraceHooks }));

    process.env.FRONTEND_ORIGIN = "http://localhost:9999";
    const { buildApp } = await import("../../src/app.js");

    const apiDependencies = { chat: { createOrchestrator: vi.fn() } } as any;
    const built = await buildApp({ apiDependencies, registerInfrastructureHealth: false });

    expect(built).toBe(app);
    expect(fastifyFactory).toHaveBeenCalledWith({ logger: true });
    expect(app.register).toHaveBeenCalledWith(
      corsPlugin,
      expect.objectContaining({
        origin: expect.arrayContaining(["http://localhost:9999", "http://127.0.0.1:9999"]),
        methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"]
      })
    );
    expect(registerRequestMetricsHooks).toHaveBeenCalledWith(app);
    expect(registerRequestTraceHooks).toHaveBeenCalledWith(app);
    expect(registerClientLifecycle).toHaveBeenCalledWith(app);
    expect(registerHealthRoute).toHaveBeenCalledWith(app);
    expect(registerMetricsRoutes).toHaveBeenCalledWith(app);
    expect(registerInfrastructureHealthRoute).not.toHaveBeenCalled();
    expect(registerApiRoutes).toHaveBeenCalledWith(app, apiDependencies);
  });
});

describe("startup-checks.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("skips migration check when disabled", async () => {
    const assertMigrationsCurrent = vi.fn();
    vi.doMock("../../src/migrations/check-migrations.js", () => ({ assertMigrationsCurrent }));
    process.env.RUN_STARTUP_CHECKS = "false";

    const { runStartupChecks } = await import("../../src/startup/startup-checks.js");
    await runStartupChecks();

    expect(assertMigrationsCurrent).not.toHaveBeenCalled();
  });

  it("runs migration check when enabled", async () => {
    const assertMigrationsCurrent = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../src/migrations/check-migrations.js", () => ({ assertMigrationsCurrent }));
    process.env.RUN_STARTUP_CHECKS = "true";

    const { runStartupChecks } = await import("../../src/startup/startup-checks.js");
    await runStartupChecks();

    expect(assertMigrationsCurrent).toHaveBeenCalledTimes(1);
  });
});

describe("server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("resolvePort returns defaults for invalid inputs", async () => {
    vi.doMock("../../src/startup/startup-checks.js", () => ({ runStartupChecks: vi.fn() }));
    vi.doMock("../../src/app.js", () => ({ buildApp: vi.fn() }));
    const { resolvePort } = await import("../../src/server.js");

    expect(resolvePort(undefined)).toBe(3000);
    expect(resolvePort("")).toBe(3000);
    expect(resolvePort("0")).toBe(3000);
    expect(resolvePort("-1")).toBe(3000);
    expect(resolvePort("abc")).toBe(3000);
    expect(resolvePort("4321")).toBe(4321);
  });

  it("bootstrap runs startup checks and listens on parsed port", async () => {
    const runStartupChecks = vi.fn().mockResolvedValue(undefined);
    const listen = vi.fn().mockResolvedValue(undefined);
    const buildApp = vi.fn().mockResolvedValue({ listen });

    vi.doMock("../../src/startup/startup-checks.js", () => ({ runStartupChecks }));
    vi.doMock("../../src/app.js", () => ({ buildApp }));

    process.env.PORT = "4567";
    const { bootstrap } = await import("../../src/server.js");
    await bootstrap();

    expect(runStartupChecks).toHaveBeenCalledTimes(1);
    expect(buildApp).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith({ host: "0.0.0.0", port: 4567 });
  });
});
