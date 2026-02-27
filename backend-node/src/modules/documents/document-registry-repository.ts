import { getPostgresClient } from "../../clients/postgres.js";
import type {
  BulkUpsertDocumentInput,
  BulkUpsertDocumentResult,
  DocumentRegistryEntry,
  DocumentRegistryRepositoryPort,
  ListDocumentRegistryInput,
  ListDocumentRegistryResult,
  ResolveDocumentResult,
  UpdateDocumentRegistryInput
} from "./types.js";

interface DocumentRegistryRow {
  doc_id: string;
  canonical_url: string;
  display_name: string | null;
  source_label: string | null;
  mime_type: string | null;
  is_active: boolean;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

const normalizeTrimmed = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return value ?? null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeRequiredDocId = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("doc_id is required");
  }
  return trimmed;
};

const normalizeCanonicalUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("canonical_url is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("canonical_url must be a valid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("canonical_url must use http or https");
  }

  return parsed.toString();
};

const toDocumentRegistryEntry = (row: DocumentRegistryRow): DocumentRegistryEntry => ({
  docId: row.doc_id,
  canonicalUrl: row.canonical_url,
  displayName: row.display_name,
  sourceLabel: row.source_label,
  mimeType: row.mime_type,
  isActive: row.is_active,
  createdByUserId: row.created_by_user_id,
  updatedByUserId: row.updated_by_user_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toResolveDocumentResult = (row: DocumentRegistryRow): ResolveDocumentResult => ({
  docId: row.doc_id,
  url: row.canonical_url,
  displayName: row.display_name,
  sourceLabel: row.source_label,
  mimeType: row.mime_type
});

export class DocumentRegistryRepository implements DocumentRegistryRepositoryPort {
  async resolveByDocId(docId: string): Promise<ResolveDocumentResult | null> {
    const { pool } = await getPostgresClient();
    const normalizedDocId = normalizeRequiredDocId(docId);
    const result = await pool.query<DocumentRegistryRow>(
      `
        SELECT
          doc_id,
          canonical_url,
          display_name,
          source_label,
          mime_type,
          is_active,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at
        FROM document_registry
        WHERE doc_id = $1
          AND is_active = TRUE
        LIMIT 1
      `,
      [normalizedDocId]
    );

    const row = result.rows[0];
    return row ? toResolveDocumentResult(row) : null;
  }

  async bulkUpsert(input: {
    documents: BulkUpsertDocumentInput[];
    actorUserId?: string | null;
  }): Promise<BulkUpsertDocumentResult> {
    const { pool } = await getPostgresClient();
    const actorUserId = input.actorUserId ?? null;
    let upserted = 0;
    const rejected: BulkUpsertDocumentResult["rejected"] = [];

    for (const [index, raw] of input.documents.entries()) {
      try {
        const docId = normalizeRequiredDocId(raw.docId);
        const canonicalUrl = normalizeCanonicalUrl(raw.canonicalUrl);
        const displayName = normalizeTrimmed(raw.displayName);
        const sourceLabel = normalizeTrimmed(raw.sourceLabel);
        const mimeType = normalizeTrimmed(raw.mimeType);
        const isActive = raw.isActive ?? true;

        await pool.query(
          `
            INSERT INTO document_registry (
              doc_id,
              canonical_url,
              display_name,
              source_label,
              mime_type,
              is_active,
              created_by_user_id,
              updated_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
            ON CONFLICT (doc_id) DO UPDATE
            SET canonical_url = EXCLUDED.canonical_url,
                display_name = EXCLUDED.display_name,
                source_label = EXCLUDED.source_label,
                mime_type = EXCLUDED.mime_type,
                is_active = EXCLUDED.is_active,
                updated_by_user_id = EXCLUDED.updated_by_user_id,
                updated_at = NOW()
          `,
          [docId, canonicalUrl, displayName, sourceLabel, mimeType, isActive, actorUserId]
        );

        upserted += 1;
      } catch (error) {
        rejected.push({
          index,
          docId: typeof raw.docId === "string" && raw.docId.trim() ? raw.docId.trim() : undefined,
          reason: error instanceof Error ? error.message : "unknown error"
        });
      }
    }

    return { upserted, rejected };
  }

  async listEntries(input?: ListDocumentRegistryInput): Promise<ListDocumentRegistryResult> {
    const { pool } = await getPostgresClient();
    const search = normalizeTrimmed(input?.search ?? null);
    const cursor = normalizeTrimmed(input?.cursor ?? null);
    const limit = Math.max(1, Math.min(MAX_LIST_LIMIT, Math.trunc(input?.limit ?? DEFAULT_LIST_LIMIT)));
    const result = await pool.query<DocumentRegistryRow>(
      `
        SELECT
          doc_id,
          canonical_url,
          display_name,
          source_label,
          mime_type,
          is_active,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at
        FROM document_registry
        WHERE ($1::text IS NULL
          OR doc_id ILIKE '%' || $1 || '%'
          OR COALESCE(display_name, '') ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR doc_id > $2)
        ORDER BY doc_id ASC
        LIMIT $3
      `,
      [search, cursor, limit + 1]
    );

    const rows = result.rows;
    const hasNext = rows.length > limit;
    const pageRows = hasNext ? rows.slice(0, limit) : rows;

    return {
      items: pageRows.map(toDocumentRegistryEntry),
      nextCursor: hasNext ? pageRows[pageRows.length - 1]?.doc_id ?? null : null
    };
  }

  async updateEntry(
    docId: string,
    patch: UpdateDocumentRegistryInput,
    actorUserId?: string | null
  ): Promise<DocumentRegistryEntry | null> {
    const { pool } = await getPostgresClient();
    const normalizedDocId = normalizeRequiredDocId(docId);
    const existing = await pool.query<DocumentRegistryRow>(
      `
        SELECT
          doc_id,
          canonical_url,
          display_name,
          source_label,
          mime_type,
          is_active,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at
        FROM document_registry
        WHERE doc_id = $1
        LIMIT 1
      `,
      [normalizedDocId]
    );

    const row = existing.rows[0];
    if (!row) {
      return null;
    }

    const nextCanonicalUrl =
      patch.canonicalUrl !== undefined ? normalizeCanonicalUrl(patch.canonicalUrl) : row.canonical_url;
    const nextDisplayName = patch.displayName !== undefined ? normalizeTrimmed(patch.displayName) : row.display_name;
    const nextSourceLabel = patch.sourceLabel !== undefined ? normalizeTrimmed(patch.sourceLabel) : row.source_label;
    const nextMimeType = patch.mimeType !== undefined ? normalizeTrimmed(patch.mimeType) : row.mime_type;
    const nextIsActive = patch.isActive !== undefined ? patch.isActive : row.is_active;

    const updated = await pool.query<DocumentRegistryRow>(
      `
        UPDATE document_registry
        SET canonical_url = $2,
            display_name = $3,
            source_label = $4,
            mime_type = $5,
            is_active = $6,
            updated_by_user_id = $7,
            updated_at = NOW()
        WHERE doc_id = $1
        RETURNING
          doc_id,
          canonical_url,
          display_name,
          source_label,
          mime_type,
          is_active,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at
      `,
      [normalizedDocId, nextCanonicalUrl, nextDisplayName, nextSourceLabel, nextMimeType, nextIsActive, actorUserId ?? null]
    );

    return toDocumentRegistryEntry(updated.rows[0]);
  }
}

