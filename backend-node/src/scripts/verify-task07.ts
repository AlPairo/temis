import assert from "node:assert/strict";
import { ChatOrchestrator } from "../modules/chat/chat-orchestrator.js";
import { buildPrompt } from "../modules/chat/prompt-builder.js";
import type { RetrievalResult } from "../modules/rag/types.js";

type StoredMessage = {
  id: string;
  conversationId: string;
  userId: string | null;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

class InMemoryChatRepository {
  private messageCounter = 0;
  private retrievalCounter = 0;
  readonly messages: StoredMessage[] = [];
  readonly retrievalEvents: Array<{ id: number; conversationId: string; query: string; queryType: string; results: unknown }> =
    [];

  async appendMessage(input: {
    conversationId: string;
    userId?: string | null;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
  }): Promise<{ id: string }> {
    this.messageCounter += 1;
    const id = `m-${this.messageCounter}`;
    this.messages.push({
      id,
      conversationId: input.conversationId,
      userId: input.userId ?? null,
      role: input.role,
      content: input.content
    });
    return { id };
  }

  async getConversationMessages(conversationId: string): Promise<Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>> {
    return this.messages
      .filter((message) => message.conversationId === conversationId)
      .map((message) => ({ role: message.role, content: message.content }));
  }

  async appendRetrievalEvent(input: {
    conversationId: string;
    messageId?: string | null;
    userId?: string | null;
    query: string;
    queryType: "normal" | "analysis";
    results: unknown;
  }): Promise<{ id: number }> {
    this.retrievalCounter += 1;
    this.retrievalEvents.push({
      id: this.retrievalCounter,
      conversationId: input.conversationId,
      query: input.query,
      queryType: input.queryType,
      results: input.results
    });
    return { id: this.retrievalCounter };
  }
}

class InMemoryAuditRepository {
  private counter = 0;
  readonly events: Array<{ id: number; conversationId: string | null; eventType: string; payload: unknown }> = [];

  async appendEvent(input: {
    conversationId?: string | null;
    userId?: string | null;
    eventType: string;
    payload: unknown;
  }): Promise<{ id: number }> {
    this.counter += 1;
    this.events.push({
      id: this.counter,
      conversationId: input.conversationId ?? null,
      eventType: input.eventType,
      payload: input.payload
    });
    return { id: this.counter };
  }
}

const staticRetrievalResult: RetrievalResult = {
  chunks: [
    {
      doc_id: "doc-1",
      chunk_id: "c-1",
      text: "Statute text block",
      score: 0.77,
      metadata: { source: "code" }
    }
  ],
  citations: [
    {
      id: "doc-1:c-1",
      doc_id: "doc-1",
      chunk_id: "c-1",
      source: "code",
      score: 0.77
    }
  ],
  latencyMs: 12,
  lowConfidence: false
};

async function collectEvents(orchestrator: ChatOrchestrator, conversationId: string): Promise<Array<{ type: string; token?: string }>> {
  const events: Array<{ type: string; token?: string }> = [];

  for await (const event of orchestrator.streamReply({
    conversationId,
    userId: "u-1",
    userText: "What is the rule?",
    analysisEnabled: true,
    requestId: `req-${conversationId}`
  })) {
    if (event.type === "token") {
      events.push({ type: event.type, token: event.token });
    } else {
      events.push({ type: event.type });
    }
  }

  return events;
}

async function runSuccessScenario(): Promise<void> {
  const chatRepository = new InMemoryChatRepository();
  const auditRepository = new InMemoryAuditRepository();

  const orchestrator = new ChatOrchestrator({
    chatRepository,
    auditRepository,
    retrieve: async () => staticRetrievalResult,
    streamOpenAI: async function* () {
      yield "Hello";
      yield " ";
      yield "world";
    },
    buildPrompt
  });

  const events = await collectEvents(orchestrator, "c-success");
  const tokenSequence = events.filter((event) => event.type === "token").map((event) => event.token);
  assert.deepEqual(tokenSequence, ["Hello", " ", "world"]);
  assert.equal(events[events.length - 1]?.type, "complete");

  const persistedMessages = chatRepository.messages.filter((message) => message.conversationId === "c-success");
  assert.equal(persistedMessages.length, 2);
  assert.equal(persistedMessages[0]?.role, "user");
  assert.equal(persistedMessages[1]?.role, "assistant");
  assert.equal(persistedMessages[1]?.content, "Hello world");
  assert.equal(chatRepository.retrievalEvents.length, 1);
  assert.equal(chatRepository.retrievalEvents[0]?.queryType, "analysis");

  const auditTypes = auditRepository.events.map((event) => event.eventType);
  assert.deepEqual(auditTypes, ["chat.start", "chat.model_call", "chat.complete"]);
}

async function runFailureScenario(): Promise<void> {
  const chatRepository = new InMemoryChatRepository();
  const auditRepository = new InMemoryAuditRepository();

  const orchestrator = new ChatOrchestrator({
    chatRepository,
    auditRepository,
    retrieve: async () => staticRetrievalResult,
    streamOpenAI: async function* () {
      yield "Partial";
      throw new Error("synthetic stream failure");
    },
    buildPrompt
  });

  const events = await collectEvents(orchestrator, "c-failure");
  assert.equal(events[0]?.type, "token");
  assert.equal(events[events.length - 1]?.type, "error");

  const persistedMessages = chatRepository.messages.filter((message) => message.conversationId === "c-failure");
  assert.equal(persistedMessages.length, 1);
  assert.equal(persistedMessages[0]?.role, "user");

  const auditTypes = auditRepository.events.map((event) => event.eventType);
  assert.deepEqual(auditTypes, ["chat.start", "chat.model_call", "chat.error"]);
}

async function runDocsOnlyScenario(): Promise<void> {
  const chatRepository = new InMemoryChatRepository();
  const auditRepository = new InMemoryAuditRepository();
  const streamOpenAI = async function* () {
    yield "should-not-happen";
  };

  const orchestrator = new ChatOrchestrator({
    chatRepository,
    auditRepository,
    retrieve: async () => staticRetrievalResult,
    streamOpenAI,
    buildPrompt
  });

  const events: Array<{ type: string; token?: string; content?: string }> = [];
  for await (const event of orchestrator.streamReply({
    conversationId: "c-docs",
    userId: "u-1",
    userText: "What is the rule?",
    analysisEnabled: false,
    requestId: "req-c-docs"
  })) {
    if (event.type === "token") {
      events.push({ type: event.type, token: event.token });
    } else if (event.type === "complete") {
      events.push({ type: event.type, content: event.content });
    } else {
      events.push({ type: event.type });
    }
  }

  assert.equal(events.some((event) => event.type === "token"), false);
  assert.equal(events.at(-1)?.type, "complete");
  assert.match(String(events.at(-1)?.content ?? ""), /Analisis desactivado/i);
  assert.equal(chatRepository.retrievalEvents[0]?.queryType, "normal");
  assert.deepEqual(
    auditRepository.events.map((event) => event.eventType),
    ["chat.start", "chat.complete"]
  );
}

async function verifyTask07(): Promise<void> {
  await runSuccessScenario();
  await runFailureScenario();
  await runDocsOnlyScenario();
  console.log("TASK_07 verification passed");
}

verifyTask07().catch((error) => {
  console.error("TASK_07 verification failed", error);
  process.exitCode = 1;
});
