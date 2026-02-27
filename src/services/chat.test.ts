import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSseResponse } from "../test/fetch-mocks";

type HandlerLog = {
  start: number;
  meta: Array<{ sessionTitle?: string }>;
  tokens: string[];
  ends: Array<{
    content: string;
    messageId?: string;
    citations?: Array<Record<string, unknown>>;
    lowConfidence?: boolean;
  }>;
  errors: string[];
};

const chatServiceMocks = vi.hoisted(() => ({
  useMock: vi.fn()
}));

vi.mock("./mocks", () => ({
  useMock: chatServiceMocks.useMock
}));

vi.mock("./http", () => ({
  apiConfig: {
    baseUrl: "https://api.example.test"
  }
}));

async function importChatModule() {
  vi.resetModules();
  return import("./chat");
}

function createHandlers(log: HandlerLog) {
  return {
    onStart: () => {
      log.start += 1;
    },
    onMeta: (payload: { sessionTitle?: string }) => {
      log.meta.push(payload);
    },
    onToken: (token: string) => {
      log.tokens.push(token);
    },
    onEnd: (payload: {
      content: string;
      messageId?: string;
      citations?: Array<Record<string, unknown>>;
      lowConfidence?: boolean;
    }) => {
      log.ends.push(payload);
    },
    onError: (error: string) => {
      log.errors.push(error);
    }
  };
}

describe("services/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatServiceMocks.useMock.mockReturnValue(false);
  });

  it("streams the mock response in mock mode", async () => {
    vi.useFakeTimers();
    chatServiceMocks.useMock.mockReturnValue(true);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { streamChat } = await importChatModule();
    const log: HandlerLog = { start: 0, meta: [], tokens: [], ends: [], errors: [] };

    const pending = streamChat({ sessionId: "s-1", message: "hola" }, createHandlers(log));
    await vi.runAllTimersAsync();
    await pending;

    expect(log.start).toBe(1);
    expect(log.tokens.length).toBeGreaterThan(2);
    expect(log.ends[0]?.content).toContain("Claro");
    expect(log.errors).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("emits a service error when the stream request fails with a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 503 }));
    const { streamChat } = await importChatModule();
    const log: HandlerLog = { start: 0, meta: [], tokens: [], ends: [], errors: [] };

    await streamChat({ sessionId: "s-1", message: "hola" }, createHandlers(log));

    expect(log.start).toBe(1);
    expect(log.errors).toHaveLength(1);
    expect(log.errors[0]).toContain("Actualmente el servicio");
    expect(log.tokens).toEqual([]);
    expect(log.ends).toEqual([]);
  });

  it("parses SSE meta, token, and end events", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSseResponse([
        "event: meta\n",
        'data: {"sessionTitle":"Sesion demo"}\n\n',
        "event: token\n",
        "data: Hola\n\n",
        "event: token\n",
        "data: mundo\n\n",
        "event: end\n",
        'data: {"content":"Hola mundo","messageId":"m-1","citations":[{"id":"d1:c1"}],"lowConfidence":false}\n\n'
      ])
    );
    const { streamChat } = await importChatModule();
    const log: HandlerLog = { start: 0, meta: [], tokens: [], ends: [], errors: [] };

    await streamChat({ sessionId: "s-1", message: "hola" }, createHandlers(log));

    expect(log.meta).toEqual([{ sessionTitle: "Sesion demo" }]);
    expect(log.tokens.map((token) => token.trim())).toEqual(["Hola", "mundo"]);
    expect(log.ends).toEqual([
      { content: "Hola mundo", messageId: "m-1", citations: [{ id: "d1:c1" }], lowConfidence: false }
    ]);
    expect(log.errors).toEqual([]);
    const request = fetchSpy.mock.calls[0]?.[1];
    expect(request).toBeTruthy();
    expect(typeof request?.body).toBe("string");
    expect(JSON.parse(String(request?.body))).toEqual(
      expect.objectContaining({
        session_id: "s-1",
        message: "hola",
        analysis_enabled: false
      })
    );
  });

  it("sends analysis_enabled=true when analysis mode is selected", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(createSseResponse(["event: end\n", 'data: {"content":"ok"}\n\n']));
    const { streamChat } = await importChatModule();
    const log: HandlerLog = { start: 0, meta: [], tokens: [], ends: [], errors: [] };

    await streamChat({ sessionId: "s-2", message: "hola", analysisEnabled: true }, createHandlers(log));

    expect(log.ends).toEqual([{ content: "ok" }]);
    const request = fetchSpy.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual(
      expect.objectContaining({
        analysis_enabled: true
      })
    );
  });

  it("falls back when SSE payloads contain invalid JSON and maps infra errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSseResponse([
        "event: meta\n",
        "data: not-json\n\n",
        "event: end\n",
        "data: plain end text\n\n",
        "event: error\n",
        "data: [ERROR] Qdrant connection error\n\n"
      ])
    );
    const { streamChat } = await importChatModule();
    const log: HandlerLog = { start: 0, meta: [], tokens: [], ends: [], errors: [] };

    await streamChat({ sessionId: "s-1", message: "hola" }, createHandlers(log));

    expect(log.meta).toEqual([{}]);
    expect(log.ends).toEqual([{ content: "plain end text" }]);
    expect(log.errors).toHaveLength(1);
    expect(log.errors[0]).toContain("Actualmente el servicio");
  });

  it("ignores abort errors without surfacing them to the UI", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue({ name: "AbortError" });
    const { streamChat } = await importChatModule();
    const log: HandlerLog = { start: 0, meta: [], tokens: [], ends: [], errors: [] };

    await expect(streamChat({ sessionId: "s-1", message: "hola" }, createHandlers(log))).resolves.toBeUndefined();
    expect(log.errors).toEqual([]);
  });
});
