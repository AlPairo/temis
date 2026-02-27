import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { resolveAuthenticatedUser, JwtAuthError } from "../../auth/service.js";
import { ChatOrchestrator, toSafeUserErrorMessage } from "../../modules/chat/chat-orchestrator.js";
import { ChatRepository, type ChatRepositoryPort } from "../../modules/chat/chat-repository.js";
import { generateSessionTitleFromMessage } from "../../modules/chat/session-title-generator.js";
import { logError, logInfo, logWarn } from "../../observability/logger.js";
import { recordErrorRate, recordStreamDuration } from "../../observability/metrics.js";

const chatBodySchema = z.object({
  session_id: z.string().min(1, "session_id is required"),
  message: z.string().min(1, "message is required"),
  analysis_enabled: z.boolean().optional(),
  collections: z.array(z.string()).nullable().optional(),
  materia: z.array(z.string()).nullable().optional(),
  fecha_desde: z.string().nullable().optional(),
  fecha_hasta: z.string().nullable().optional(),
  dynamic_k: z.boolean().optional(),
  hybrid: z.boolean().optional(),
  alpha: z.number().optional(),
  beta: z.number().optional(),
  top_k: z.number().int().positive().optional(),
  chat_model: z.string().optional(),
  embedding_model: z.string().optional(),
  qdrant_host: z.string().optional(),
  qdrant_port: z.number().int().optional(),
  qdrant_api_key: z.string().nullable().optional(),
  openai_api_key: z.string().nullable().optional()
});

const toValidationError = (error: z.ZodError) => ({
  detail: error.issues.map((issue) => ({
    type: issue.code,
    loc: ["body", ...issue.path],
    msg: issue.message
  }))
});

const writeSseFrame = (reply: FastifyReply, event: string, data: string): void => {
  reply.raw.write(`event: ${event}\n`);
  for (const line of data.split(/\r?\n/)) {
    reply.raw.write(`data: ${line}\n`);
  }
  reply.raw.write("\n");
};

const resolveRequestId = (request: FastifyRequest): string => {
  const headerRequestId = request.headers["x-request-id"];
  if (typeof headerRequestId === "string" && headerRequestId.trim().length > 0) {
    return headerRequestId.trim();
  }
  return request.id;
};

const isOwnershipError = (error: unknown): boolean =>
  error instanceof Error && /ownership mismatch/i.test(error.message);

const sendJwtError = (reply: FastifyReply, error: JwtAuthError): void => {
  reply.code(error.statusCode).send({ detail: error.message });
};

const buildSseCorsHeaders = (request: FastifyRequest): Record<string, string> => {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || origin.trim().length === 0) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin"
  };
};

export interface ChatRoutesDependencies {
  createChatRepository?: () => ChatRepositoryPort;
  createOrchestrator?: () => Pick<ChatOrchestrator, "streamReply">;
  generateSessionTitle?: typeof generateSessionTitleFromMessage;
}

