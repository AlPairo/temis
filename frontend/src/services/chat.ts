import type { ChatMessage } from "../types/chat";
import { useMock } from "./mocks";
import { apiConfig } from "./http";
import { FRONTEND_TEXT } from "../text";

const SERVICE_ERROR_MESSAGE = FRONTEND_TEXT.shared.serviceErrorMessage;

export type StreamHandlers = {
  onStart?: () => void;
  onMeta?: (payload: { sessionTitle?: string }) => void;
  onToken?: (token: string) => void;
  onEnd?: (payload: {
    content: string;
    messageId?: string;
    citations?: ChatMessage["citations"];
    lowConfidence?: boolean;
  }) => void;
  onError?: (error: string) => void;
};

const isAbortError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  (error as { name?: string }).name === "AbortError";

const normalizeStreamErrorText = (value: string): string => value.replace(/^\[ERROR\]\s*/i, "").trim();

const looksLikeInfrastructureFailure = (value: string): boolean =>
  /fetch failed|failed to fetch|connection|openai|qdrant|postgres|timeout|network|embeddings/i.test(value);

const toUserFacingError = (raw: string): string => {
  const normalized = normalizeStreamErrorText(raw);
  if (!normalized) {
    return SERVICE_ERROR_MESSAGE;
  }
  if (looksLikeInfrastructureFailure(normalized)) {
    return SERVICE_ERROR_MESSAGE;
  }
  return normalized;
};

export async function streamChat(
  input: { sessionId: string; message: string; analysisEnabled?: boolean },
  handlers: StreamHandlers,
  abortSignal?: AbortSignal
): Promise<void> {
  const authToken = import.meta.env.VITE_AUTH_TOKEN ?? "";
  if (useMock()) {
    handlers.onStart?.();
    const fake = FRONTEND_TEXT.services.chat.mockStreamResponse;
    for (const chunk of fake.split(" ")) {
      if (abortSignal?.aborted) return;
      await new Promise((r) => setTimeout(r, 80));
      handlers.onToken?.(chunk + " ");
    }
    handlers.onEnd?.({ content: fake });
    return;
  }

  handlers.onStart?.();
  try {
    const response = await fetch(`${apiConfig.baseUrl}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      },
      body: JSON.stringify({
        session_id: input.sessionId,
        message: input.message,
        analysis_enabled: input.analysisEnabled ?? false
      }),
      signal: abortSignal
    });

    if (!response.ok || !response.body) {
      handlers.onError?.(SERVICE_ERROR_MESSAGE);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        handleSseFrame(rawEvent, handlers);
      }
    }
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    const fallback =
      error instanceof Error && error.message.trim().length > 0
        ? toUserFacingError(error.message)
        : SERVICE_ERROR_MESSAGE;
    handlers.onError?.(fallback);
  }
}

const handleSseFrame = (frame: string, handlers: StreamHandlers) => {
  const lines = frame.split(/\r?\n/);
  let event = "message";
  let data = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.replace("event:", "").trim();
    } else if (line.startsWith("data:")) {
      data += line.replace("data:", "").trim() + "\n";
    }
  }

  if (event === "token") {
    handlers.onToken?.(data);
  } else if (event === "meta") {
    try {
      const parsed = JSON.parse(data);
      handlers.onMeta?.(parsed);
    } catch {
      handlers.onMeta?.({});
    }
  } else if (event === "end") {
    try {
      const parsed = JSON.parse(data) as {
        content?: unknown;
        messageId?: unknown;
        citations?: unknown;
        lowConfidence?: unknown;
      };
      handlers.onEnd?.({
        content: typeof parsed.content === "string" ? parsed.content : "",
        messageId: typeof parsed.messageId === "string" ? parsed.messageId : undefined,
        citations: Array.isArray(parsed.citations) ? (parsed.citations as ChatMessage["citations"]) : undefined,
        lowConfidence: typeof parsed.lowConfidence === "boolean" ? parsed.lowConfidence : undefined
      });
    } catch {
      handlers.onEnd?.({ content: data.trim() });
    }
  } else if (event === "error") {
    handlers.onError?.(toUserFacingError(data));
  }
};

export type ChatHistory = ChatMessage[];
