import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  buildSessionViewerScope,
  canViewerDeleteOwnSession,
  canViewerRenameOwnSession,
  canViewerUseDeletedFilter,
  isOwner,
  JwtAuthError
} from "../../auth/service.js";
import type { AuthenticatedUser } from "../../auth/types.js";
import { logInfo, logWarn } from "../../observability/logger.js";
import type { ChatRepositoryPort } from "../../modules/chat/chat-repository.js";

const sessionParamsSchema = z.object({
  id: z.string().min(1, "id is required")
});

const renameSessionBodySchema = z.object({
  title: z.string().trim().min(1, "title is required").max(120, "title is too long")
});

const sessionListQuerySchema = z.object({
  include_deleted: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => {
      if (typeof value === "boolean") {
        return value;
      }
      const normalized = value?.trim().toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
    }),
  scope: z.enum(["mine", "visible"]).optional().default("mine")
});

const sessionDetailQuerySchema = z.object({
  include_deleted: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => {
      if (typeof value === "boolean") {
        return value;
      }
      const normalized = value?.trim().toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
    })
});

const toValidationError = (error: z.ZodError, source: "params" | "query" | "body") => ({
  detail: error.issues.map((issue) => ({
    type: issue.code,
    loc: [source, ...issue.path],
    msg: issue.message
  }))
});

export interface SessionRoutesDependencies {
  createChatRepository?: () => Promise<ChatRepositoryPort> | ChatRepositoryPort;
}

const resolveRequestId = (request: FastifyRequest): string => {
  const headerRequestId = request.headers["x-request-id"];
  if (typeof headerRequestId === "string" && headerRequestId.trim().length > 0) {
    return headerRequestId.trim();
  }
  return request.id;
};

const defaultCreateChatRepository = async (): Promise<ChatRepositoryPort> => {
  const module = await import("../../modules/chat/chat-repository.js");
  return new module.ChatRepository();
};

const sendJwtError = (reply: FastifyReply, error: JwtAuthError): void => {
  reply.code(error.statusCode).send({ detail: error.message });
};

const toSessionSummaryResponse = (session: Awaited<ReturnType<ChatRepositoryPort["listSessions"]>>[number], viewer: AuthenticatedUser | null) => {
  const owner = isOwner(viewer, session.ownerUserId);
  return {
    session_id: session.sessionId,
    title: session.title,
    turns: session.turns,
    last_message: session.lastMessage,
    is_deleted: session.deletedAt !== null,
    deleted_at: session.deletedAt ? session.deletedAt.toISOString() : null,
    owner_user_id: session.ownerUserId,
    can_rename: owner && canViewerRenameOwnSession(viewer),
    can_delete: owner && canViewerDeleteOwnSession(viewer)
  };
};

