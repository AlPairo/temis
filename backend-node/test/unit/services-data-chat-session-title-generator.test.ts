import { describe, expect, it, vi } from "vitest";
import { generateSessionTitleFromMessage } from "../../src/modules/chat/session-title-generator.js";
import { buildSessionTitleFromFirstMessage } from "../../src/modules/chat/session-title.js";

describe("modules/chat/session-title-generator", () => {
  it("uses the LLM title when a valid title is returned", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Titulo: "Analisis de contrato laboral"'
          }
        }
      ]
    });

    const result = await generateSessionTitleFromMessage(
      {
        message: "Necesito ayuda sobre un contrato laboral y sus clausulas"
      },
      {
        model: "gpt-test-title",
        getOpenAIClient: vi.fn().mockResolvedValue({
          client: {
            chat: { completions: { create } }
          }
        } as any),
        logWarn: vi.fn()
      }
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-test-title",
        temperature: 0
      })
    );
    expect(result).toBe("Analisis de contrato laboral");
  });

  it("truncates long LLM titles to configured limits", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "Una guia muy detallada para revisar contrato de compraventa internacional"
          }
        }
      ]
    });

    const result = await generateSessionTitleFromMessage(
      {
        message: "Revisa este contrato"
      },
      {
        model: "gpt-test-title",
        getOpenAIClient: vi.fn().mockResolvedValue({
          client: {
            chat: { completions: { create } }
          }
        } as any),
        logWarn: vi.fn()
      }
    );

    expect(result).toBe("Una guia muy detallada para revisar");
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.split(/\s+/).length).toBeLessThanOrEqual(6);
  });

  it("falls back to heuristic title and logs a warning when the LLM call fails", async () => {
    const logWarn = vi.fn();
    const message = "Calcula la derivada de x^2";

    const result = await generateSessionTitleFromMessage(
      {
        message,
        requestId: "req-1",
        sessionId: "session-1"
      },
      {
        getOpenAIClient: vi.fn().mockRejectedValue(new Error("boom")),
        logWarn
      }
    );

    expect(result).toBe(buildSessionTitleFromFirstMessage(message));
    expect(logWarn).toHaveBeenCalledWith(
      "chat.session_title.llm_failed",
      {
        requestId: "req-1",
        conversationId: null,
        sessionId: "session-1"
      },
      expect.objectContaining({
        error: "boom"
      })
    );
  });

  it("falls back when the mock client returns unrelated JSON", async () => {
    const result = await generateSessionTitleFromMessage(
      {
        message: "Necesito ayuda con prescripcion adquisitiva"
      },
      {
        getOpenAIClient: vi.fn().mockResolvedValue({
          client: {
            chat: {
              completions: {
                create: vi.fn().mockResolvedValue({
                  choices: [{ message: { content: "{\"selected_ids\":[\"cand_1\"]}" } }]
                })
              }
            }
          }
        } as any),
        logWarn: vi.fn()
      }
    );

    expect(result).toBe(buildSessionTitleFromFirstMessage("Necesito ayuda con prescripcion adquisitiva"));
  });
});

