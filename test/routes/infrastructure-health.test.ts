import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const infraMocks = vi.hoisted(() => ({
  getPostgresClient: vi.fn(),
  getOpenAIClient: vi.fn(),
  getQdrantClient: vi.fn()
}));

vi.mock("../../src/clients/postgres.js", () => ({
  getPostgresClient: infraMocks.getPostgresClient
}));

vi.mock("../../src/clients/openai.js", () => ({
  getOpenAIClient: infraMocks.getOpenAIClient
}));

vi.mock("../../src/clients/qdrant.js", () => ({
  getQdrantClient: infraMocks.getQdrantClient
}));

import { registerInfrastructureHealthRoute } from "../../src/api/routes/infrastructure-health.ts";

describe("registerInfrastructureHealthRoute", () => {
  beforeEach(() => {
    infraMocks.getPostgresClient.mockReset();
    infraMocks.getOpenAIClient.mockReset();
    infraMocks.getQdrantClient.mockReset();
  });

  it("returns client health statuses", async () => {
    infraMocks.getPostgresClient.mockResolvedValue({
      healthCheck: vi.fn().mockResolvedValue({ status: "ok" })
    });
    infraMocks.getOpenAIClient.mockResolvedValue({
      healthCheck: vi.fn().mockResolvedValue({ status: "error", details: "degraded" })
    });
    infraMocks.getQdrantClient.mockResolvedValue({
      healthCheck: vi.fn().mockResolvedValue({ status: "ok", details: "local" })
    });

    const app = Fastify();
    try {
      await registerInfrastructureHealthRoute(app);

      const response = await app.inject({
        method: "GET",
        url: "/infra/health"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "ok",
        clients: {
          postgres: { status: "ok" },
          openai: { status: "error", details: "degraded" },
          qdrant: { status: "ok", details: "local" }
        }
      });
    } finally {
      await app.close();
    }
  });

  it("returns 503 when dependency resolution throws", async () => {
    infraMocks.getPostgresClient.mockRejectedValue(new Error("postgres down"));
    infraMocks.getOpenAIClient.mockResolvedValue({
      healthCheck: vi.fn().mockResolvedValue({ status: "ok" })
    });
    infraMocks.getQdrantClient.mockResolvedValue({
      healthCheck: vi.fn().mockResolvedValue({ status: "ok" })
    });

    const app = Fastify();
    try {
      await registerInfrastructureHealthRoute(app);

      const response = await app.inject({
        method: "GET",
        url: "/infra/health"
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        status: "error",
        detail: "postgres down"
      });
    } finally {
      await app.close();
    }
  });
});
