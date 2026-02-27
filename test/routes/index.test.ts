import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const indexRouteMocks = vi.hoisted(() => ({
  registerChatRoutes: vi.fn(),
  registerDocumentRoutes: vi.fn(),
  registerSessionRoutes: vi.fn()
}));

vi.mock("../../src/api/routes/chat.js", () => ({
  registerChatRoutes: indexRouteMocks.registerChatRoutes
}));

vi.mock("../../src/api/routes/documents.js", () => ({
  registerDocumentRoutes: indexRouteMocks.registerDocumentRoutes
}));

vi.mock("../../src/api/routes/sessions.js", () => ({
  registerSessionRoutes: indexRouteMocks.registerSessionRoutes
}));

import { registerApiRoutes } from "../../src/api/routes/index.ts";

describe("registerApiRoutes", () => {
  beforeEach(() => {
    indexRouteMocks.registerChatRoutes.mockReset();
    indexRouteMocks.registerDocumentRoutes.mockReset();
    indexRouteMocks.registerSessionRoutes.mockReset();

    indexRouteMocks.registerChatRoutes.mockImplementation(async (app, dependencies) => {
      app.get("/_chat-probe", async () => ({
        route: "chat",
        hasRepositoryFactory: typeof dependencies?.createChatRepository === "function",
        hasOrchestratorFactory: typeof dependencies?.createOrchestrator === "function"
      }));
    });

    indexRouteMocks.registerSessionRoutes.mockImplementation(async (app, dependencies) => {
      app.get("/_sessions-probe", async () => ({
        route: "sessions",
        hasRepositoryFactory: typeof dependencies?.createChatRepository === "function"
      }));
    });

    indexRouteMocks.registerDocumentRoutes.mockImplementation(async (app, dependencies) => {
      app.get("/_documents-probe", async () => ({
        route: "documents",
        hasRepositoryFactory: typeof dependencies?.createDocumentRegistryRepository === "function"
      }));
    });
  });

  it("registers chat and session routes with forwarded nested dependencies", async () => {
    const apiDependencies = {
      chat: {
        createChatRepository: () => ({}) as never,
        createOrchestrator: () => ({}) as never
      },
      sessions: {
        createChatRepository: () => ({}) as never
      },
      documents: {
        createDocumentRegistryRepository: () => ({}) as never
      }
    };

    const app = Fastify();
    try {
      await registerApiRoutes(app, apiDependencies);

      const [chatProbe, documentsProbe, sessionsProbe] = await Promise.all([
        app.inject({ method: "GET", url: "/_chat-probe" }),
        app.inject({ method: "GET", url: "/_documents-probe" }),
        app.inject({ method: "GET", url: "/_sessions-probe" })
      ]);

      expect(chatProbe.statusCode).toBe(200);
      expect(chatProbe.json()).toEqual({
        route: "chat",
        hasRepositoryFactory: true,
        hasOrchestratorFactory: true
      });

      expect(documentsProbe.statusCode).toBe(200);
      expect(documentsProbe.json()).toEqual({
        route: "documents",
        hasRepositoryFactory: true
      });

      expect(sessionsProbe.statusCode).toBe(200);
      expect(sessionsProbe.json()).toEqual({
        route: "sessions",
        hasRepositoryFactory: true
      });

      expect(indexRouteMocks.registerChatRoutes).toHaveBeenCalledTimes(1);
      expect(indexRouteMocks.registerDocumentRoutes).toHaveBeenCalledTimes(1);
      expect(indexRouteMocks.registerSessionRoutes).toHaveBeenCalledTimes(1);
      expect(indexRouteMocks.registerChatRoutes.mock.calls[0]?.[0]).toBe(app);
      expect(indexRouteMocks.registerChatRoutes.mock.calls[0]?.[1]).toBe(apiDependencies.chat);
      expect(indexRouteMocks.registerDocumentRoutes.mock.calls[0]?.[0]).toBe(app);
      expect(indexRouteMocks.registerDocumentRoutes.mock.calls[0]?.[1]).toBe(apiDependencies.documents);
      expect(indexRouteMocks.registerSessionRoutes.mock.calls[0]?.[0]).toBe(app);
      expect(indexRouteMocks.registerSessionRoutes.mock.calls[0]?.[1]).toBe(apiDependencies.sessions);
    } finally {
      await app.close();
    }
  });
});
