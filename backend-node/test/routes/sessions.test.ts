import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryChatRepository } from "../../tests/helpers/in-memory-chat-repository.ts";

const sessionRouteMocks = vi.hoisted(() => {
  class MockJwtAuthError extends Error {
    readonly statusCode: number;

    constructor(message: string, statusCode = 401) {
      super(message);
      this.name = "JwtAuthError";
      this.statusCode = statusCode;
    }
  }

  return {
    JwtAuthError: MockJwtAuthError,
    buildSessionViewerScope: vi.fn(),
    canViewerDeleteOwnSession: vi.fn(),
    canViewerRenameOwnSession: vi.fn(),
    canViewerUseDeletedFilter: vi.fn(),
    isOwner: vi.fn()
  };
});

vi.mock("../../src/auth/service.js", () => ({
  JwtAuthError: sessionRouteMocks.JwtAuthError,
  buildSessionViewerScope: sessionRouteMocks.buildSessionViewerScope,
  canViewerDeleteOwnSession: sessionRouteMocks.canViewerDeleteOwnSession,
  canViewerRenameOwnSession: sessionRouteMocks.canViewerRenameOwnSession,
  canViewerUseDeletedFilter: sessionRouteMocks.canViewerUseDeletedFilter,
  isOwner: sessionRouteMocks.isOwner
}));

import { registerSessionRoutes } from "../../src/api/routes/sessions.ts";

