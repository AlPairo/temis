type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface CorrelationContext {
  requestId?: string | null;
  conversationId?: string | null;
  sessionId?: string | null;
}

export interface LogFields {
  [key: string]: unknown;
}

const toLogEntry = (
  level: LogLevel,
  event: string,
  context: CorrelationContext,
  fields: LogFields
): Record<string, unknown> => ({
  ts: new Date().toISOString(),
  level,
  event,
  request_id: context.requestId ?? null,
  conversation_id: context.conversationId ?? null,
  session_id: context.sessionId ?? null,
  ...fields
});

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50
};

const parseConfiguredLogLevel = (value: string | undefined): LogLevel => {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "trace" ||
    normalized === "debug" ||
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error"
  ) {
    return normalized;
  }
  return "info";
};

const parseBooleanFlag = (value: string | undefined): boolean => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const resolveConfiguredLogLevel = (): LogLevel => {
  const explicit = process.env.BACKEND_LOG_LEVEL ?? process.env.LOG_LEVEL;
  if (explicit && explicit.trim().length > 0) {
    return parseConfiguredLogLevel(explicit);
  }

  const requestTraceMode = process.env.BACKEND_REQUEST_TRACE_MODE?.trim().toLowerCase();
  if (requestTraceMode === "trace") {
    return "trace";
  }
  if (requestTraceMode === "debug" || parseBooleanFlag(process.env.BACKEND_REQUEST_TRACE)) {
    return "debug";
  }

  return "info";
};

const configuredLogLevel = resolveConfiguredLogLevel();

export const isLogLevelEnabled = (level: LogLevel): boolean =>
  LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLogLevel];

const emit = (entry: Record<string, unknown>, level: LogLevel): void => {
  if (!isLogLevelEnabled(level)) {
    return;
  }
  const serialized = JSON.stringify(entry);
  if (level === "error") {
    console.error(serialized);
    return;
  }
  if (level === "warn") {
    console.warn(serialized);
    return;
  }
  console.info(serialized);
};

export const logInfo = (event: string, context: CorrelationContext, fields: LogFields = {}): void => {
  emit(toLogEntry("info", event, context, fields), "info");
};

export const logDebug = (event: string, context: CorrelationContext, fields: LogFields = {}): void => {
  emit(toLogEntry("debug", event, context, fields), "debug");
};

export const logTrace = (event: string, context: CorrelationContext, fields: LogFields = {}): void => {
  emit(toLogEntry("trace", event, context, fields), "trace");
};

export const logWarn = (event: string, context: CorrelationContext, fields: LogFields = {}): void => {
  emit(toLogEntry("warn", event, context, fields), "warn");
};

export const logError = (event: string, context: CorrelationContext, fields: LogFields = {}): void => {
  emit(toLogEntry("error", event, context, fields), "error");
};
