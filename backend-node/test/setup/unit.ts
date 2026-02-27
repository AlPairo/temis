import { afterEach, beforeEach, vi } from "vitest";

const ENV_SNAPSHOT = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

afterEach(async () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ENV_SNAPSHOT)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ENV_SNAPSHOT)) {
    process.env[key] = value;
  }

  const resetters = await Promise.allSettled([
    import("../../src/clients/openai.js").then((m) => m.resetOpenAIClientForTests?.()),
    import("../../src/clients/postgres.js").then((m) => m.resetPostgresClientForTests?.()),
    import("../../src/clients/qdrant.js").then((m) => m.resetQdrantClientForTests?.())
  ]);

  for (const result of resetters) {
    if (result.status === "rejected") {
      // Ignore reset failures for modules not loaded in a given test.
    }
  }
});
