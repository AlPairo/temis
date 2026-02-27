import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerHealthRoute } from "../../src/api/routes/health.ts";

describe("registerHealthRoute", () => {
  it("returns ok status", async () => {
    const app = Fastify();
    try {
      await registerHealthRoute(app);

      const response = await app.inject({
        method: "GET",
        url: "/health"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    } finally {
      await app.close();
    }
  });
});
