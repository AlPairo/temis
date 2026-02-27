import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentRegistryRepositoryPort } from "../../src/modules/documents/types.js";

const documentRouteMocks = vi.hoisted(() => {
  class MockJwtAuthError extends Error {
    readonly statusCode: number;

    constructor(message: string, statusCode = 401) {
      super(message);
      this.name = "JwtAuthError";
      this.statusCode = statusCode;
    }
  }

  return {
    JwtAuthError: MockJwtAuthError,
    resolveAuthenticatedUser: vi.fn()
  };
});

vi.mock("../../src/auth/service.js", () => ({
  JwtAuthError: documentRouteMocks.JwtAuthError,
  resolveAuthenticatedUser: documentRouteMocks.resolveAuthenticatedUser
}));

import { registerDocumentRoutes } from "../../src/api/routes/documents.ts";

function makeRepo(): DocumentRegistryRepositoryPort {
  return {
    resolveByDocId: vi.fn(),
    bulkUpsert: vi.fn(),
    listEntries: vi.fn(),
    updateEntry: vi.fn()
  };
}

describe("registerDocumentRoutes", () => {
  const originalLocalDocumentsDir = process.env.LOCAL_DOCUMENTS_DIR;

  beforeEach(() => {
    documentRouteMocks.resolveAuthenticatedUser.mockReset();
    documentRouteMocks.resolveAuthenticatedUser.mockResolvedValue(null);
    if (originalLocalDocumentsDir === undefined) {
      delete process.env.LOCAL_DOCUMENTS_DIR;
    } else {
      process.env.LOCAL_DOCUMENTS_DIR = originalLocalDocumentsDir;
    }
  });

  it("resolves a registered document for cited doc ids", async () => {
    const repo = makeRepo();
    vi.mocked(repo.resolveByDocId).mockResolvedValue({
      docId: "doc-1",
      url: "https://example.test/docs/doc-1.pdf",
      displayName: "Documento 1",
      sourceLabel: "jurisprudencia",
      mimeType: "application/pdf"
    });

    const app = Fastify();
    try {
      await registerDocumentRoutes(app, {
        createDocumentRegistryRepository: () => repo
      });

      const response = await app.inject({
        method: "GET",
        url: "/documents/doc-1/resolve"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        doc_id: "doc-1",
        url: "https://example.test/docs/doc-1.pdf",
        display_name: "Documento 1",
        source_label: "jurisprudencia",
        mime_type: "application/pdf"
      });
      expect(repo.resolveByDocId).toHaveBeenCalledWith("doc-1");
    } finally {
      await app.close();
    }
  });

  it("returns 404 when the doc id is not registered", async () => {
    const repo = makeRepo();
    vi.mocked(repo.resolveByDocId).mockResolvedValue(null);
    const app = Fastify();
    try {
      await registerDocumentRoutes(app, {
        createDocumentRegistryRepository: () => repo
      });

      const response = await app.inject({
        method: "GET",
        url: "/documents/missing/resolve"
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().detail).toContain("Documento");
    } finally {
      await app.close();
    }
  });

  it("returns jwt auth errors on resolve when auth middleware rejects", async () => {
    documentRouteMocks.resolveAuthenticatedUser.mockRejectedValue(
      new documentRouteMocks.JwtAuthError("Missing bearer token", 401)
    );

    const app = Fastify();
    try {
      await registerDocumentRoutes(app, {
        createDocumentRegistryRepository: () => makeRepo()
      });

      const response = await app.inject({
        method: "GET",
        url: "/documents/doc-1/resolve"
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ detail: "Missing bearer token" });
    } finally {
      await app.close();
    }
  });

  it("downloads a local file from the configured downloads directory", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pichufy-docs-"));
    const fileName = "doc-1_sentencia.pdf";
    const filePath = path.join(tempDir, fileName);
    await fs.writeFile(filePath, "PDFTEST", "utf8");
    process.env.LOCAL_DOCUMENTS_DIR = tempDir;

    const app = Fastify();
    try {
      await registerDocumentRoutes(app, {
        createDocumentRegistryRepository: () => makeRepo()
      });

      const response = await app.inject({
        method: "GET",
        url: "/documents/doc-1/download"
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/pdf");
      expect(String(response.headers["content-disposition"])).toContain("attachment");
      expect(response.body).toBe("PDFTEST");
    } finally {
      await app.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("restricts registry admin endpoints to admins", async () => {
    const repo = makeRepo();
    const app = Fastify();
    try {
      await registerDocumentRoutes(app, {
        createDocumentRegistryRepository: () => repo
      });

      documentRouteMocks.resolveAuthenticatedUser.mockResolvedValue({ userId: "u-basic", role: "basic" });
      const forbidden = await app.inject({
        method: "POST",
        url: "/documents/registry/bulk-upsert",
        payload: {
          documents: [{ doc_id: "doc-1", canonical_url: "https://example.test/doc-1.pdf" }]
        }
      });
      expect(forbidden.statusCode).toBe(403);

      documentRouteMocks.resolveAuthenticatedUser.mockResolvedValue(null);
      const unauthenticated = await app.inject({
        method: "GET",
        url: "/documents/registry"
      });
      expect(unauthenticated.statusCode).toBe(401);

      expect(repo.bulkUpsert).not.toHaveBeenCalled();
      expect(repo.listEntries).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("bulk upserts registry entries and returns partial rejections", async () => {
    const repo = makeRepo();
    vi.mocked(repo.bulkUpsert).mockResolvedValue({
      upserted: 1,
      rejected: [{ index: 1, docId: "doc-bad", reason: "canonical_url must be a valid URL" }]
    });
    documentRouteMocks.resolveAuthenticatedUser.mockResolvedValue({ userId: "u-admin", role: "admin" });

    const app = Fastify();
    try {
      await registerDocumentRoutes(app, {
        createDocumentRegistryRepository: () => repo
      });

      const response = await app.inject({
        method: "POST",
        url: "/documents/registry/bulk-upsert",
        payload: {
          documents: [
            { doc_id: "doc-1", canonical_url: "https://example.test/doc-1.pdf" },
            { doc_id: "doc-bad", canonical_url: "bad-url" }
          ]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        upserted: 1,
        rejected: [{ index: 1, docId: "doc-bad", reason: "canonical_url must be a valid URL" }]
      });
      expect(repo.bulkUpsert).toHaveBeenCalledWith({
        actorUserId: "u-admin",
        documents: [
          {
            docId: "doc-1",
            canonicalUrl: "https://example.test/doc-1.pdf",
            displayName: undefined,
            sourceLabel: undefined,
            mimeType: undefined,
            isActive: undefined
          },
          {
            docId: "doc-bad",
            canonicalUrl: "bad-url",
            displayName: undefined,
            sourceLabel: undefined,
            mimeType: undefined,
            isActive: undefined
          }
        ]
      });
    } finally {
      await app.close();
    }
  });

  it("lists and patches registry entries for admins", async () => {
    const repo = makeRepo();
    const now = new Date("2026-02-26T00:00:00.000Z");
    vi.mocked(repo.listEntries).mockResolvedValue({
      items: [
        {
          docId: "doc-1",
          canonicalUrl: "https://example.test/doc-1.pdf",
          displayName: "Doc 1",
          sourceLabel: "jurisprudencia",
          mimeType: "application/pdf",
          isActive: true,
          createdByUserId: "u-admin",
          updatedByUserId: "u-admin",
          createdAt: now,
          updatedAt: now
        }
      ],
      nextCursor: null
    });
    vi.mocked(repo.updateEntry).mockResolvedValue({
      docId: "doc-1",
      canonicalUrl: "https://example.test/doc-1-v2.pdf",
      displayName: "Doc 1",
      sourceLabel: "jurisprudencia",
      mimeType: "application/pdf",
      isActive: false,
      createdByUserId: "u-admin",
      updatedByUserId: "u-admin",
      createdAt: now,
      updatedAt: now
    });
    documentRouteMocks.resolveAuthenticatedUser.mockResolvedValue({ userId: "u-admin", role: "admin" });

    const app = Fastify();
    try {
      await registerDocumentRoutes(app, {
        createDocumentRegistryRepository: () => repo
      });

      const listResponse = await app.inject({
        method: "GET",
        url: "/documents/registry?search=doc&limit=10"
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual({
        items: [
          {
            doc_id: "doc-1",
            canonical_url: "https://example.test/doc-1.pdf",
            display_name: "Doc 1",
            source_label: "jurisprudencia",
            mime_type: "application/pdf",
            is_active: true,
            created_by_user_id: "u-admin",
            updated_by_user_id: "u-admin",
            created_at: now.toISOString(),
            updated_at: now.toISOString()
          }
        ],
        next_cursor: null
      });

      const patchResponse = await app.inject({
        method: "PATCH",
        url: "/documents/registry/doc-1",
        payload: {
          canonical_url: "https://example.test/doc-1-v2.pdf",
          is_active: false
        }
      });
      expect(patchResponse.statusCode).toBe(200);
      expect(repo.updateEntry).toHaveBeenCalledWith(
        "doc-1",
        {
          canonicalUrl: "https://example.test/doc-1-v2.pdf",
          isActive: false
        },
        "u-admin"
      );
      expect(patchResponse.json().is_active).toBe(false);
    } finally {
      await app.close();
    }
  });
});
