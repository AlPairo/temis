import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logDebug: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
  logTrace: vi.fn(),
  recordErrorRate: vi.fn(),
  recordOpenAILatency: vi.fn(),
  recordOpenAIUsage: vi.fn()
}));

vi.mock("../../src/observability/logger.js", () => ({
  logDebug: mocks.logDebug,
  logError: mocks.logError,
  logInfo: mocks.logInfo,
  logTrace: mocks.logTrace
}));

vi.mock("../../src/observability/metrics.js", () => ({
  recordErrorRate: mocks.recordErrorRate,
  recordOpenAILatency: mocks.recordOpenAILatency,
  recordOpenAIUsage: mocks.recordOpenAIUsage
}));

import { ChatOrchestrator, toSafeUserErrorMessage } from "../../src/modules/chat/chat-orchestrator.js";
import type { RetrievalResult } from "../../src/modules/rag/types.js";

const collect = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
};

const emptyRetrieval = (): RetrievalResult => ({
  chunks: [],
  citations: [],
  latencyMs: 10,
  lowConfidence: true
});

describe("modules/chat/chat-orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("toSafeUserErrorMessage", () => {
    it("returns infrastructure-safe message for infra-like errors", () => {
      const error = new Error("wrapper");
      (error as Error & { cause?: unknown }).cause = new Error("Qdrant connection error");

      expect(toSafeUserErrorMessage(error)).toBe(
        "Actualmente el servicio se encuentra con errores, contactar con soporte t\u00e9cnico."
      );
    });

    it("returns generic safe message for non-infrastructure failures", () => {
      expect(toSafeUserErrorMessage(new Error("validation failed"))).toBe(
        "I could not complete this response right now. Please try again."
      );
      expect(toSafeUserErrorMessage({ message: "nope" })).toBe(
        "I could not complete this response right now. Please try again."
      );
    });
  });

  it("streams a successful reply, persists events/messages, and records observability metrics", async () => {
    const appendMessage = vi
      .fn()
      .mockResolvedValueOnce({ id: "user-msg-1" })
      .mockResolvedValueOnce({ id: "assistant-msg-1" });
    const appendRetrievalEvent = vi.fn().mockResolvedValue({ id: 101 });
    const getConversationMessages = vi.fn().mockResolvedValue([{ role: "user", content: "prior" }]);
    const auditAppendEvent = vi.fn().mockResolvedValue({ id: 1 });
    const retrieveMock = vi.fn().mockResolvedValue({
      chunks: [{ doc_id: "d1", chunk_id: "c1", text: "law text", score: 0.8, metadata: {} }],
      citations: [{ id: "d1:c1", doc_id: "d1", chunk_id: "c1", score: 0.8 }],
      latencyMs: 12,
      lowConfidence: false
    } satisfies RetrievalResult);
    const buildPrompt = vi.fn().mockReturnValue({
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hello" }]
    });
    const streamOpenAI = vi.fn(async function* () {
      yield { type: "usage" as const, usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } };
      yield { type: "token" as const, token: "Hola" };
      yield " mundo";
      yield { type: "ignored" } as unknown as { type: "token"; token: string };
    });

    const orchestrator = new ChatOrchestrator({
      chatRepository: {
        appendMessage,
        appendRetrievalEvent,
        getConversationMessages
      },
      auditRepository: {
        appendEvent: auditAppendEvent
      },
      retrieve: retrieveMock,
      buildPrompt,
      streamOpenAI
    });

    const events = await collect(
      orchestrator.streamReply({
        conversationId: "conv-1",
        sessionId: "sess-1",
        userId: "user-1",
        userText: "  hola mundo  ",
        analysisEnabled: true,
        model: "gpt-test",
        requestId: "req-1",
        retrievalTopK: 3
      })
    );

    const reasoningEvents = events.filter((event) => event.type === "reasoning");
    expect(events[0]).toMatchObject({ type: "reasoning", stage: "request_received" });
    expect(reasoningEvents.map((event) => event.stage)).toEqual([
      "request_received",
      "retrieval_started",
      "retrieval_completed",
      "prompt_built",
      "model_generation_started",
      "final_synthesis_completed"
    ]);
    expect(reasoningEvents.every((event) => typeof event.ts === "string" && event.ts.length > 0)).toBe(true);

    const nonReasoningEvents = events.filter((event) => event.type !== "reasoning");
    expect(nonReasoningEvents).toEqual([
      { type: "token", token: "Hola" },
      { type: "token", token: " mundo" },
      {
        type: "complete",
        messageId: "assistant-msg-1",
        content: "Hola mundo",
        citations: [{ id: "d1:c1", doc_id: "d1", chunk_id: "c1", score: 0.8 }],
        lowConfidence: false
      }
    ]);

    expect(appendMessage).toHaveBeenNthCalledWith(1, {
      conversationId: "conv-1",
      userId: "user-1",
      role: "user",
      content: "hola mundo"
    });
    expect(retrieveMock).toHaveBeenCalledWith({
      query: "hola mundo",
      filters: undefined,
      topK: 3,
      disableRerank: true,
      requestId: "req-1",
      conversationId: "conv-1"
    });
    expect(appendRetrievalEvent).toHaveBeenCalledWith({
      conversationId: "conv-1",
      messageId: "user-msg-1",
      userId: "user-1",
      query: "hola mundo",
      queryType: "analysis",
      results: expect.objectContaining({ lowConfidence: false })
    });
    expect(buildPrompt).toHaveBeenCalledWith({
      history: [{ role: "user", content: "prior" }],
      retrieval: expect.objectContaining({ citations: expect.any(Array) }),
      userText: "hola mundo",
      queryType: "analysis"
    });
    expect(streamOpenAI).toHaveBeenCalledWith({
      model: "gpt-test",
      messages: [{ role: "user", content: "hello" }]
    });
    expect(appendMessage).toHaveBeenNthCalledWith(2, {
      conversationId: "conv-1",
      userId: "user-1",
      role: "assistant",
      content: "Hola mundo"
    });

    const auditEventTypes = auditAppendEvent.mock.calls.map((call) => call[0].eventType);
    expect(auditEventTypes).toEqual(["chat.start", "chat.model_call", "chat.complete"]);
    expect(mocks.recordOpenAIUsage).toHaveBeenCalledWith({
      promptTokens: 2,
      completionTokens: 3,
      totalTokens: 5
    });
    expect(mocks.recordOpenAILatency).toHaveBeenCalledWith(expect.any(Number));
    expect(mocks.recordErrorRate).not.toHaveBeenCalled();
    expect(mocks.logInfo).toHaveBeenCalledWith(
      "chat.openai.complete",
      expect.objectContaining({ requestId: "req-1", conversationId: "conv-1", sessionId: "sess-1" }),
      expect.objectContaining({ total_tokens: 5 })
    );
    expect(mocks.logInfo).toHaveBeenCalledWith(
      "chat.openai.response_text",
      expect.objectContaining({ requestId: "req-1", conversationId: "conv-1", sessionId: "sess-1" }),
      expect.objectContaining({ assistant_text: "Hola mundo", assistant_chars: 10 })
    );
  });

  it("emits an error event, records audit/logs, and uses the infrastructure-safe message on failures", async () => {
    const appendMessage = vi.fn().mockResolvedValue({ id: "user-msg-1" });
    const appendRetrievalEvent = vi.fn();
    const getConversationMessages = vi.fn();
    const auditAppendEvent = vi.fn().mockResolvedValue({ id: 1 });
    const retrieveError = new Error("Qdrant fetch failed");
    const retrieveMock = vi.fn().mockRejectedValue(retrieveError);

    const orchestrator = new ChatOrchestrator({
      chatRepository: {
        appendMessage,
        appendRetrievalEvent,
        getConversationMessages
      },
      auditRepository: {
        appendEvent: auditAppendEvent
      },
      retrieve: retrieveMock,
      buildPrompt: vi.fn(),
      streamOpenAI: vi.fn(async function* () {
        yield "unused";
      })
    });

    const events = await collect(
      orchestrator.streamReply({
        conversationId: "conv-1",
        userText: "Hola",
        analysisEnabled: true,
        userId: "user-1",
        requestId: "req-2"
      })
    );

    const reasoningEvents = events.filter((event) => event.type === "reasoning");
    expect(reasoningEvents.map((event) => event.stage)).toEqual(["request_received", "retrieval_started"]);
    expect(events.filter((event) => event.type !== "reasoning")).toEqual([
      {
        type: "error",
        safeMessage: "Actualmente el servicio se encuentra con errores, contactar con soporte t\u00e9cnico."
      }
    ]);
    expect(appendMessage).toHaveBeenCalledTimes(1);
    expect(appendRetrievalEvent).not.toHaveBeenCalled();
    expect(getConversationMessages).toHaveBeenCalledTimes(1);
    expect(mocks.recordErrorRate).toHaveBeenCalledWith("chat_orchestrator_error");
    expect(mocks.logError).toHaveBeenCalledWith(
      "chat.orchestrator.error",
      expect.objectContaining({ requestId: "req-2", conversationId: "conv-1" }),
      expect.objectContaining({
        error: "Qdrant fetch failed",
        failed_stage: "rag.retrieve.start"
      })
    );

    const auditEventTypes = auditAppendEvent.mock.calls.map((call) => call[0].eventType);
    expect(auditEventTypes).toEqual(["chat.start", "chat.error"]);
    expect(auditAppendEvent.mock.calls[1][0].payload).toEqual(
      expect.objectContaining({
        requestId: "req-2",
        failed: true,
        error: "Qdrant fetch failed"
      })
    );
  });

  it("uses the default model when none is provided", async () => {
    const appendMessage = vi
      .fn()
      .mockResolvedValueOnce({ id: "user-msg-1" })
      .mockResolvedValueOnce({ id: "assistant-msg-1" });
    const orchestrator = new ChatOrchestrator({
      chatRepository: {
        appendMessage,
        appendRetrievalEvent: vi.fn().mockResolvedValue({ id: 1 }),
        getConversationMessages: vi.fn().mockResolvedValue([])
      },
      auditRepository: {
        appendEvent: vi.fn().mockResolvedValue({ id: 1 })
      },
      retrieve: vi.fn().mockResolvedValue(emptyRetrieval()),
      buildPrompt: vi.fn().mockReturnValue({ systemPrompt: "sys", messages: [] }),
      streamOpenAI: vi.fn(async function* () {
        yield "ok";
      })
    });

    const events = await collect(
      orchestrator.streamReply({
        conversationId: "conv-2",
        userText: "Hola",
        analysisEnabled: true,
        requestId: "req-default-model"
      })
    );

    expect(events.at(-1)).toEqual({
      type: "complete",
      messageId: "assistant-msg-1",
      content: "ok",
      citations: [],
      lowConfidence: true
    });
  });

  it("returns docs-only content and skips the LLM call when analysis is disabled", async () => {
    const appendMessage = vi
      .fn()
      .mockResolvedValueOnce({ id: "user-msg-1" })
      .mockResolvedValueOnce({ id: "assistant-msg-1" });
    const appendRetrievalEvent = vi.fn().mockResolvedValue({ id: 10 });
    const getConversationMessages = vi.fn();
    const auditAppendEvent = vi.fn().mockResolvedValue({ id: 1 });
    const retrieveMock = vi.fn().mockResolvedValue({
      chunks: [{ doc_id: "d1", chunk_id: "c1", text: "Texto legal largo", score: 0.91, metadata: {} }],
      citations: [{ id: "d1:c1", doc_id: "d1", chunk_id: "c1", score: 0.91 }],
      latencyMs: 9,
      lowConfidence: false
    } satisfies RetrievalResult);
    const buildPrompt = vi.fn();
    const streamOpenAI = vi.fn(async function* () {
      yield "unused";
    });

    const orchestrator = new ChatOrchestrator({
      chatRepository: {
        appendMessage,
        appendRetrievalEvent,
        getConversationMessages
      },
      auditRepository: {
        appendEvent: auditAppendEvent
      },
      retrieve: retrieveMock,
      buildPrompt,
      streamOpenAI
    });

    const events = await collect(
      orchestrator.streamReply({
        conversationId: "conv-docs",
        userId: "user-1",
        userText: "consulta",
        analysisEnabled: false,
        requestId: "req-docs"
      })
    );

    expect(events.some((event) => event.type === "reasoning")).toBe(false);
    expect(events).toEqual([
      {
        type: "complete",
        messageId: "assistant-msg-1",
        content: expect.stringMatching(/Analisis desactivado/i),
        citations: [{ id: "d1:c1", doc_id: "d1", chunk_id: "c1", score: 0.91 }],
        lowConfidence: false
      }
    ]);
    expect(appendRetrievalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        queryType: "normal",
        query: "consulta"
      })
    );
    expect(getConversationMessages).toHaveBeenCalledTimes(1);
    expect(buildPrompt).not.toHaveBeenCalled();
    expect(streamOpenAI).not.toHaveBeenCalled();
    expect(auditAppendEvent.mock.calls.map((call) => call[0].eventType)).toEqual(["chat.start", "chat.complete"]);
  });

  it("resolves retry commands to the latest useful user query before retrieval", async () => {
    const appendMessage = vi
      .fn()
      .mockResolvedValueOnce({ id: "user-msg-1" })
      .mockResolvedValueOnce({ id: "assistant-msg-1" });
    const appendRetrievalEvent = vi.fn().mockResolvedValue({ id: 11 });
    const getConversationMessages = vi
      .fn()
      .mockResolvedValueOnce([
        { role: "user", content: "Necesito ayuda con despidos indebidos" },
        { role: "assistant", content: "respuesta previa" }
      ])
      .mockResolvedValueOnce([{ role: "user", content: "Necesito ayuda con despidos indebidos" }]);
    const retrieveMock = vi.fn().mockResolvedValue(emptyRetrieval());
    const buildPrompt = vi.fn().mockReturnValue({ systemPrompt: "sys", messages: [] });

    const orchestrator = new ChatOrchestrator({
      chatRepository: {
        appendMessage,
        appendRetrievalEvent,
        getConversationMessages
      },
      auditRepository: {
        appendEvent: vi.fn().mockResolvedValue({ id: 1 })
      },
      retrieve: retrieveMock,
      buildPrompt,
      streamOpenAI: vi.fn(async function* () {
        yield "ok";
      })
    });

    await collect(
      orchestrator.streamReply({
        conversationId: "conv-retry",
        userText: "vuelve a intentar",
        analysisEnabled: true,
        requestId: "req-retry"
      })
    );

    expect(retrieveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Necesito ayuda con despidos indebidos"
      })
    );
    expect(appendRetrievalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Necesito ayuda con despidos indebidos"
      })
    );
    expect(buildPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        userText: "Necesito ayuda con despidos indebidos"
      })
    );
  });

  it("merges retry suffix instructions with the previous user query", async () => {
    const appendMessage = vi
      .fn()
      .mockResolvedValueOnce({ id: "user-msg-1" })
      .mockResolvedValueOnce({ id: "assistant-msg-1" });
    const appendRetrievalEvent = vi.fn().mockResolvedValue({ id: 11 });
    const getConversationMessages = vi
      .fn()
      .mockResolvedValueOnce([{ role: "user", content: "Despido indirecto y salarios impagos" }])
      .mockResolvedValueOnce([{ role: "user", content: "Despido indirecto y salarios impagos" }]);
    const retrieveMock = vi.fn().mockResolvedValue(emptyRetrieval());
    const buildPrompt = vi.fn().mockReturnValue({ systemPrompt: "sys", messages: [] });

    const orchestrator = new ChatOrchestrator({
      chatRepository: {
        appendMessage,
        appendRetrievalEvent,
        getConversationMessages
      },
      auditRepository: {
        appendEvent: vi.fn().mockResolvedValue({ id: 1 })
      },
      retrieve: retrieveMock,
      buildPrompt,
      streamOpenAI: vi.fn(async function* () {
        yield "ok";
      })
    });

    await collect(
      orchestrator.streamReply({
        conversationId: "conv-retry-suffix",
        userText: "vuelve a intentar pero enfocate en jurisprudencia reciente",
        analysisEnabled: true,
        requestId: "req-retry-suffix"
      })
    );

    expect(retrieveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Despido indirecto y salarios impagos\nenfocate en jurisprudencia reciente"
      })
    );
    expect(appendRetrievalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Despido indirecto y salarios impagos\nenfocate en jurisprudencia reciente"
      })
    );
  });
});

