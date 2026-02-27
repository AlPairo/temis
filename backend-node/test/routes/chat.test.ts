import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSse } from "../../tests/helpers/sse.ts";

const chatRouteMocks = vi.hoisted(() => {
  class MockJwtAuthError extends Error {
    readonly statusCode: number;

    constructor(message: string, statusCode = 401) {
      super(message);
      this.name = "JwtAuthError";
      this.statusCode = statusCode;
    }
  }

  return {
    resolveAuthenticatedUser: vi.fn(),
    JwtAuthError: MockJwtAuthError
  };
});

vi.mock("../../src/auth/service.js", () => ({
  resolveAuthenticatedUser: chatRouteMocks.resolveAuthenticatedUser,
  JwtAuthError: chatRouteMocks.JwtAuthError
}));

vi.mock("../../src/modules/chat/chat-orchestrator.js", () => ({
  ChatOrchestrator: class {
    async *streamReply() {
      return;
    }
  },
  toSafeUserErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "unknown error")
}));

vi.mock("../../src/modules/chat/chat-repository.js", () => ({
  ChatRepository: class {}
}));

import { registerChatRoutes } from "../../src/api/routes/chat.ts";

describe("registerChatRoutes", () => {
  beforeEach(() => {
    chatRouteMocks.resolveAuthenticatedUser.mockReset();
    chatRouteMocks.resolveAuthenticatedUser.mockResolvedValue(null);
  });

  it("returns validation errors for invalid bodies", async () => {
    const app = Fastify();
    try {
      await registerChatRoutes(app, {
        createChatRepository: () => ({ ensureConversationBySessionId: vi.fn() }) as never,
        createOrchestrator: () => ({ streamReply: vi.fn() }) as never
      });

      const response = await app.inject({
        method: "POST",
        url: "/chat/stream",
        payload: { session_id: "", message: "" }
      });

      expect(response.statusCode).toBe(422);
      const body = response.json();
      expect(body.detail).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ loc: ["body", "session_id"] }),
          expect.objectContaining({ loc: ["body", "message"] })
        ])
      );
    } finally {
      await app.close();
    }
  });

  it("returns jwt auth errors before starting the stream", async () => {
    chatRouteMocks.resolveAuthenticatedUser.mockRejectedValue(new chatRouteMocks.JwtAuthError("Missing bearer token", 401));

    const app = Fastify();
    try {
      await registerChatRoutes(app, {
        createChatRepository: () => ({ ensureConversationBySessionId: vi.fn() }) as never,
        createOrchestrator: () => ({ streamReply: vi.fn() }) as never
      });

      const response = await app.inject({
        method: "POST",
        url: "/chat/stream",
        payload: { session_id: "s-1", message: "hola" }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ detail: "Missing bearer token" });
    } finally {
      await app.close();
    }
  });

  it("streams sse events and passes request metadata to dependencies", async () => {
    const generateSessionTitle = vi.fn().mockResolvedValue("Titulo LLM");
    const ensureConversationBySessionId = vi.fn().mockResolvedValue({
      id: "conv-1",
      externalId: "session-1",
      userId: null,
      title: "Derivada de x^2",
      titleManual: false,
      deletedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: null
    });

    const streamReply = vi.fn(async function* (input: Record<string, unknown>) {
      expect(input).toMatchObject({
        conversationId: "conv-1",
        sessionId: "session-1",
        userId: null,
        userText: "Calcula la derivada de x^2",
        analysisEnabled: true,
        retrievalTopK: 4,
        model: "gpt-test",
        requestId: "req-123"
      });

      yield { type: "token", token: "Hola" };
      yield { type: "token", token: " mundo" };
      yield { type: "complete", content: "Hola mundo", messageId: "msg-9" };
    });

    const app = Fastify();
    try {
      await registerChatRoutes(app, {
        generateSessionTitle,
        createChatRepository: () =>
          ({
            ensureConversationBySessionId
          }) as never,
        createOrchestrator: () =>
          ({
            streamReply
          }) as never
      });

      const response = await app.inject({
        method: "POST",
        url: "/chat-stream",
        headers: {
          origin: "http://frontend.local",
          "x-request-id": "req-123"
        },
        payload: {
          session_id: "session-1",
          message: "Calcula la derivada de x^2",
          analysis_enabled: true,
          top_k: 4,
          chat_model: "gpt-test"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/event-stream");
      expect(response.headers["access-control-allow-origin"]).toBe("http://frontend.local");

      expect(ensureConversationBySessionId).toHaveBeenCalledWith(
        {
          sessionId: "session-1",
          userId: null,
          title: "Titulo LLM"
        }
      );
      expect(generateSessionTitle).toHaveBeenCalledWith({
        message: "Calcula la derivada de x^2",
        requestId: "req-123",
        sessionId: "session-1"
      });
      expect(streamReply).toHaveBeenCalledTimes(1);

      const events = parseSse(response.payload);
      expect(events.map((event) => event.event)).toEqual(["start", "meta", "token", "token", "end"]);
      expect(events[0]).toEqual({ event: "start", data: "[START]" });
      expect(JSON.parse(events[1].data)).toEqual({ sessionTitle: "Derivada de x^2" });
      expect(events[2]).toEqual({ event: "token", data: "Hola" });
      expect(events[3]).toEqual({ event: "token", data: "mundo" });
      expect(JSON.parse(events[4].data)).toEqual({
        status: "[END]",
        content: "Hola mundo",
        messageId: "msg-9"
      });
    } finally {
      await app.close();
    }
  });

  it("returns 403 when repository detects an ownership mismatch", async () => {
    const generateSessionTitle = vi.fn().mockResolvedValue("Titulo");
    const ensureConversationBySessionId = vi.fn().mockRejectedValue(new Error("Conversation ownership mismatch"));

    const app = Fastify();
    try {
      await registerChatRoutes(app, {
        generateSessionTitle,
        createChatRepository: () =>
          ({
            ensureConversationBySessionId
          }) as never,
        createOrchestrator: () =>
          ({
            streamReply: vi.fn()
          }) as never
      });

      const response = await app.inject({
        method: "POST",
        url: "/chat/stream",
        payload: {
          session_id: "session-1",
          message: "hola"
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().detail).toContain("No autorizado");
    } finally {
      await app.close();
    }
  });
});