const buildStreamChatHandler = (dependencies?: ChatRoutesDependencies) => {
  const createChatRepository = dependencies?.createChatRepository ?? (() => new ChatRepository());
  const createOrchestrator = dependencies?.createOrchestrator ?? (() => new ChatOrchestrator());
  const generateSessionTitle = dependencies?.generateSessionTitle ?? generateSessionTitleFromMessage;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const requestId = resolveRequestId(request);
    const parsed = chatBodySchema.safeParse(request.body);
    if (!parsed.success) {
      recordErrorRate("validation_422");
      reply.code(422).send(toValidationError(parsed.error));
      return;
    }

    let authUser: Awaited<ReturnType<typeof resolveAuthenticatedUser>> = null;
    try {
      authUser = await resolveAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof JwtAuthError) {
        recordErrorRate("auth_401");
        sendJwtError(reply, error);
        return;
      }
      throw error;
    }

    const streamStartedAt = Date.now();
    const chatRepository = createChatRepository();
    const orchestrator = createOrchestrator();
    let conversation: Awaited<ReturnType<ChatRepositoryPort["ensureConversationBySessionId"]>>;
    const suggestedTitle = await generateSessionTitle({
      message: parsed.data.message,
      requestId,
      sessionId: parsed.data.session_id
    });

    try {
      conversation = await chatRepository.ensureConversationBySessionId({
        sessionId: parsed.data.session_id,
        userId: authUser?.userId ?? null,
        title: suggestedTitle
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "stream bootstrap failed";
      recordErrorRate("chat_stream_bootstrap_exception");
      logError(
        "chat.stream.bootstrap_error",
        {
          requestId,
          sessionId: parsed.data.session_id
        },
        {
          error: message,
          user_id: authUser?.userId ?? null
        }
      );
      if (isOwnershipError(error)) {
        reply.code(403).send({ detail: "No autorizado para esta sesión" });
        return;
      }
      reply.code(503).send({ detail: toSafeUserErrorMessage(error) });
      return;
    }

    logInfo(
      "chat.stream.start",
      {
        requestId,
        conversationId: conversation.id,
        sessionId: parsed.data.session_id
      },
      {
        route: request.routeOptions.url,
        user_id: authUser?.userId ?? null,
        analysis_enabled: parsed.data.analysis_enabled ?? false
      }
    );

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...buildSseCorsHeaders(request)
    });

    let closed = false;
    request.raw.on("close", () => {
      closed = true;
    });

    writeSseFrame(reply, "start", "[START]");
    if (conversation.title) {
      writeSseFrame(reply, "meta", JSON.stringify({ sessionTitle: conversation.title }));
    }

    try {
      for await (const event of orchestrator.streamReply({
        conversationId: conversation.id,
        sessionId: parsed.data.session_id,
        userId: authUser?.userId ?? null,
        userText: parsed.data.message,
        analysisEnabled: parsed.data.analysis_enabled ?? false,
        retrievalTopK: parsed.data.top_k,
        model: parsed.data.chat_model,
        requestId
      })) {
        if (closed) {
          logWarn(
            "chat.stream.closed_by_client",
            {
              requestId,
              conversationId: conversation.id,
              sessionId: parsed.data.session_id
            },
            {}
          );
          break;
        }

        if (event.type === "token") {
          writeSseFrame(reply, "token", event.token);
          } else if (event.type === "complete") {
            writeSseFrame(
              reply,
              "end",
              JSON.stringify({
                status: "[END]",
                content: event.content,
                messageId: event.messageId,
                citations: event.citations,
                lowConfidence: event.lowConfidence
              })
            );
          } else if (event.type === "error") {
          writeSseFrame(reply, "error", `[ERROR] ${event.safeMessage}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "stream failed";
      const safeMessage = toSafeUserErrorMessage(error);
      recordErrorRate("chat_stream_exception");
      logError(
        "chat.stream.error",
        {
          requestId,
          conversationId: conversation.id,
          sessionId: parsed.data.session_id
        },
        {
          error: message
        }
      );
      writeSseFrame(reply, "error", `[ERROR] ${safeMessage}`);
    } finally {
      const streamDurationMs = Date.now() - streamStartedAt;
      recordStreamDuration(streamDurationMs);
      logInfo(
        "chat.stream.complete",
        {
          requestId,
          conversationId: conversation.id,
          sessionId: parsed.data.session_id
        },
        {
          stream_duration_ms: streamDurationMs,
          closed_by_client: closed,
          analysis_enabled: parsed.data.analysis_enabled ?? false
        }
      );
      if (!closed) {
        reply.raw.end();
      }
    }
  };
};

export async function registerChatRoutes(app: FastifyInstance, dependencies?: ChatRoutesDependencies): Promise<void> {
  const streamChat = buildStreamChatHandler(dependencies);
  app.post("/chat/stream", streamChat);
  app.post("/chat-stream", streamChat);
}
