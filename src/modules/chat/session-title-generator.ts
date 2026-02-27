import { getOpenAIClient } from "../../clients/openai.js";
import { config } from "../../config/index.js";
import { logWarn } from "../../observability/logger.js";
import { SESSION_TITLE_SYSTEM_PROMPT } from "../../prompts/index.js";
import { buildSessionTitleFromFirstMessage } from "./session-title.js";

const TITLE_MAX_CHARS = 60;
const TITLE_MAX_WORDS = 6;

export interface GenerateSessionTitleInput {
  message: string;
  requestId?: string | null;
  sessionId?: string | null;
  conversationId?: string | null;
}

export interface SessionTitleGeneratorDependencies {
  getOpenAIClient?: typeof getOpenAIClient;
  logWarn?: typeof logWarn;
  model?: string;
}

const normalizeCompletionContent = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object") {
          const typed = part as { text?: unknown };
          if (typeof typed.text === "string") {
            return typed.text;
          }
        }
        return "";
      })
      .join("");
  }

  return "";
};

const trimPunctuation = (value: string): string =>
  value.replace(/^[\s:;,.!?\u00a1\u00bf"'`()[\]{}-]+|[\s:;,.!?\u00a1\u00bf"'`()[\]{}-]+$/g, "").trim();

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const tryExtractJsonTitle = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const title = (parsed as { title?: unknown }).title;
      if (typeof title === "string") {
        return title;
      }
    }
  } catch {
    return null;
  }

  return null;
};

const sanitizeGeneratedTitle = (raw: string): string | null => {
  const jsonTitle = tryExtractJsonTitle(raw);
  let candidate = normalizeWhitespace(jsonTitle ?? raw);
  if (!candidate) {
    return null;
  }

  candidate = candidate
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
  candidate = candidate.replace(/^(title|t[i\u00ed]tulo)\s*:\s*/i, "");
  candidate = candidate.replace(/^#+\s*/, "");
  candidate = normalizeWhitespace(candidate);
  candidate = trimPunctuation(candidate);
  if (!candidate) {
    return null;
  }

  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length > TITLE_MAX_WORDS) {
    candidate = words.slice(0, TITLE_MAX_WORDS).join(" ");
  }
  if (candidate.length > TITLE_MAX_CHARS) {
    candidate = candidate.slice(0, TITLE_MAX_CHARS);
  }

  candidate = trimPunctuation(candidate);
  if (!candidate) {
    return null;
  }

  if (/^[\[{]/.test(candidate) || /selected_ids/i.test(candidate)) {
    return null;
  }

  return candidate;
};

export async function generateSessionTitleFromMessage(
  input: GenerateSessionTitleInput,
  dependencies?: SessionTitleGeneratorDependencies
): Promise<string> {
  const fallbackTitle = buildSessionTitleFromFirstMessage(input.message);
  const resolved = {
    getOpenAIClient: dependencies?.getOpenAIClient ?? getOpenAIClient,
    logWarn: dependencies?.logWarn ?? logWarn,
    model: dependencies?.model ?? config.OPENAI_TITLE_MODEL
  };

  try {
    const { client } = await resolved.getOpenAIClient();
    const response = await client.chat.completions.create({
      model: resolved.model,
      temperature: 0,
      max_tokens: 24,
      messages: [
        { role: "system", content: SESSION_TITLE_SYSTEM_PROMPT },
        { role: "user", content: input.message }
      ]
    });

    const rawContent = normalizeCompletionContent(response.choices?.[0]?.message?.content);
    const title = sanitizeGeneratedTitle(rawContent);
    return title ?? fallbackTitle;
  } catch (error) {
    resolved.logWarn(
      "chat.session_title.llm_failed",
      {
        requestId: input.requestId ?? null,
        conversationId: input.conversationId ?? null,
        sessionId: input.sessionId ?? null
      },
      {
        error: error instanceof Error ? error.message : "unknown error"
      }
    );
    return fallbackTitle;
  }
}
