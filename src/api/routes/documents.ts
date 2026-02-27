import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { JwtAuthError, resolveAuthenticatedUser } from "../../auth/service.js";
import { logInfo, logWarn } from "../../observability/logger.js";
import type {
  DocumentRegistryRepositoryPort,
  UpdateDocumentRegistryInput
} from "../../modules/documents/types.js";

const documentParamsSchema = z.object({
  docId: z.string().trim().min(1, "docId is required")
});

const DEFAULT_LOCAL_DOCUMENTS_DIR = "C:\\Users\\Feli\\Desktop\\pichufy\\scraper\\downloads";

const bulkUpsertBodySchema = z.object({
  documents: z
    .array(
      z.object({
        doc_id: z.string().trim().min(1, "doc_id is required"),
        canonical_url: z.string().trim().min(1, "canonical_url is required"),
        display_name: z.string().nullable().optional(),
        source_label: z.string().nullable().optional(),
        mime_type: z.string().nullable().optional(),
        is_active: z.boolean().optional()
      })
    )
    .min(1, "documents is required")
});

const listRegistryQuerySchema = z.object({
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (typeof value === "number") {
        return value;
      }
      if (typeof value !== "string" || value.trim().length === 0) {
        return undefined;
      }
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    })
    .refine((value) => value === undefined || (Number.isInteger(value) && value > 0), {
      message: "limit must be a positive integer"
    })
});

const patchRegistryBodySchema = z
  .object({
    canonical_url: z.string().trim().min(1).optional(),
    display_name: z.string().nullable().optional(),
    source_label: z.string().nullable().optional(),
    mime_type: z.string().nullable().optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

const toValidationError = (error: z.ZodError, source: "params" | "query" | "body") => ({
  detail: error.issues.map((issue) => ({
    type: issue.code,
    loc: [source, ...issue.path],
    msg: issue.message
  }))
});

const resolveRequestId = (request: FastifyRequest): string => {
  const headerRequestId = request.headers["x-request-id"];
  if (typeof headerRequestId === "string" && headerRequestId.trim().length > 0) {
    return headerRequestId.trim();
  }
  return request.id;
};

const sendJwtError = (reply: FastifyReply, error: JwtAuthError): void => {
  reply.code(error.statusCode).send({ detail: error.message });
};

const resolveLocalDocumentsDir = (): string => {
  const configured = process.env.LOCAL_DOCUMENTS_DIR?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_LOCAL_DOCUMENTS_DIR;
};

const normalizeComparable = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const scoreFileMatch = (docId: string, filename: string): number => {
  const lowerDocId = normalizeComparable(docId);
  const stem = filename.replace(/\.[^.]+$/, "");
  const lowerStem = normalizeComparable(stem);
  const lowerFile = normalizeComparable(filename);

  if (lowerStem === lowerDocId) return 100;
  if (lowerFile === lowerDocId) return 95;
  if (lowerStem.startsWith(`${lowerDocId}_`)) return 85;
  if (lowerStem.includes(lowerDocId)) return 70;
  return 0;
};

const guessMimeType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  if (ext === ".html" || ext === ".htm") return "text/html; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
};

const buildContentDisposition = (filename: string): string => {
  const fallback = filename.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
};

const chooseDownloadFilename = (docId: string, localFileName: string): string => {
  const docExt = path.extname(docId);
  if (!docExt) {
    return localFileName;
  }

  const localLower = localFileName.toLowerCase();
  const docLower = docId.toLowerCase();
  const duplicatedSuffix = `${docExt}${docExt}`.toLowerCase();
  if (localLower === `${docLower}${docExt.toLowerCase()}` || localLower.endsWith(duplicatedSuffix)) {
    return docId;
  }

  return localFileName;
};

const findLocalDocumentFile = async (docId: string): Promise<{ filePath: string; fileName: string } | null> => {
  const dir = resolveLocalDocumentsDir();
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true, encoding: "utf8" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }

  const candidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const score = scoreFileMatch(docId, entry.name);
      return { name: entry.name, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const best = candidates[0];
  if (!best) {
    return null;
  }

  return {
    filePath: path.join(dir, best.name),
    fileName: best.name
  };
};

export interface DocumentRoutesDependencies {
  createDocumentRegistryRepository?: () => Promise<DocumentRegistryRepositoryPort> | DocumentRegistryRepositoryPort;
}

const defaultCreateDocumentRegistryRepository = async (): Promise<DocumentRegistryRepositoryPort> => {
  const module = await import("../../modules/documents/document-registry-repository.js");
  return new module.DocumentRegistryRepository();
};

const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const user = await resolveAuthenticatedUser(request);
    if (!user) {
      reply.code(401).send({ detail: "Authentication required" });
      return null;
    }
    if (user.role !== "admin") {
      reply.code(403).send({ detail: "No autorizado" });
      return null;
    }
    return user;
  } catch (error) {
    if (error instanceof JwtAuthError) {
      sendJwtError(reply, error);
      return null;
    }
    throw error;
  }
};

