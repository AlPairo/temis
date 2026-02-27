import { beforeEach, describe, expect, it, vi } from "vitest";

const pgMocks = vi.hoisted(() => ({
  getPostgresClient: vi.fn(),
  poolQuery: vi.fn()
}));

vi.mock("../../src/clients/postgres.js", () => ({
  getPostgresClient: pgMocks.getPostgresClient
}));

import { DocumentRegistryRepository } from "../../src/modules/documents/document-registry-repository.js";

describe("modules/documents/document-registry-repository", () => {
  const repo = new DocumentRegistryRepository();

  beforeEach(() => {
    pgMocks.poolQuery.mockReset();
    pgMocks.getPostgresClient.mockReset();
    pgMocks.getPostgresClient.mockResolvedValue({ pool: { query: pgMocks.poolQuery } });
  });

  it("resolves active documents by doc id", async () => {
    const now = new Date("2026-02-26T00:00:00.000Z");
    pgMocks.poolQuery.mockResolvedValueOnce({
      rows: [
        {
          doc_id: "doc-1",
          canonical_url: "https://example.test/doc-1.pdf",
          display_name: "Doc 1",
          source_label: "jurisprudencia",
          mime_type: "application/pdf",
          is_active: true,
          created_by_user_id: null,
          updated_by_user_id: null,
          created_at: now,
          updated_at: now
        }
      ]
    });

    await expect(repo.resolveByDocId(" doc-1 ")).resolves.toEqual({
      docId: "doc-1",
      url: "https://example.test/doc-1.pdf",
      displayName: "Doc 1",
      sourceLabel: "jurisprudencia",
      mimeType: "application/pdf"
    });
    expect(pgMocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("FROM document_registry"), ["doc-1"]);
  });

  it("bulk upserts valid rows and reports per-row validation failures", async () => {
    pgMocks.poolQuery.mockResolvedValue({ rowCount: 1, rows: [] });

    const result = await repo.bulkUpsert({
      actorUserId: "u-admin",
      documents: [
        {
          docId: "doc-1",
          canonicalUrl: "https://example.test/a.pdf",
          displayName: " A ",
          sourceLabel: " src ",
          mimeType: " application/pdf "
        },
        {
          docId: "doc-bad",
          canonicalUrl: "notaurl"
        }
      ]
    });

    expect(result).toEqual({
      upserted: 1,
      rejected: [{ index: 1, docId: "doc-bad", reason: "canonical_url must be a valid URL" }]
    });
    expect(pgMocks.poolQuery).toHaveBeenCalledTimes(1);
    expect(pgMocks.poolQuery.mock.calls[0]?.[1]).toEqual([
      "doc-1",
      "https://example.test/a.pdf",
      "A",
      "src",
      "application/pdf",
      true,
      "u-admin"
    ]);
  });

  it("lists entries with pagination and maps next cursor", async () => {
    const now = new Date("2026-02-26T00:00:00.000Z");
    pgMocks.poolQuery.mockResolvedValueOnce({
      rows: [
        {
          doc_id: "doc-1",
          canonical_url: "https://example.test/1.pdf",
          display_name: null,
          source_label: null,
          mime_type: null,
          is_active: true,
          created_by_user_id: null,
          updated_by_user_id: null,
          created_at: now,
          updated_at: now
        },
        {
          doc_id: "doc-2",
          canonical_url: "https://example.test/2.pdf",
          display_name: null,
          source_label: null,
          mime_type: null,
          is_active: true,
          created_by_user_id: null,
          updated_by_user_id: null,
          created_at: now,
          updated_at: now
        }
      ]
    });

    const result = await repo.listEntries({ search: "doc", limit: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe("doc-1");
    expect(pgMocks.poolQuery.mock.calls[0]?.[1]).toEqual(["doc", null, 2]);
  });

  it("updates an existing entry and returns null when missing", async () => {
    const now = new Date("2026-02-26T00:00:00.000Z");
    pgMocks.poolQuery
      .mockResolvedValueOnce({
        rows: [
          {
            doc_id: "doc-1",
            canonical_url: "https://example.test/1.pdf",
            display_name: "Doc 1",
            source_label: "jurisprudencia",
            mime_type: "application/pdf",
            is_active: true,
            created_by_user_id: "u-admin",
            updated_by_user_id: "u-admin",
            created_at: now,
            updated_at: now
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            doc_id: "doc-1",
            canonical_url: "https://example.test/1-v2.pdf",
            display_name: "Doc 1",
            source_label: "jurisprudencia",
            mime_type: "application/pdf",
            is_active: false,
            created_by_user_id: "u-admin",
            updated_by_user_id: "u-admin",
            created_at: now,
            updated_at: now
          }
        ]
      });

    const updated = await repo.updateEntry(
      "doc-1",
      { canonicalUrl: "https://example.test/1-v2.pdf", isActive: false },
      "u-admin"
    );
    expect(updated?.canonicalUrl).toBe("https://example.test/1-v2.pdf");
    expect(updated?.isActive).toBe(false);

    pgMocks.poolQuery.mockReset();
    pgMocks.poolQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo.updateEntry("missing", { isActive: false })).resolves.toBeNull();
  });
});

