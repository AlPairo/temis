import { beforeEach, describe, expect, it, vi } from "vitest";

describe("auth/permissions", () => {
  it("returns permission sets and evaluates actions by role", async () => {
    const mod = await import("../../src/auth/permissions.js");

    expect(mod.getSessionPermissionsForRole("basic")).toEqual({
      read: true,
      rename: true,
      delete: true,
      view_deleted: false
    });
    expect(mod.getSessionPermissionsForRole("supervisor").view_deleted).toBe(true);
    expect(mod.getSessionPermissionsForRole("admin").view_deleted).toBe(true);
    expect(mod.canSession("basic", "view_deleted")).toBe(false);
    expect(mod.canSession("admin", "delete")).toBe(true);
  });
});

describe("modules/chat/session-title", () => {
  it("builds a readable title and trims greeting/stop words", async () => {
    const { buildSessionTitleFromFirstMessage } = await import("../../src/modules/chat/session-title.js");

    expect(buildSessionTitleFromFirstMessage("hola, por favor necesito ayuda sobre nulidad de contrato")).toBe(
      "Nulidad De Contrato"
    );
  });

  it("falls back when input is empty or punctuation only", async () => {
    const { buildSessionTitleFromFirstMessage } = await import("../../src/modules/chat/session-title.js");

    expect(buildSessionTitleFromFirstMessage("   ")).toBe("Nueva sesi\u00f3n");
    expect(buildSessionTitleFromFirstMessage("...!!!")).toBe("Nueva sesi\u00f3n");
  });

  it("removes markdown and truncates to title limits", async () => {
    const { buildSessionTitleFromFirstMessage } = await import("../../src/modules/chat/session-title.js");

    const title = buildSessionTitleFromFirstMessage(
      "```ts\nconst x = 1\n```\n[link](https://example.com) consulta sobre responsabilidad contractual por incumplimiento grave del proveedor en licitaciones"
    );

    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.split(/\s+/).length).toBeLessThanOrEqual(6);
    expect(title).not.toContain("```");
    expect(title).not.toContain("link");
  });

  it("keeps existing mixed casing instead of title-casing", async () => {
    const { buildSessionTitleFromFirstMessage } = await import("../../src/modules/chat/session-title.js");

    expect(buildSessionTitleFromFirstMessage("Analizar Ley de IVA en Chile")).toBe("Analizar Ley de IVA en Chile");
  });
});

describe("modules/chat/prompt-builder", () => {
  it("builds prompt with guardrails, filtered history, retrieval block, and user input", async () => {
    const { buildPrompt } = await import("../../src/modules/chat/prompt-builder.js");

    const prompt = buildPrompt({
      history: [
        { role: "system", content: "s1" },
        { role: "tool" as any, content: "ignored" },
        { role: "user", content: "u1" },
        { role: "assistant", content: "a1" }
      ],
      retrieval: {
        chunks: [{ doc_id: "doc", chunk_id: "c1", text: "chunk text", score: 0.8123, metadata: { source: "db" } }],
        citations: [{ id: "doc:c1", doc_id: "doc", chunk_id: "c1", source: "db", score: 0.8123 }],
        lowConfidence: false,
        latencyMs: 10
      },
      userText: "final user message"
    } as any);

    expect(prompt.systemPrompt).toContain("legal research assistant");
    expect(prompt.messages[0]).toEqual({ role: "system", content: prompt.systemPrompt });
    expect(prompt.messages).toContainEqual({ role: "system", content: "s1" });
    expect(prompt.messages).toContainEqual({ role: "user", content: "u1" });
    expect(prompt.messages).toContainEqual({ role: "assistant", content: "a1" });
    expect(prompt.messages.some((m) => (m as any).role === "tool")).toBe(false);
    expect(prompt.messages.at(-1)).toEqual({ role: "user", content: "final user message" });
    expect(prompt.messages[prompt.messages.length - 2]?.content).toContain("Retrieved legal context");
    expect(prompt.messages[prompt.messages.length - 2]?.content).toContain("[doc:c1] doc/c1 source=db score=0.812");
    expect(prompt.messages[prompt.messages.length - 2]?.content).toContain("[chunk_1] chunk text");
    expect(prompt.messages[prompt.messages.length - 2]?.content).toContain("Low confidence retrieval: no");
  });

  it("handles empty retrieval content and trims history to max size", async () => {
    const { buildPrompt } = await import("../../src/modules/chat/prompt-builder.js");
    const history = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `m-${i}`
    }));

    const prompt = buildPrompt({
      history,
      retrieval: { chunks: [], citations: [], lowConfidence: true, latencyMs: 5 },
      userText: "hi"
    } as any);

    const historyMessages = prompt.messages.slice(1, -2);
    expect(historyMessages).toHaveLength(16);
    expect(prompt.messages[prompt.messages.length - 2]?.content).toContain("(none)");
    expect(prompt.messages[prompt.messages.length - 2]?.content).toContain("Low confidence retrieval: yes");
  });

  it("adds strict citation-focused answer contract in analysis mode", async () => {
    const { buildPrompt } = await import("../../src/modules/chat/prompt-builder.js");

    const prompt = buildPrompt({
      history: [],
      retrieval: {
        chunks: [{ doc_id: "doc", chunk_id: "c1", text: "chunk text", score: 0.9, metadata: {} }],
        citations: [{ id: "doc:c1", doc_id: "doc", chunk_id: "c1", score: 0.9 }],
        lowConfidence: false,
        latencyMs: 10
      },
      userText: "analiza este caso",
      queryType: "analysis"
    } as any);

    const systemMessages = prompt.messages.filter((message) => message.role === "system");
    expect(systemMessages.some((message) => message.content.includes("Mandatory response format for analysis mode"))).toBe(
      true
    );
    expect(systemMessages.some((message) => message.content.includes("[doc:c1] doc/c1"))).toBe(true);
    expect(prompt.messages.at(-1)).toEqual({ role: "user", content: "analiza este caso" });
  });
});

