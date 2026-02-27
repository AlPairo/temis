import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type HookHandler = (...args: any[]) => any;

function createHookApp() {
  const hooks = new Map<string, HookHandler[]>();
  return {
    app: {
      addHook: vi.fn((name: string, handler: HookHandler) => {
        const list = hooks.get(name) ?? [];
        list.push(handler);
        hooks.set(name, list);
      }),
      get: vi.fn(),
      log: {
        info: vi.fn()
      }
    },
    hooks,
    firstHook(name: string): HookHandler {
      const handler = hooks.get(name)?.[0];
      if (!handler) {
        throw new Error(`Missing hook ${name}`);
      }
      return handler;
    }
  };
}

async function importLoggerModule() {
  return import("../../src/observability/logger.js");
}

describe("observability/logger", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("serializes info logs with correlation defaults", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const logger = await importLoggerModule();
    logger.logInfo("chat.request", { requestId: "req-1" }, { size: 2 });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    const payload = JSON.parse(infoSpy.mock.calls[0]![0] as string);
    expect(payload).toEqual({
      ts: "2026-02-25T12:00:00.000Z",
      level: "info",
      event: "chat.request",
      request_id: "req-1",
      conversation_id: null,
      session_id: null,
      size: 2
    });
  });

  it("suppresses debug logs at default info level", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const logger = await importLoggerModule();
    expect(logger.isLogLevelEnabled("debug")).toBe(false);

    logger.logDebug("chat.debug", {}, { foo: "bar" });
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("enables trace level from request trace mode fallback", async () => {
    vi.stubEnv("BACKEND_REQUEST_TRACE_MODE", "trace");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const logger = await importLoggerModule();
    expect(logger.isLogLevelEnabled("trace")).toBe(true);

    logger.logTrace("chat.trace", { sessionId: "s1" }, { step: "pre" });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(infoSpy.mock.calls[0]![0] as string);
    expect(payload.level).toBe("trace");
    expect(payload.session_id).toBe("s1");
    expect(payload.step).toBe("pre");
  });

  it("routes warn and error logs to the correct console methods", async () => {
    vi.stubEnv("BACKEND_LOG_LEVEL", "warn");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const logger = await importLoggerModule();
    expect(logger.isLogLevelEnabled("info")).toBe(false);
    expect(logger.isLogLevelEnabled("warn")).toBe(true);

    logger.logInfo("ignored", {}, {});
    logger.logWarn("warned", {}, { code: 1 });
    logger.logError("failed", {}, { code: 2 });

    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warnSpy.mock.calls[0]![0] as string).event).toBe("warned");
    expect(JSON.parse(errorSpy.mock.calls[0]![0] as string).event).toBe("failed");
  });
});

describe("observability/metrics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("records and serializes metric summaries", async () => {
    const metrics = await import("../../src/observability/metrics.js");
    metrics.resetMetrics();

    metrics.recordRequestLatency(10.123);
    metrics.recordRequestLatency(-5);
    metrics.recordStreamDuration(Number.NaN);
    metrics.recordRetrievalLatency(9);
    metrics.recordOpenAILatency(5.555);
    metrics.recordOpenAIUsage({ promptTokens: 2, completionTokens: 3, totalTokens: 5 });
    metrics.recordErrorRate("http_500");
    metrics.recordErrorRate("http_500");

    expect(metrics.getMetricsSnapshot()).toEqual({
      request_latency: { count: 2, avgMs: 5.06, minMs: 0, maxMs: 10.12 },
      stream_duration: { count: 1, avgMs: 0, minMs: 0, maxMs: 0 },
      retrieval_latency: { count: 1, avgMs: 9, minMs: 9, maxMs: 9 },
      openai_latency: { count: 1, avgMs: 5.56, minMs: 5.56, maxMs: 5.56 },
      openai_usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      error_rates: { http_500: 2 }
    });
  });

  it("registers a metrics route that returns the current snapshot", async () => {
    const metrics = await import("../../src/observability/metrics.js");
    metrics.resetMetrics();
    metrics.recordRequestLatency(7);

    const { app } = createHookApp();
    await metrics.registerMetricsRoutes(app as any);

    expect(app.get).toHaveBeenCalledTimes(1);
    expect(app.get.mock.calls[0]?.[0]).toBe("/metrics");

    const routeHandler = app.get.mock.calls[0]?.[1] as HookHandler;
    await expect(routeHandler()).resolves.toEqual(metrics.getMetricsSnapshot());
  });

  it("registers request hooks and records latency and errors", async () => {
    const metrics = await import("../../src/observability/metrics.js");
    metrics.resetMetrics();

    const { app, firstHook } = createHookApp();
    metrics.registerRequestMetricsHooks(app as any);

    const onRequest = firstHook("onRequest");
    const onResponse = firstHook("onResponse");
    const onError = firstHook("onError");

    const reply = {
      statusCode: 503,
      header: vi.fn()
    };
    const request = {
      id: "req-123"
    };

    await onRequest(request, reply);
    vi.advanceTimersByTime(25);
    await onResponse(request, reply);

    const secondReply = { statusCode: 500 };
    await onError({}, secondReply);

    expect(reply.header).toHaveBeenCalledWith("x-request-id", "req-123");
    expect(metrics.getMetricsSnapshot()).toEqual({
      request_latency: { count: 1, avgMs: 25, minMs: 25, maxMs: 25 },
      stream_duration: { count: 0, avgMs: 0, minMs: 0, maxMs: 0 },
      retrieval_latency: { count: 0, avgMs: 0, minMs: 0, maxMs: 0 },
      openai_latency: { count: 0, avgMs: 0, minMs: 0, maxMs: 0 },
      openai_usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      error_rates: { http_503: 1, http_500: 1 }
    });
  });
});