export async function registerDocumentRoutes(
  app: FastifyInstance,
  dependencies?: DocumentRoutesDependencies
): Promise<void> {
  const createDocumentRegistryRepository =
    dependencies?.createDocumentRegistryRepository ?? defaultCreateDocumentRegistryRepository;

  app.get("/documents/:docId/download", async (request, reply) => {
    const parsedParams = documentParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      reply.code(422).send(toValidationError(parsedParams.error, "params"));
      return;
    }

    let viewer = null;
    try {
      viewer = await resolveAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof JwtAuthError) {
        sendJwtError(reply, error);
        return;
      }
      throw error;
    }

    const localMatch = await findLocalDocumentFile(parsedParams.data.docId);
    if (localMatch) {
      logInfo(
        "document.download.local.success",
        { requestId: resolveRequestId(request), sessionId: null },
        {
          doc_id: parsedParams.data.docId,
          user_id: viewer?.userId ?? null,
          filename: localMatch.fileName
        }
      );

      const downloadFileName = chooseDownloadFilename(parsedParams.data.docId, localMatch.fileName);
      const fileBytes = await fs.readFile(localMatch.filePath);
      reply.header("Content-Type", guessMimeType(localMatch.fileName));
      reply.header("Content-Disposition", buildContentDisposition(downloadFileName));
      reply.header("Access-Control-Expose-Headers", "Content-Disposition, Content-Type");
      reply.header("Content-Length", String(fileBytes.byteLength));
      reply.header("Cache-Control", "no-store");
      reply.send(fileBytes);
      return;
    }

    const repo = await createDocumentRegistryRepository();
    const resolved = await repo.resolveByDocId(parsedParams.data.docId);
    if (resolved) {
      logInfo(
        "document.download.redirect",
        { requestId: resolveRequestId(request), sessionId: null },
        {
          doc_id: parsedParams.data.docId,
          user_id: viewer?.userId ?? null
        }
      );
      reply.redirect(resolved.url);
      return;
    }

    logWarn(
      "document.download.not_found",
      { requestId: resolveRequestId(request), sessionId: null },
      { doc_id: parsedParams.data.docId, user_id: viewer?.userId ?? null }
    );
    reply.code(404).send({ detail: "Documento no disponible" });
  });

  app.get("/documents/:docId/resolve", async (request, reply) => {
    const parsedParams = documentParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      reply.code(422).send(toValidationError(parsedParams.error, "params"));
      return;
    }

    let viewer = null;
    try {
      viewer = await resolveAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof JwtAuthError) {
        sendJwtError(reply, error);
        return;
      }
      throw error;
    }

    const localMatch = await findLocalDocumentFile(parsedParams.data.docId);
    if (localMatch) {
      const host = request.headers.host;
      const forwardedProto = request.headers["x-forwarded-proto"];
      const proto =
        typeof forwardedProto === "string" && forwardedProto.trim().length > 0
          ? forwardedProto.split(",")[0]!.trim()
          : request.protocol;
      const base =
        typeof host === "string" && host.trim().length > 0 ? `${proto}://${host}` : "";
      const urlPath = `/documents/${encodeURIComponent(parsedParams.data.docId)}/download`;

      reply.send({
        doc_id: parsedParams.data.docId,
        url: `${base}${urlPath}`,
        display_name: localMatch.fileName,
        source_label: "local-downloads",
        mime_type: guessMimeType(localMatch.fileName)
      });
      return;
    }

    const repo = await createDocumentRegistryRepository();
    const resolved = await repo.resolveByDocId(parsedParams.data.docId);
    if (!resolved) {
      logWarn(
        "document.resolve.not_found",
        { requestId: resolveRequestId(request), sessionId: null },
        { doc_id: parsedParams.data.docId, user_id: viewer?.userId ?? null }
      );
      reply.code(404).send({ detail: "Documento no disponible" });
      return;
    }

    logInfo(
      "document.resolve.success",
      { requestId: resolveRequestId(request), sessionId: null },
      { doc_id: resolved.docId, user_id: viewer?.userId ?? null }
    );

    reply.send({
      doc_id: resolved.docId,
      url: resolved.url,
      display_name: resolved.displayName,
      source_label: resolved.sourceLabel,
      mime_type: resolved.mimeType
    });
  });

  app.get("/documents/registry", async (request, reply) => {
    const parsedQuery = listRegistryQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      reply.code(422).send(toValidationError(parsedQuery.error, "query"));
      return;
    }

    const admin = await requireAdmin(request, reply);
    if (!admin) {
      return;
    }

    const repo = await createDocumentRegistryRepository();
    const result = await repo.listEntries({
      search: parsedQuery.data.search,
      cursor: parsedQuery.data.cursor,
      limit: parsedQuery.data.limit
    });

    logInfo(
      "document.registry.list",
      { requestId: resolveRequestId(request), sessionId: null },
      {
        user_id: admin.userId,
        count: result.items.length,
        next_cursor: result.nextCursor
      }
    );

    reply.send({
      items: result.items.map((item) => ({
        doc_id: item.docId,
        canonical_url: item.canonicalUrl,
        display_name: item.displayName,
        source_label: item.sourceLabel,
        mime_type: item.mimeType,
        is_active: item.isActive,
        created_by_user_id: item.createdByUserId,
        updated_by_user_id: item.updatedByUserId,
        created_at: item.createdAt.toISOString(),
        updated_at: item.updatedAt.toISOString()
      })),
      next_cursor: result.nextCursor
    });
  });

  app.post("/documents/registry/bulk-upsert", async (request, reply) => {
    const parsedBody = bulkUpsertBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      reply.code(422).send(toValidationError(parsedBody.error, "body"));
      return;
    }

    const admin = await requireAdmin(request, reply);
    if (!admin) {
      return;
    }

    const repo = await createDocumentRegistryRepository();
    const result = await repo.bulkUpsert({
      actorUserId: admin.userId,
      documents: parsedBody.data.documents.map((doc) => ({
        docId: doc.doc_id,
        canonicalUrl: doc.canonical_url,
        displayName: doc.display_name,
        sourceLabel: doc.source_label,
        mimeType: doc.mime_type,
        isActive: doc.is_active
      }))
    });

    logInfo(
      "document.registry.bulk_upsert",
      { requestId: resolveRequestId(request), sessionId: null },
      {
        user_id: admin.userId,
        submitted: parsedBody.data.documents.length,
        upserted: result.upserted,
        rejected: result.rejected.length
      }
    );

    reply.send({
      upserted: result.upserted,
      rejected: result.rejected
    });
  });

  app.patch("/documents/registry/:docId", async (request, reply) => {
    const parsedParams = documentParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      reply.code(422).send(toValidationError(parsedParams.error, "params"));
      return;
    }

    const parsedBody = patchRegistryBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      reply.code(422).send(toValidationError(parsedBody.error, "body"));
      return;
    }

    const admin = await requireAdmin(request, reply);
    if (!admin) {
      return;
    }

    const patch: UpdateDocumentRegistryInput = {};
    if ("canonical_url" in parsedBody.data) patch.canonicalUrl = parsedBody.data.canonical_url;
    if ("display_name" in parsedBody.data) patch.displayName = parsedBody.data.display_name;
    if ("source_label" in parsedBody.data) patch.sourceLabel = parsedBody.data.source_label;
    if ("mime_type" in parsedBody.data) patch.mimeType = parsedBody.data.mime_type;
    if ("is_active" in parsedBody.data) patch.isActive = parsedBody.data.is_active;

    const repo = await createDocumentRegistryRepository();
    try {
      const updated = await repo.updateEntry(parsedParams.data.docId, patch, admin.userId);
      if (!updated) {
        reply.code(404).send({ detail: "Documento no encontrado" });
        return;
      }

      logInfo(
        "document.registry.patch",
        { requestId: resolveRequestId(request), sessionId: null },
        {
          user_id: admin.userId,
          doc_id: updated.docId,
          is_active: updated.isActive
        }
      );

      reply.send({
        doc_id: updated.docId,
        canonical_url: updated.canonicalUrl,
        display_name: updated.displayName,
        source_label: updated.sourceLabel,
        mime_type: updated.mimeType,
        is_active: updated.isActive,
        created_by_user_id: updated.createdByUserId,
        updated_by_user_id: updated.updatedByUserId,
        created_at: updated.createdAt.toISOString(),
        updated_at: updated.updatedAt.toISOString()
      });
    } catch (error) {
      if (error instanceof Error) {
        reply.code(422).send({
          detail: [
            {
              type: "custom",
              loc: ["body"],
              msg: error.message
            }
          ]
        });
        return;
      }
      throw error;
    }
  });
}
