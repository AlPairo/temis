import { buildPrompt as defaultBuildPrompt } from "./prompt-builder.js";
import { logDebug, logError, logInfo, logTrace } from "../../observability/logger.js";
import { recordErrorRate, recordOpenAILatency, recordOpenAIUsage } from "../../observability/metrics.js";
import type {
  ChatOrchestratorInput,
  ChatStreamEvent,
  OpenAIStreamChunk,
  OpenAIStreamRequest,
  OrchestratorDependencies,
  QueryType,
  ReasoningStage
} from "./types.js";
import type { RetrievalResult } from "../rag/types.js";

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const SAFE_USER_ERROR = "I could not complete this response right now. Please try again.";
const INFRASTRUCTURE_SAFE_USER_ERROR =
  "Actualmente el servicio se encuentra con errores, contactar con soporte t\u00e9cnico.";
const DOCS_ONLY_EMPTY_MESSAGE =
  "No encontr\u00e9 documentos relevantes para esta consulta en modo sin an\u00e1lisis.";
const DOCS_ONLY_EXCERPT_MAX_CHARS = 600;

const mapErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "unknown orchestration error";
};

const collectErrorText = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error ?? "");
  }

  const parts = [error.name, error.message];
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    parts.push(cause.name, cause.message);
  } else if (cause !== undefined) {
    parts.push(String(cause));
  }
  return parts.filter(Boolean).join(" | ");
};

const isInfrastructureFailure = (error: unknown): boolean => {
  const text = collectErrorText(error);
  return /retrieverhealtherror|openai|qdrant|postgres|connection error|fetch failed|failed to fetch|timeout|econn|embeddings/i.test(
    text
  );
};

export const toSafeUserErrorMessage = (error: unknown): string =>
  isInfrastructureFailure(error) ? INFRASTRUCTURE_SAFE_USER_ERROR : SAFE_USER_ERROR;

const serializeError = (error: unknown): Record<string, unknown> => {
  if (!(error instanceof Error)) {
    return { error_raw: String(error) };
  }

  const details: Record<string, unknown> = {
    error_name: error.name,
    error_message: error.message
  };

  if (error.stack) {
    details.error_stack = error.stack;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    details.error_cause = {
      name: cause.name,
      message: cause.message,
      stack: cause.stack
    };
  } else if (cause !== undefined) {
    details.error_cause = cause;
  }

  return details;
};

const normalizeToken = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((part) => (typeof part === "string" ? part : typeof part?.text === "string" ? part.text : ""))
      .join("");
  }
  return "";
};

const truncateText = (value: string, maxChars: number): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}\u2026`;
};

const buildDocsOnlyAssistantMessage = (retrieval: RetrievalResult): string => {
  if (retrieval.chunks.length === 0) {
    return DOCS_ONLY_EMPTY_MESSAGE;
  }

  const lines = [
    "Resultados de documentos recuperados (Analisis desactivado):",
    "Se muestran fragmentos relevantes sin respuesta generada por LLM.",
    ""
  ];

  retrieval.chunks.forEach((chunk, index) => {
    const excerpt = truncateText(chunk.text, DOCS_ONLY_EXCERPT_MAX_CHARS);
    const scoreText = Number.isFinite(chunk.score) ? ` (score ${chunk.score.toFixed(3)})` : "";
    lines.push(`${index + 1}. ${chunk.doc_id} / ${chunk.chunk_id}${scoreText}`);
    lines.push(`   ${excerpt}`);
    lines.push("");
  });

  return lines.join("\n").trim();
};

const buildReasoningDetail = (
  fields: Record<string, string | number | boolean | null | undefined>
): string | undefined => {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`);
  return parts.length > 0 ? parts.join(" ") : undefined;
};

