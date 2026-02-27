import type { FastifyInstance } from "fastify";

export async function registerInfrastructureHealthRoute(app: FastifyInstance): Promise<void> {
  app.get("/infra/health", async (_request, reply) => {
    try {
      const [openaiModule, postgresModule, qdrantModule] = await Promise.all([
        import("../../clients/openai.js"),
        import("../../clients/postgres.js"),
        import("../../clients/qdrant.js")
      ]);

      const [postgres, openai, qdrant] = await Promise.all([
        postgresModule.getPostgresClient(),
        openaiModule.getOpenAIClient(),
        qdrantModule.getQdrantClient()
      ]);

      const [postgresHealth, openaiHealth, qdrantHealth] = await Promise.all([
        postgres.healthCheck(),
        openai.healthCheck(),
        qdrant.healthCheck()
      ]);

      return {
        status: "ok",
        clients: {
          postgres: postgresHealth,
          openai: openaiHealth,
          qdrant: qdrantHealth
        }
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      reply.code(503);
      return {
        status: "error",
        detail
      };
    }
  });
}
