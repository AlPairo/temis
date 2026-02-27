import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

interface LatencySummary {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
}

interface OpenAIUsageSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface MetricsState {
  requestLatency: LatencySummary;
  streamDuration: LatencySummary;
  retrievalLatency: LatencySummary;
  openAILatency: LatencySummary;
  openAIUsage: OpenAIUsageSummary;
  errorRates: Record<string, number>;
}

const createLatencySummary = (): LatencySummary => ({
  count: 0,
  totalMs: 0,
  minMs: Number.POSITIVE_INFINITY,
  maxMs: 0
});

const state: MetricsState = {
  requestLatency: createLatencySummary(),
  streamDuration: createLatencySummary(),
  retrievalLatency: createLatencySummary(),
  openAILatency: createLatencySummary(),
  openAIUsage: {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  },
  errorRates: {}
};

const REQUEST_START_TIME = Symbol("request_start_time");

const recordLatency = (summary: LatencySummary, durationMs: number): void => {
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  summary.count += 1;
  summary.totalMs += safeDuration;
  summary.minMs = Math.min(summary.minMs, safeDuration);
  summary.maxMs = Math.max(summary.maxMs, safeDuration);
};

const roundTo2Decimals = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const serializeLatency = (summary: LatencySummary): { count: number; avgMs: number; minMs: number; maxMs: number } => {
  if (summary.count === 0) {
    return { count: 0, avgMs: 0, minMs: 0, maxMs: 0 };
  }
  return {
    count: summary.count,
    avgMs: roundTo2Decimals(summary.totalMs / summary.count),
    minMs: roundTo2Decimals(summary.minMs),
    maxMs: roundTo2Decimals(summary.maxMs)
  };
};

export const recordRequestLatency = (durationMs: number): void => {
  recordLatency(state.requestLatency, durationMs);
};

export const recordStreamDuration = (durationMs: number): void => {
  recordLatency(state.streamDuration, durationMs);
};

export const recordRetrievalLatency = (durationMs: number): void => {
  recordLatency(state.retrievalLatency, durationMs);
};

export const recordOpenAILatency = (durationMs: number): void => {
  recordLatency(state.openAILatency, durationMs);
};

export const recordOpenAIUsage = (usage: {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}): void => {
  state.openAIUsage.promptTokens += usage.promptTokens ?? 0;
  state.openAIUsage.completionTokens += usage.completionTokens ?? 0;
  state.openAIUsage.totalTokens += usage.totalTokens ?? 0;
};

export const recordErrorRate = (key: string): void => {
  state.errorRates[key] = (state.errorRates[key] ?? 0) + 1;
};

export const getMetricsSnapshot = (): Record<string, unknown> => ({
  request_latency: serializeLatency(state.requestLatency),
  stream_duration: serializeLatency(state.streamDuration),
  retrieval_latency: serializeLatency(state.retrievalLatency),
  openai_latency: serializeLatency(state.openAILatency),
  openai_usage: state.openAIUsage,
  error_rates: state.errorRates
});

export const resetMetrics = (): void => {
  state.requestLatency = createLatencySummary();
  state.streamDuration = createLatencySummary();
  state.retrievalLatency = createLatencySummary();
  state.openAILatency = createLatencySummary();
  state.openAIUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  };
  state.errorRates = {};
};

export const registerMetricsRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/metrics", async () => getMetricsSnapshot());
};

export const registerRequestMetricsHooks = (app: FastifyInstance): void => {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    (request as unknown as Record<symbol, number>)[REQUEST_START_TIME] = Date.now();
    reply.header("x-request-id", request.id);
  });

  app.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    const startedAt = (request as unknown as Record<symbol, number>)[REQUEST_START_TIME] ?? Date.now();
    recordRequestLatency(Date.now() - startedAt);
    if (reply.statusCode >= 400) {
      recordErrorRate(`http_${reply.statusCode}`);
    }
  });

  app.addHook("onError", async (_request, reply) => {
    recordErrorRate(`http_${reply.statusCode || 500}`);
  });
};