export async function registerSessionRoutes(
  app: FastifyInstance,
  dependencies?: SessionRoutesDependencies
): Promise<void> {
  const createChatRepository = dependencies?.createChatRepository ?? defaultCreateChatRepository;

  app.get("/sessions", async (request, reply) => {
    const parsedQuery = sessionListQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      reply.code(422).send(toValidationError(parsedQuery.error, "query"));
      return;
    }

    let viewerScope;
    try {
      viewerScope = await buildSessionViewerScope({
        request,
        requestedIncludeDeleted: parsedQuery.data.include_deleted,
        requestedScope: parsedQuery.data.scope
      });
    } catch (error) {
      if (error instanceof JwtAuthError) {
        sendJwtError(reply, error);
        return;
      }
      throw error;
    }

    if (parsedQuery.data.include_deleted && viewerScope.viewer && !canViewerUseDeletedFilter(viewerScope.viewer)) {
      reply.code(403).send({ detail: "No autorizado para ver sesiones eliminadas" });
      return;
    }

    const chatRepository = await createChatRepository();
    const sessions = await chatRepository.listSessions({
      visibleUserIds: viewerScope.visibleUserIds,
      includeDeleted: viewerScope.includeDeleted
    });

    logInfo(
      "sessions.list",
      {
        requestId: resolveRequestId(request),
        sessionId: null
      },
      {
        session_count: sessions.length,
        user_id: viewerScope.viewer?.userId ?? null,
        scope: parsedQuery.data.scope,
        include_deleted: viewerScope.includeDeleted
      }
    );

    return sessions.map((session) => toSessionSummaryResponse(session, viewerScope.viewer));
  });

  app.post("/sessions", async (_request, reply) => {
    reply.code(405).send({ detail: "Method Not Allowed" });
  });

  app.patch("/sessions/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedParams = sessionParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      reply.code(422).send(toValidationError(parsedParams.error, "params"));
      return;
    }

    const parsedBody = renameSessionBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      reply.code(422).send(toValidationError(parsedBody.error, "body"));
      return;
    }

    let viewerScope;
    try {
      viewerScope = await buildSessionViewerScope({ request });
    } catch (error) {
      if (error instanceof JwtAuthError) {
        sendJwtError(reply, error);
        return;
      }
      throw error;
    }

    if (!canViewerRenameOwnSession(viewerScope.viewer)) {
      reply.code(403).send({ detail: "No autorizado para renombrar sesiones" });
      return;
    }

    const chatRepository = await createChatRepository();
    const renamed = await chatRepository.renameSession(
      parsedParams.data.id,
      viewerScope.viewer?.userId ?? null,
      parsedBody.data.title
    );

    if (!renamed) {
      reply.code(404).send({ detail: "Sesión no encontrada" });
      return;
    }

    logInfo(
      "sessions.rename",
      {
        requestId: resolveRequestId(request),
        sessionId: parsedParams.data.id
      },
      {
        user_id: viewerScope.viewer?.userId ?? null,
        title: renamed.title
      }
    );

    reply.send({
      session_id: renamed.sessionId,
      title: renamed.title,
      updated: true
    });
  });

  app.get("/sessions/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedParams = sessionParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      reply.code(422).send(toValidationError(parsedParams.error, "params"));
      return;
    }

    const parsedQuery = sessionDetailQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      reply.code(422).send(toValidationError(parsedQuery.error, "query"));
      return;
    }

    let viewerScope;
    try {
      viewerScope = await buildSessionViewerScope({
        request,
        requestedIncludeDeleted: parsedQuery.data.include_deleted,
        requestedScope: "visible"
      });
    } catch (error) {
      if (error instanceof JwtAuthError) {
        sendJwtError(reply, error);
        return;
      }
      throw error;
    }

    if (parsedQuery.data.include_deleted && viewerScope.viewer && !canViewerUseDeletedFilter(viewerScope.viewer)) {
      reply.code(403).send({ detail: "No autorizado para ver sesiones eliminadas" });
      return;
    }

    const chatRepository = await createChatRepository();
    const session = await chatRepository.getSessionById(parsedParams.data.id, {
      visibleUserIds: viewerScope.visibleUserIds,
      includeDeleted: viewerScope.includeDeleted
    });
    if (!session) {
      reply.code(404).send({ detail: "Sesión no encontrada" });
      return;
    }

    const owner = isOwner(viewerScope.viewer, session.ownerUserId);
    reply.send({
      session_id: session.sessionId,
      title: session.title,
      is_deleted: session.deletedAt !== null,
      deleted_at: session.deletedAt ? session.deletedAt.toISOString() : null,
      owner_user_id: session.ownerUserId,
      can_rename: owner && canViewerRenameOwnSession(viewerScope.viewer),
      can_delete: owner && canViewerDeleteOwnSession(viewerScope.viewer),
      history: session.history.map((message) => ({
        role: message.role,
        content: message.content,
        ...(message.citations ? { citations: message.citations } : {}),
        ...(typeof message.lowConfidence === "boolean" ? { lowConfidence: message.lowConfidence } : {})
      }))
    });
    logInfo(
      "sessions.get",
      {
        requestId: resolveRequestId(request),
        conversationId: session.conversationId,
        sessionId: parsedParams.data.id
      },
      {
        turns: session.history.length,
        user_id: viewerScope.viewer?.userId ?? null,
        is_deleted: session.deletedAt !== null
      }
    );
  });

  app.delete("/sessions/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = sessionParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(422).send(toValidationError(parsed.error, "params"));
      return;
    }

    let viewerScope;
    try {
      viewerScope = await buildSessionViewerScope({ request });
    } catch (error) {
      if (error instanceof JwtAuthError) {
        sendJwtError(reply, error);
        return;
      }
      throw error;
    }

    if (!canViewerDeleteOwnSession(viewerScope.viewer)) {
      reply.code(403).send({ detail: "No autorizado para eliminar sesiones" });
      return;
    }

    const chatRepository = await createChatRepository();
    const deleted = await chatRepository.softDeleteSession(parsed.data.id, viewerScope.viewer?.userId ?? null);
    if (!deleted) {
      if (viewerScope.viewer) {
        logWarn(
          "sessions.delete.not_found_or_forbidden",
          {
            requestId: resolveRequestId(request),
            sessionId: parsed.data.id
          },
          { user_id: viewerScope.viewer.userId }
        );
      }
      reply.code(404).send({ detail: "Sesión no encontrada" });
      return;
    }

    reply.send({ detail: `Sesión '${parsed.data.id}' eliminada`, deleted: true });
    logInfo(
      "sessions.delete",
      {
        requestId: resolveRequestId(request),
        sessionId: parsed.data.id
      },
      {
        user_id: viewerScope.viewer?.userId ?? null
      }
    );
  });
}
