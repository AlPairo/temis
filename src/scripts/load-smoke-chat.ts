interface LoadSmokeConfig {
  baseUrl: string;
  concurrency: number;
  requests: number;
}

const parseIntEnv = (name: string, fallback: number): number => {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  if (Number.isNaN(value) || value <= 0) {
    return fallback;
  }
  return value;
};

const config: LoadSmokeConfig = {
  baseUrl: (process.env.CHAT_API_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, ""),
  concurrency: parseIntEnv("LOAD_SMOKE_CONCURRENCY", 10),
  requests: parseIntEnv("LOAD_SMOKE_REQUESTS", 50)
};

const runSingle = async (index: number): Promise<{ ok: boolean; latencyMs: number; status: number }> => {
  const startedAt = Date.now();
  const response = await fetch(`${config.baseUrl}/chat/stream`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": `load-smoke-${index}`
    },
    body: JSON.stringify({
      session_id: `load-smoke-session-${Math.floor(index / 2)}`,
      message: `ping-${index}`
    })
  });
  return {
    ok: response.ok,
    latencyMs: Date.now() - startedAt,
    status: response.status
  };
};

const worker = async (
  workerIndex: number,
  queue: number[],
  results: Array<{ ok: boolean; latencyMs: number; status: number }>
): Promise<void> => {
  while (queue.length > 0) {
    const item = queue.shift();
    if (item === undefined) {
      return;
    }
    try {
      results.push(await runSingle(item));
    } catch {
      results.push({ ok: false, latencyMs: 0, status: 0 });
    }
  }
  console.info(`[load-smoke] worker ${workerIndex} finished`);
};

const queue = Array.from({ length: config.requests }, (_, index) => index);
const results: Array<{ ok: boolean; latencyMs: number; status: number }> = [];
const startedAt = Date.now();

await Promise.all(
  Array.from({ length: config.concurrency }, (_, index) => worker(index + 1, queue, results))
);

const successful = results.filter((result) => result.ok);
const failed = results.length - successful.length;
const avgLatency =
  successful.length === 0 ? 0 : successful.reduce((acc, value) => acc + value.latencyMs, 0) / successful.length;
const p95Latency =
  successful.length === 0
    ? 0
    : [...successful].sort((a, b) => a.latencyMs - b.latencyMs)[Math.floor(successful.length * 0.95)]?.latencyMs ?? 0;

console.info(
  JSON.stringify({
    event: "load_smoke.complete",
    base_url: config.baseUrl,
    concurrency: config.concurrency,
    requests: config.requests,
    total_duration_ms: Date.now() - startedAt,
    success_count: successful.length,
    failed_count: failed,
    avg_latency_ms: Number(avgLatency.toFixed(2)),
    p95_latency_ms: p95Latency,
    statuses: results.reduce<Record<string, number>>((acc, result) => {
      const key = String(result.status);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {})
  })
);
