export type RetrievalFilters = {
  jurisdiction?: string;
  effective_date?: string;
  source?: string;
};

export type RetrievalInput = {
  query: string;
  filters?: RetrievalFilters;
  topK?: number;
  embeddingModel?: string;
  requestId?: string;
  conversationId?: string;
};

export type RetrievedChunk = {
  doc_id: string;
  chunk_id: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
};

export type Citation = {
  id: string;
  doc_id: string;
  chunk_id: string;
  source?: string;
  jurisdiction?: string;
  effective_date?: string;
  score: number;
};

export type RetrievalResult = {
  chunks: RetrievedChunk[];
  citations: Citation[];
  latencyMs: number;
  lowConfidence: boolean;
};
