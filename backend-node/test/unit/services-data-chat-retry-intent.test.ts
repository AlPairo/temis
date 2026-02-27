import { describe, expect, it } from "vitest";
import { resolveEffectiveQuery } from "../../src/modules/chat/retry-intent.js";

describe("modules/chat/retry-intent", () => {
  it("keeps non-retry messages unchanged", () => {
    const result = resolveEffectiveQuery({
      rawUserText: "Necesito ayuda con despidos indebidos",
      previousMessages: [{ role: "user", content: "hola" }]
    });

    expect(result).toEqual({
      effectiveQuery: "Necesito ayuda con despidos indebidos",
      isRetryIntent: false,
      resolution: "raw_user_message",
      suffixApplied: false
    });
  });

  it("reuses the latest useful prior user query for retry commands", () => {
    const result = resolveEffectiveQuery({
      rawUserText: "vuelve a intentar",
      previousMessages: [
        { role: "user", content: "consulta vieja" },
        { role: "assistant", content: "respuesta" },
        { role: "user", content: "Necesito ayuda con despidos indebidos" }
      ]
    });

    expect(result).toEqual({
      effectiveQuery: "Necesito ayuda con despidos indebidos",
      isRetryIntent: true,
      resolution: "previous_user_message",
      suffixApplied: false
    });
  });

  it("merges suffix instructions when retry command includes extra guidance", () => {
    const result = resolveEffectiveQuery({
      rawUserText: "vuelve a intentar pero enfócate en jurisprudencia reciente",
      previousMessages: [{ role: "user", content: "Despido indirecto y salarios impagos" }]
    });

    expect(result).toEqual({
      effectiveQuery: "Despido indirecto y salarios impagos\nenfócate en jurisprudencia reciente",
      isRetryIntent: true,
      resolution: "previous_user_message",
      suffixApplied: true
    });
  });

  it("falls back to raw message when no prior useful query exists", () => {
    const result = resolveEffectiveQuery({
      rawUserText: "retry",
      previousMessages: [{ role: "assistant", content: "sin historial de usuario" }]
    });

    expect(result).toEqual({
      effectiveQuery: "retry",
      isRetryIntent: true,
      resolution: "fallback_raw",
      suffixApplied: false
    });
  });

  it("skips prior retry-only user messages while searching a base query", () => {
    const result = resolveEffectiveQuery({
      rawUserText: "de nuevo",
      previousMessages: [
        { role: "user", content: "Consulta base laboral" },
        { role: "assistant", content: "ok" },
        { role: "user", content: "vuelve a intentar" }
      ]
    });

    expect(result).toEqual({
      effectiveQuery: "Consulta base laboral",
      isRetryIntent: true,
      resolution: "previous_user_message",
      suffixApplied: false
    });
  });
});