describe("modules/rag/citation-builder", () => {
  it("builds citations, sanitizes ids, and deduplicates repeated chunk ids", async () => {
    const { buildCitations } = await import("../../src/modules/rag/citation-builder.js");
    const citations = buildCitations([
      {
        doc_id: "doc 1",
        chunk_id: "chunk/1",
        text: "x",
        score: 0.5,
        metadata: { source: "boletin", jurisdiction: "CL", effective_date: "2025-01-01" }
      },
      {
        doc_id: "doc 1",
        chunk_id: "chunk/1",
        text: "y",
        score: 0.4,
        metadata: {}
      }
    ] as any);

    expect(citations).toEqual([
      {
        id: "doc_1:chunk_1",
        doc_id: "doc 1",
        chunk_id: "chunk/1",
        source: "boletin",
        jurisdiction: "CL",
        effective_date: "2025-01-01",
        score: 0.5
      },
      {
        id: "doc_1:chunk_1:2",
        doc_id: "doc 1",
        chunk_id: "chunk/1",
        source: undefined,
        jurisdiction: undefined,
        effective_date: undefined,
        score: 0.4
      }
    ]);
  });
});

describe("config/env and config/index", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const validEnv = (): NodeJS.ProcessEnv => ({
    APP_MODE: "local",
    OPENAI_API_KEY: "sk-test",
    OPENAI_MODEL: "gpt-test",
    POSTGRES_URL: "postgres://u:p@localhost:5432/db",
    QDRANT_COLLECTION: "col"
  });

  it("parses dotenv lines and loads env entries without overriding existing values", async () => {
    const originalEnv = process.env;
    process.env = validEnv();
    try {
      const mod = await import("../../src/config/env.js");

      expect(mod.parseDotEnvLine("# comment")).toBeNull();
      expect(mod.parseDotEnvLine(" NOPE ")).toBeNull();
      expect(mod.parseDotEnvLine("A=1")).toEqual(["A", "1"]);
      expect(mod.parseDotEnvLine("B = ' spaced value '")).toEqual(["B", " spaced value "]);

      const envTarget: NodeJS.ProcessEnv = { KEEP: "existing" };
      mod.loadModeEnvFile({
        cwd: "C:\\repo\\backend-node",
        processEnv: envTarget,
        existsSync: (p) => String(p).endsWith(".env.local"),
        readFileSync: (() => "KEEP=ignored\nNEW_VALUE=42\n#x\nQUOTED=\"hello\"") as any
      });

      expect(envTarget).toEqual({
        KEEP: "existing",
        NEW_VALUE: "42",
        QUOTED: "hello"
      });
    } finally {
      process.env = originalEnv;
    }
  });

  it("parses runtime env and normalizes optional qdrant/local store values", async () => {
    const originalEnv = process.env;
    process.env = validEnv();
    try {
      const mod = await import("../../src/config/env.js");

      expect(
        mod.parseEnv({
          ...validEnv(),
          ENABLE_INFRA_BOOTSTRAP: "yes",
          RUN_STARTUP_CHECKS: "0",
          QDRANT_URL: "  ",
          QDRANT_API_KEY: " ",
          LOCAL_VECTOR_STORE_FILE: "  custom.json  "
        })
      ).toEqual(
        expect.objectContaining({
          APP_MODE: "local",
          ENABLE_INFRA_BOOTSTRAP: true,
          RUN_STARTUP_CHECKS: false,
          OPENAI_TITLE_MODEL: "gpt-5-nano",
          QDRANT_URL: undefined,
          QDRANT_API_KEY: undefined,
          LOCAL_VECTOR_STORE_FILE: "  custom.json  "
        })
      );
    } finally {
      process.env = originalEnv;
    }
  });

  it("throws on invalid env and prod mode missing qdrant url", async () => {
    const originalEnv = process.env;
    process.env = validEnv();
    try {
      const mod = await import("../../src/config/env.js");

      expect(() =>
        mod.parseEnv({
          APP_MODE: "prod",
          OPENAI_API_KEY: "x",
          OPENAI_MODEL: "m",
          POSTGRES_URL: "pg",
          QDRANT_COLLECTION: "c"
        } as any)
      ).toThrow(/QDRANT_URL is required in prod mode/);
    } finally {
      process.env = originalEnv;
    }
  });

  it("exports a frozen config object in config/index", async () => {
    vi.doMock("../../src/config/env.js", () => ({
      env: { APP_MODE: "local", OPENAI_MODEL: "gpt-test" },
      parseEnv: vi.fn(),
      envSchema: {}
    }));

    const mod = await import("../../src/config/index.js");
    expect(mod.config).toEqual({ APP_MODE: "local", OPENAI_MODEL: "gpt-test" });
    expect(Object.isFrozen(mod.config)).toBe(true);
  });
});