describe("observability/request-tracing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.doUnmock("../../src/observability/logger.js");
  });

  async function importRequestTracingWithLoggerMocks() {
    const logger = {
      logInfo: vi.fn(),
      logDebug: vi.fn(),
      logTrace: vi.fn()
    };

    vi.doMock("../../src/observability/logger.js", () => logger);
    const mod = await import("../../src/observability/request-tracing.js");

    return { mod, logger };
  }

  it("does nothing when tracing is disabled", async () => {
    const { mod, logger } = await importRequestTracingWithLoggerMocks();
    const { app } = createHookApp();

    mod.registerRequestTraceHooks(app as any);

    expect(app.addHook).not.toHaveBeenCalled();
    expect(logger.logInfo).not.toHaveBeenCalled();
  });

  it("registers debug hooks and logs request lifecycle summaries", async () => {
    vi.stubEnv("BACKEND_REQUEST_TRACE", "true");
    const { mod, logger } = await importRequestTracingWithLoggerMocks();
    const { app, firstHook, hooks } = createHookApp();

    mod.registerRequestTraceHooks(app as any);

    expect(logger.logInfo).toHaveBeenCalledWith(
      "http.trace.enabled",
      {},
      expect.objectContaining({ mode: "debug", backend_log_level: "info" })
    );
    expect(hooks.has("preValidation")).toBe(false);
    expect(hooks.has("preHandler")).toBe(false);
    expect(hooks.has("onSend")).toBe(false);

    const request = {
      id: "req-1",
      method: "POST",
      url: "/chat?x=1",
      routeOptions: { url: "/chat" },
      headers: {
        host: "localhost",
        origin: "http://localhost:5173",
        "user-agent": "vitest",
        accept: "application/json",
        "content-type": "application/json",
        "content-length": "12",
        "x-request-id": "client-id"
      },
      query: { x: "1" },
      body: { ignored: true },
      params: { id: "p1" }
    };
    const reply = {
      statusCode: 418
    };

    await firstHook("onRequest")(request, reply);
    vi.advanceTimersByTime(40);
    await firstHook("onError")(request, reply, new Error("boom"));
    await firstHook("onResponse")(request, reply);

    expect(logger.logDebug).toHaveBeenCalledWith(
      "http.request.start",
      { requestId: "req-1" },
      expect.objectContaining({
        method: "POST",
        route: "/chat",
        status_code: 418,
        query: { x: "1" },
        headers: expect.objectContaining({
          host: "localhost",
          "x-request-id": "client-id"
        })
      })
    );
    expect(logger.logDebug).toHaveBeenCalledWith(
      "http.request.error",
      { requestId: "req-1" },
      expect.objectContaining({
        error_name: "Error",
        error_message: "boom"
      })
    );
    expect(logger.logDebug).toHaveBeenCalledWith(
      "http.request.complete",
      { requestId: "req-1" },
      expect.objectContaining({
        duration_ms: 40
      })
    );
  });

  it("registers trace-only hooks and summarizes bodies and payloads", async () => {
    vi.stubEnv("BACKEND_REQUEST_TRACE_MODE", "trace");
    const { mod, logger } = await importRequestTracingWithLoggerMocks();
    const { app, firstHook, hooks } = createHookApp();

    mod.registerRequestTraceHooks(app as any);

    expect(hooks.has("preValidation")).toBe(true);
    expect(hooks.has("preHandler")).toBe(true);
    expect(hooks.has("onSend")).toBe(true);

    const request = {
      id: "req-trace",
      method: "GET",
      url: "/items/1",
      routeOptions: { url: "/items/:id" },
      headers: {},
      query: null,
      body: { foo: "bar", baz: 1 },
      params: { id: "1" }
    };
    const reply = {
      statusCode: 200
    };

    await firstHook("onRequest")(request, reply);
    await firstHook("preValidation")(request, reply);
    await firstHook("preHandler")(request, reply);
    const payload = await firstHook("onSend")(request, reply, "ok");
    vi.advanceTimersByTime(15);
    await firstHook("onResponse")(request, reply);

    expect(payload).toBe("ok");
    expect(logger.logTrace).toHaveBeenCalledWith(
      "http.request.pre_validation",
      { requestId: "req-trace" },
      expect.objectContaining({
        body: {
          type: "object",
          key_count: 2,
          keys: ["foo", "baz"]
        }
      })
    );
    expect(logger.logTrace).toHaveBeenCalledWith(
      "http.request.pre_handler",
      { requestId: "req-trace" },
      expect.objectContaining({ params: { id: "1" } })
    );
    expect(logger.logTrace).toHaveBeenCalledWith(
      "http.response.on_send",
      { requestId: "req-trace" },
      expect.objectContaining({ payload: { type: "string", length: 2 } })
    );
    expect(logger.logTrace).toHaveBeenCalledWith(
      "http.request.complete",
      { requestId: "req-trace" },
      expect.objectContaining({ duration_ms: 15 })
    );
  });
});
