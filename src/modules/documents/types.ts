export interface DocumentRegistryEntry {
  docId: string;
  canonicalUrl: string;
  displayName: string | null;
  sourceLabel: string | null;
  mimeType: string | null;
  isActive: boolean;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResolveDocumentResult {
  docId: string;
  url: string;
  displayName: string | null;
  sourceLabel: string | null;
  mimeType: string | null;
}

export interface BulkUpsertDocumentInput {
  docId: string;
  canonicalUrl: string;
  displayName?: string | null;
  sourceLabel?: string | null;
  mimeType?: string | null;
  isActive?: boolean;
}

export interface BulkUpsertDocumentRejected {
  index: number;
  docId?: string;
  reason: string;
}

export interface BulkUpsertDocumentResult {
  upserted: number;
  rejected: BulkUpsertDocumentRejected[];
}

export interface ListDocumentRegistryInput {
  search?: string | null;
  cursor?: string | null;
  limit?: number;
}

export interface ListDocumentRegistryResult {
  items: DocumentRegistryEntry[];
  nextCursor: string | null;
}

export interface UpdateDocumentRegistryInput {
  canonicalUrl?: string;
  displayName?: string | null;
  sourceLabel?: string | null;
  mimeType?: string | null;
  isActive?: boolean;
}

export interface DocumentRegistryRepositoryPort {
  resolveByDocId(docId: string): Promise<ResolveDocumentResult | null>;
  bulkUpsert(input: {
    documents: BulkUpsertDocumentInput[];
    actorUserId?: string | null;
  }): Promise<BulkUpsertDocumentResult>;
  listEntries(input?: ListDocumentRegistryInput): Promise<ListDocumentRegistryResult>;
  updateEntry(
    docId: string,
    patch: UpdateDocumentRegistryInput,
    actorUserId?: string | null
  ): Promise<DocumentRegistryEntry | null>;
}

