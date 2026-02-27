const RETRY_PREFIX_REGEX =
  /^(?:(?:por\s+favor|porfa|please)\s+)?(?:vuelve(?:\s+a)?\s+intent(?:ar|arlo|alo|a)|reintenta(?:r)?|intenta(?:lo)?\s+de\s+nuevo|otra\s+vez|de\s+nuevo|retry|try\s+again)\b[\s,:-]*(?<suffix>.*)$/iu;

type MessageLike = {
  role: string;
  content: string;
};

export interface RetryIntentInput {
  rawUserText: string;
  previousMessages: MessageLike[];
}

export type RetryResolutionKind = "raw_user_message" | "previous_user_message" | "fallback_raw";

export interface RetryIntentResolution {
  effectiveQuery: string;
  isRetryIntent: boolean;
  resolution: RetryResolutionKind;
  suffixApplied: boolean;
}

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const normalizeRetrySuffix = (value: string): string => {
  let suffix = normalizeWhitespace(value);
  if (!suffix) {
    return "";
  }

  suffix = suffix.replace(/^(?:que|pero|y|and)\b[\s,:-]*/iu, "");
  suffix = normalizeWhitespace(suffix);
  return suffix;
};

const parseRetryIntent = (value: string): { isRetryIntent: boolean; suffix: string } => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return { isRetryIntent: false, suffix: "" };
  }

  const match = RETRY_PREFIX_REGEX.exec(normalized);
  if (!match) {
    return { isRetryIntent: false, suffix: "" };
  }

  return {
    isRetryIntent: true,
    suffix: normalizeRetrySuffix(match.groups?.suffix ?? "")
  };
};

const resolvePreviousUsefulUserQuery = (messages: MessageLike[]): string | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") {
      continue;
    }

    const candidate = normalizeWhitespace(message.content ?? "");
    if (!candidate) {
      continue;
    }

    const parsed = parseRetryIntent(candidate);
    if (parsed.isRetryIntent) {
      continue;
    }

    return candidate;
  }

  return null;
};

export const resolveEffectiveQuery = (input: RetryIntentInput): RetryIntentResolution => {
  const rawUserText = normalizeWhitespace(input.rawUserText ?? "");
  const parsedRetry = parseRetryIntent(rawUserText);
  if (!parsedRetry.isRetryIntent) {
    return {
      effectiveQuery: rawUserText,
      isRetryIntent: false,
      resolution: "raw_user_message",
      suffixApplied: false
    };
  }

  const previousQuery = resolvePreviousUsefulUserQuery(input.previousMessages);
  if (!previousQuery) {
    return {
      effectiveQuery: rawUserText,
      isRetryIntent: true,
      resolution: "fallback_raw",
      suffixApplied: false
    };
  }

  if (!parsedRetry.suffix) {
    return {
      effectiveQuery: previousQuery,
      isRetryIntent: true,
      resolution: "previous_user_message",
      suffixApplied: false
    };
  }

  return {
    effectiveQuery: `${previousQuery}\n${parsedRetry.suffix}`,
    isRetryIntent: true,
    resolution: "previous_user_message",
    suffixApplied: true
  };
};