describe("registerSessionRoutes", () => {
  beforeEach(() => {
    sessionRouteMocks.buildSessionViewerScope.mockReset();
    sessionRouteMocks.canViewerDeleteOwnSession.mockReset();
    sessionRouteMocks.canViewerRenameOwnSession.mockReset();
    sessionRouteMocks.canViewerUseDeletedFilter.mockReset();
    sessionRouteMocks.isOwner.mockReset();

    sessionRouteMocks.buildSessionViewerScope.mockResolvedValue({
      viewer: null,
      visibleUserIds: null,
      includeDeleted: false
    });
    sessionRouteMocks.canViewerDeleteOwnSession.mockReturnValue(true);
    sessionRouteMocks.canViewerRenameOwnSession.mockReturnValue(true);
    sessionRouteMocks.canViewerUseDeletedFilter.mockReturnValue(true);
    sessionRouteMocks.isOwner.mockImplementation((viewer, ownerUserId) => !viewer || viewer.userId === ownerUserId);
  });

  it("lists active sessions with API response field mapping", async () => {
    const repo = new InMemoryChatRepository();
    await repo.ensureConversationBySessionId({ sessionId: "s-1", userId: "user-1", title: "Consulta inicial" });
    await repo.appendMessage({ conversationId: "conv-1", role: "user", content: "hola" });
    await repo.appendMessage({ conversationId: "conv-1", role: "assistant", content: "respuesta" });

    await repo.ensureConversationBySessionId({ sessionId: "s-2", userId: "user-2", title: "Eliminada" });
    await repo.softDeleteSession("s-2");

    const app = Fastify();
    try {
      await registerSessionRoutes(app, {
        createChatRepository: () => repo
      });

      const response = await app.inject({
        method: "GET",
        url: "/sessions"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        {
          session_id: "s-1",
          title: "Consulta inicial",
          turns: 2,
          last_message: "hola",
          is_deleted: false,
          deleted_at: null,
          owner_user_id: "user-1",
          can_rename: true,
          can_delete: true
        }
      ]);
    } finally {
      await app.close();
    }
  });

  it("rejects include_deleted when viewer lacks permission", async () => {
    sessionRouteMocks.buildSessionViewerScope.mockResolvedValue({
      viewer: { userId: "user-1", role: "basic" },
      visibleUserIds: ["user-1"],
      includeDeleted: true
    });
    sessionRouteMocks.canViewerUseDeletedFilter.mockReturnValue(false);

    const app = Fastify();
    try {
      await registerSessionRoutes(app, {
        createChatRepository: () => new InMemoryChatRepository()
      });

      const response = await app.inject({
        method: "GET",
        url: "/sessions?include_deleted=true"
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().detail).toContain("eliminadas");
    } finally {
      await app.close();
    }
  });

  it("returns session details with history", async () => {
    const repo = new InMemoryChatRepository();
    const conversation = await repo.ensureConversationBySessionId({
      sessionId: "s-1",
      userId: "user-1",
      title: "Sesion de prueba"
    });
    await repo.appendMessage({ conversationId: conversation.id, role: "user", content: "hola" });
    await repo.appendMessage({ conversationId: conversation.id, role: "assistant", content: "mundo" });

    const app = Fastify();
    try {
      await registerSessionRoutes(app, {
        createChatRepository: () => repo
      });

      const response = await app.inject({
        method: "GET",
        url: "/sessions/s-1"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        session_id: "s-1",
        title: "Sesion de prueba",
        is_deleted: false,
        deleted_at: null,
        owner_user_id: "user-1",
        can_rename: true,
        can_delete: true,
        history: [
          { role: "user", content: "hola" },
          { role: "assistant", content: "mundo" }
        ]
      });
    } finally {
      await app.close();
    }
  });

  it("preserves citations and lowConfidence in session history responses", async () => {
    const repo = new InMemoryChatRepository();
    const getSessionByIdSpy = vi.spyOn(repo, "getSessionById").mockResolvedValue({
      conversationId: "conv-1",
      sessionId: "s-1",
      ownerUserId: "user-1",
      title: "Sesion de prueba",
      deletedAt: null,
      history: [
        { role: "user", content: "hola" },
        {
          role: "assistant",
          content: "mundo",
          citations: [{ id: "d1:c1", doc_id: "d1", chunk_id: "c1", score: 0.8 }],
          lowConfidence: false
        }
      ]
    });

    const app = Fastify();
    try {
      await registerSessionRoutes(app, {
        createChatRepository: () => repo
      });

      const response = await app.inject({
        method: "GET",
        url: "/sessions/s-1"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().history).toEqual([
        { role: "user", content: "hola" },
        {
          role: "assistant",
          content: "mundo",
          citations: [{ id: "d1:c1", doc_id: "d1", chunk_id: "c1", score: 0.8 }],
          lowConfidence: false
        }
      ]);
      expect(getSessionByIdSpy).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("renames a session", async () => {
    const repo = new InMemoryChatRepository();
    await repo.ensureConversationBySessionId({ sessionId: "s-1", userId: "user-1", title: "Viejo" });

    const app = Fastify();
    try {
      await registerSessionRoutes(app, {
        createChatRepository: () => repo
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/sessions/s-1",
        payload: {
          title: "  Nuevo titulo  "
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        session_id: "s-1",
        title: "Nuevo titulo",
        updated: true
      });
    } finally {
      await app.close();
    }
  });

  it("soft deletes a session", async () => {
    const repo = new InMemoryChatRepository();
    await repo.ensureConversationBySessionId({ sessionId: "s-1", userId: "user-1", title: "Eliminar" });

    const app = Fastify();
    try {
      await registerSessionRoutes(app, {
        createChatRepository: () => repo
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/sessions/s-1"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        detail: expect.stringContaining("s-1"),
        deleted: true
      });

      const afterDelete = await repo.getSessionById("s-1");
      expect(afterDelete).toBeNull();
      const deletedVisible = await repo.getSessionById("s-1", { includeDeleted: true });
      expect(deletedVisible?.deletedAt).toBeInstanceOf(Date);
    } finally {
      await app.close();
    }
  });

  it("returns 405 for POST /sessions", async () => {
    const app = Fastify();
    try {
      await registerSessionRoutes(app, {
        createChatRepository: () => new InMemoryChatRepository()
      });

      const response = await app.inject({
        method: "POST",
        url: "/sessions"
      });

      expect(response.statusCode).toBe(405);
      expect(response.json()).toEqual({ detail: "Method Not Allowed" });
    } finally {
      await app.close();
    }
  });

  it("validates rename payloads", async () => {
    const app = Fastify();
    try {
      await registerSessionRoutes(app, {
        createChatRepository: () => new InMemoryChatRepository()
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/sessions/s-1",
        payload: {
          title: "   "
        }
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().detail).toEqual(
        expect.arrayContaining([expect.objectContaining({ loc: ["body", "title"] })])
      );
    } finally {
      await app.close();
    }
  });
});