const streamOpenAIFromFetch = async function* (
  request: OpenAIStreamRequest
): AsyncGenerator<string | OpenAIStreamChunk, void, void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing for streaming.");
  }

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: request.model,
      stream: true,
      stream_options: {
        include_usage: true
      },
      messages: request.messages
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI streaming request failed (${response.status}): ${details}`);
  }

  if (!response.body) {
    throw new Error("OpenAI response body is missing.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }

    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) {
        continue;
      }

      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        return;
      }

      let json: unknown;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }

      const candidate = (json as { choices?: Array<{ delta?: { content?: unknown } }> }).choices?.[0]?.delta?.content;
      const token = normalizeToken(candidate);
      if (token.length > 0) {
        yield { type: "token", token };
      }

      const usage = (json as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } })
        .usage;
      if (usage) {
        yield {
          type: "usage",
          usage
        };
      }
    }
  }
};

export class ChatOrchestrator {
  private readonly dependencies: Partial<OrchestratorDependencies>;

  constructor(dependencies?: Partial<OrchestratorDependencies>) {
    this.dependencies = {
      streamOpenAI: streamOpenAIFromFetch,
      buildPrompt: defaultBuildPrompt,
      ...dependencies
    };
  }

  private async ensureDependencies(): Promise<OrchestratorDependencies> {
    if (!this.dependencies.chatRepository) {
      const module = await import("./chat-repository.js");
      this.dependencies.chatRepository = new module.ChatRepository();
    }

    if (!this.dependencies.auditRepository) {
      const module = await import("../audit/audit-repository.js");
      this.dependencies.auditRepository = new module.AuditRepository();
    }

    if (!this.dependencies.retrieve) {
      const module = await import("../rag/retriever.js");
      this.dependencies.retrieve = (input) => module.retrieve(input);
    }

    if (!this.dependencies.buildPrompt) {
      this.dependencies.buildPrompt = defaultBuildPrompt;
    }

    if (!this.dependencies.streamOpenAI) {
      this.dependencies.streamOpenAI = streamOpenAIFromFetch;
    }

    return this.dependencies as OrchestratorDependencies;
  }

  async *streamReply(input: ChatOrchestratorInput): AsyncGenerator<ChatStreamEvent, void, void> {
    const dependencies = await this.ensureDependencies();
    const requestId = input.requestId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();
    const userText = input.userText.trim();
    const queryType: QueryType = input.analysisEnabled === true ? "analysis" : "normal";
    let stage = "audit.chat.start";
    const isAnalysisMode = queryType === "analysis";

    const createReasoningEvent = (
      reasoningStage: ReasoningStage,
      step: string,
      detail?: string
    ): Extract<ChatStreamEvent, { type: "reasoning" }> => ({
      type: "reasoning",
      stage: reasoningStage,
      step,
      detail,
      ts: new Date().toISOString()
    });

    const traceStage = (nextStage: string, fields: Record<string, unknown> = {}): void => {
      stage = nextStage;
      logTrace(
        "chat.orchestrator.stage",
        {
          requestId,
          conversationId: input.conversationId,
          sessionId: input.sessionId ?? null
        },
        {
          stage: nextStage,
          ...fields
        }
      );
    };

    traceStage(stage);
    await dependencies.auditRepository.appendEvent({
      conversationId: input.conversationId,
      userId: input.userId ?? null,
      eventType: "chat.start",
      payload: {
        requestId,
        conversationId: input.conversationId,
        queryType
      }
    });

    try {
      traceStage("chat.append_user_message");
      const userMessage = await dependencies.chatRepository.appendMessage({
        conversationId: input.conversationId,
        userId: input.userId ?? null,
        role: "user",
        content: userText
      });
      if (isAnalysisMode) {
        yield createReasoningEvent("request_received", "Solicitud comprendida");
      }

      traceStage("rag.retrieve.start", {
        retrieval_top_k: input.retrievalTopK ?? null
      });
      if (isAnalysisMode) {
        yield createReasoningEvent(
          "retrieval_started",
          "Iniciando recuperacion de contexto",
          buildReasoningDetail({
            topK: input.retrievalTopK ?? null
          })
        );
      }
      const retrieval = await dependencies.retrieve({
        query: userText,
        filters: input.retrievalFilters,
        topK: input.retrievalTopK,
        disableRerank: queryType === "analysis",
        requestId,
        conversationId: input.conversationId
      });
      logDebug(
        "chat.orchestrator.retrieval.complete",
        {
          requestId,
          conversationId: input.conversationId,
          sessionId: input.sessionId ?? null
        },
        {
          citation_count: retrieval.citations.length
        }
      );
      if (isAnalysisMode) {
        yield createReasoningEvent(
          "retrieval_completed",
          "Recuperacion completada",
          buildReasoningDetail({
            chunks: retrieval.chunks.length,
            citations: retrieval.citations.length,
            lowConfidence: retrieval.lowConfidence
          })
        );
      }

      traceStage("chat.append_retrieval_event");
      await dependencies.chatRepository.appendRetrievalEvent({
        conversationId: input.conversationId,
        messageId: userMessage.id,
        userId: input.userId ?? null,
        query: userText,
        queryType,
        results: retrieval
      });

      if (queryType === "normal") {
        traceStage("chat.docs_only.compose", {
          chunk_count: retrieval.chunks.length,
          citation_count: retrieval.citations.length
        });
        const docsOnlyText = buildDocsOnlyAssistantMessage(retrieval);

        traceStage("chat.append_assistant_message");
        const assistantMessage = await dependencies.chatRepository.appendMessage({
          conversationId: input.conversationId,
          userId: input.userId ?? null,
          role: "assistant",
          content: docsOnlyText
        });

        traceStage("audit.chat.complete");
        await dependencies.auditRepository.appendEvent({
          conversationId: input.conversationId,
          userId: input.userId ?? null,
          eventType: "chat.complete",
          payload: {
            requestId,
            queryType,
            assistantMessageId: assistantMessage.id,
            latencyMs: Date.now() - startedAt
          }
        });

        traceStage("chat.emit_complete");
        yield {
          type: "complete",
          messageId: assistantMessage.id,
          content: docsOnlyText,
          citations: retrieval.citations,
          lowConfidence: retrieval.lowConfidence
        };
        return;
      }

      traceStage("chat.load_history");
      const history = await dependencies.chatRepository.getConversationMessages(input.conversationId);
      traceStage("chat.build_prompt", {
        history_count: history.length,
        citation_count: retrieval.citations.length
      });
      const prompt = dependencies.buildPrompt({
        history,
        retrieval,
        userText,
        queryType
      });
      if (isAnalysisMode) {
        yield createReasoningEvent(
          "prompt_built",
          "Contexto y prompt listos",
          buildReasoningDetail({
            history: history.length,
            promptMessages: prompt.messages.length,
            citations: retrieval.citations.length
          })
        );
      }

      const model = input.model ?? DEFAULT_MODEL;
      traceStage("audit.chat.model_call", {
        model
      });
      await dependencies.auditRepository.appendEvent({
        conversationId: input.conversationId,
        userId: input.userId ?? null,
        eventType: "chat.model_call",
        payload: {
          requestId,
          queryType,
          model,
          historyCount: history.length,
          citationCount: retrieval.citations.length
        }
      });

      let assistantText = "";
      const openAICallStartedAt = Date.now();
      let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      traceStage("openai.stream.start", {
        model,
        prompt_message_count: prompt.messages.length
      });
      if (isAnalysisMode) {
        yield createReasoningEvent(
          "model_generation_started",
          "Generacion de respuesta iniciada",
          buildReasoningDetail({
            model
          })
        );
      }
      for await (const chunk of dependencies.streamOpenAI({
        model,
        messages: prompt.messages
      })) {
        const token = typeof chunk === "string" ? chunk : chunk.type === "token" ? chunk.token : null;
        const usageChunk = typeof chunk === "string" ? null : chunk.type === "usage" ? chunk : null;
        if (usageChunk) {
          usage = {
            promptTokens: usageChunk.usage.prompt_tokens ?? usage.promptTokens,
            completionTokens: usageChunk.usage.completion_tokens ?? usage.completionTokens,
            totalTokens: usageChunk.usage.total_tokens ?? usage.totalTokens
          };
          continue;
        }

        if (!token) {
          continue;
        }

        assistantText += token;
        yield { type: "token", token };
      }
      const openAIDurationMs = Date.now() - openAICallStartedAt;
      recordOpenAILatency(openAIDurationMs);
      recordOpenAIUsage(usage);
      traceStage("openai.stream.complete", {
        openai_latency_ms: openAIDurationMs,
        assistant_chars: assistantText.length
      });
      if (isAnalysisMode) {
        yield createReasoningEvent(
          "final_synthesis_completed",
          "Sintesis final completada",
          buildReasoningDetail({
            assistantChars: assistantText.length,
            openAiLatencyMs: openAIDurationMs
          })
        );
      }
      logInfo(
        "chat.openai.complete",
        {
          requestId,
          conversationId: input.conversationId,
          sessionId: input.sessionId ?? null
        },
        {
          openai_latency_ms: openAIDurationMs,
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
          total_tokens: usage.totalTokens
        }
      );
      logInfo(
        "chat.openai.response_text",
        {
          requestId,
          conversationId: input.conversationId,
          sessionId: input.sessionId ?? null
        },
        {
          assistant_text: assistantText,
          assistant_chars: assistantText.length
        }
      );

      traceStage("chat.append_assistant_message");
      const assistantMessage = await dependencies.chatRepository.appendMessage({
        conversationId: input.conversationId,
        userId: input.userId ?? null,
        role: "assistant",
        content: assistantText
      });

      traceStage("audit.chat.complete");
      await dependencies.auditRepository.appendEvent({
        conversationId: input.conversationId,
        userId: input.userId ?? null,
        eventType: "chat.complete",
        payload: {
          requestId,
          queryType,
          assistantMessageId: assistantMessage.id,
          latencyMs: Date.now() - startedAt
        }
      });

      traceStage("chat.emit_complete");
      yield {
        type: "complete",
        messageId: assistantMessage.id,
        content: assistantText,
        citations: retrieval.citations,
        lowConfidence: retrieval.lowConfidence
      };
    } catch (error) {
      const errorMessage = mapErrorMessage(error);
      const safeMessage = toSafeUserErrorMessage(error);
      recordErrorRate("chat_orchestrator_error");
      logError(
        "chat.orchestrator.error",
        {
          requestId,
          conversationId: input.conversationId,
          sessionId: input.sessionId ?? null
        },
        {
          error: errorMessage,
          failed_stage: stage,
          ...serializeError(error)
        }
      );
      await dependencies.auditRepository.appendEvent({
        conversationId: input.conversationId,
        userId: input.userId ?? null,
        eventType: "chat.error",
        payload: {
          requestId,
          queryType,
          safeMessage,
          error: errorMessage,
          failed: true
        }
      });

      yield {
        type: "error",
        safeMessage
      };
    }
  }
}

