import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { logDebug, logInfo, logTrace } from "./logger.js";

type RequestTraceMode = "off" | "debug" | "trace";

const REQUEST_TRACE_START_TIME = Symbol("request_trace_start_time");

const parseBooleanFlag = (value: string | undefined): boolean => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const resolveRequestTraceMode = (): RequestTraceMode => {
  const explicit = process.env.BACKEND_REQUEST_TRACE_MODE?.trim().toLowerCase();
  if (explicit === "off" || explicit === "debug" || explicit === "trace") {
    return explicit;
  }

  if (parseBooleanFlag(process.env.BACKEND_REQUEST_TRACE)) {
    return "debug";
  }

  return "off";
};

const pickRequestHeaders = (request: FastifyRequest): Record<string, unknown> => {
  const headers = request.headers;
  return {
    origin: headers.origin ?? null,
    host: headers.host ?? null,
    "user-agent": headers["user-agent"] ?? null,
    accept: headers.accept ?? null,
    "content-type": headers["content-type"] ?? null,
    "content-length": headers["content-length"] ?? null,
    "x-request-id": headers["x-request-id"] ?? null
  };
};

const summarizeBody = (body: unknown): Record<string, unknown> | null => {
  if (body === undefined) {
    return null;
  }
  if (body === null) {
    return { type: "null" };
  }
  if (typeof body === "string") {
    return { type: "string", length: body.length };
  }
  if (Array.isArray(body)) {
    return { type: "array", length: body.length };
  }
  if (typeof body === "object") {
    const record = body as Record<string, unknown>;
    const keys = Object.keys(record);
    return {
      type: "object",
      key_count: keys.length,
      keys: keys.slice(0, 20)
    };
  }
  return { type: typeof body };
};

const getRoutePath = (request: FastifyRequest): string | null => {
  const routeUrl = (request.routeOptions as { url?: string } | undefined)?.url;
  return typeof routeUrl === "string" ? routeUrl : null;
};

const getRequestStartTime = (request: FastifyRequest): number => {
  const value = (request as unknown as Record<symbol, number | undefined>)[REQUEST_TRACE_START_TIME];
  return typeof value === "number" ? value : Date.now();
};

const traceRequest = (
  mode: RequestTraceMode,
  request: FastifyRequest,
  reply: FastifyReply,
  event: string,
  fields: Record<string, unknown> = {}
): void => {
  const context = {
    requestId: request.id
  };

  const baseFields: Record<string, unknown> = {
    method: request.method,
    url: request.url,
    route: getRoutePath(request),
    status_code: reply.statusCode || null,
    ...fields
  };

  if (mode === "trace") {
    logTrace(event, context, baseFields);
    return;
  }

  logDebug(event, context, baseFields);
};

export const registerRequestTraceHooks = (app: FastifyInstance): void => {
  const mode = resolveRequestTraceMode();
  if (mode === "off") {
    return;
  }

  logInfo(
    "http.trace.enabled",
    {},
    {
      mode,
      backend_log_level: process.env.BACKEND_LOG_LEVEL ?? process.env.LOG_LEVEL ?? "info"
    }
  );

  app.addHook("onRequest", async (request, reply) => {
    (request as unknown as Record<symbol, number>)[REQUEST_TRACE_START_TIME] = Date.now();
    traceRequest(mode, request, reply, "http.request.start", {
      query: request.query ?? null,
      headers: pickRequestHeaders(request)
    });
  });

  if (mode === "trace") {
    app.addHook("preValidation", async (request, reply) => {
      traceRequest(mode, request, reply, "http.request.pre_validation", {
        body: summarizeBody(request.body)
      });
    });

    app.addHook("preHandler", async (request, reply) => {
      traceRequest(mode, request, reply, "http.request.pre_handler", {
        params: request.params ?? null
      });
    });

    app.addHook("onSend", async (request, reply, payload) => {
      let payloadSummary: Record<string, unknown> | null = null;
      if (typeof payload === "string") {
        payloadSummary = { type: "string", length: payload.length };
      } else if (payload && typeof payload === "object") {
        payloadSummary = { type: "object" };
      }

      traceRequest(mode, request, reply, "http.response.on_send", {
        payload: payloadSummary
      });

      return payload;
    });
  }

  app.addHook("onError", async (request, reply, error) => {
    traceRequest(mode, request, reply, "http.request.error", {
      error_name: error.name,
      error_message: error.message
    });
  });

  app.addHook("onResponse", async (request, reply) => {
    const durationMs = Date.now() - getRequestStartTime(request);
    traceRequest(mode, request, reply, "http.request.complete", {
      duration_ms: durationMs
    });
  });
};

