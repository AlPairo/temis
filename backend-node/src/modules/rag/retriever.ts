import { buildCitations } from "./citation-builder.js";
import { getOpenAIClient } from "../../clients/openai.js";
import { getQdrantClient } from "../../clients/qdrant.js";
import { logInfo } from "../../observability/logger.js";
import { recordRetrievalLatency } from "../../observability/metrics.js";
import { rerankChunks } from "./reranker.js";
import type {
  RetrievalFilters,
  RetrievalInput,
  RetrievalResult,
  RetrievedChunk,
} from "./types.js";

const DEFAULT_TOP_K = 5;
const DEFAULT_RERANK_CANDIDATE_TOP_K = 20;
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export interface RetrieverDependencies {
  now?: () => number;
  getEnv?: (name: string) => string | undefined;
  getOpenAIClient?: typeof getOpenAIClient;
  getQdrantClient?: typeof getQdrantClient;
  rerankChunks?: typeof rerankChunks;
  recordRetrievalLatency?: typeof recordRetrievalLatency;
  logInfo?: typeof logInfo;
}

export class RetrieverHealthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetrieverHealthError";
  }
}

type QdrantSearchRequest = {
  vector: number[];
  limit: number;
  with_payload: boolean;
  with_vector: boolean;
  filter?: {
    must: Array<Record<string, unknown>>;
  };
};

type QdrantPoint = {
  id?: string | number;
  score?: number;
  payload?: Record<string, unknown>;
};

const readEnv = (name: string): string | undefined => {
  const value =
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.[name];
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  return value.trim();
};

const resolveDependencies = (dependencies?: RetrieverDependencies) => ({
  now: dependencies?.now ?? Date.now,
  getEnv: dependencies?.getEnv ?? readEnv,
  getOpenAIClient: dependencies?.getOpenAIClient ?? getOpenAIClient,
  getQdrantClient: dependencies?.getQdrantClient ?? getQdrantClient,
  rerankChunks: dependencies?.rerankChunks ?? rerankChunks,
  recordRetrievalLatency: dependencies?.recordRetrievalLatency ?? recordRetrievalLatency,
  logInfo: dependencies?.logInfo ?? logInfo,
});

const buildFilter = (
  filters: RetrievalFilters | undefined,
): QdrantSearchRequest["filter"] => {
  if (!filters) {
    return undefined;
  }

  const must: Array<Record<string, unknown>> = [];

  if (filters.jurisdiction) {
    must.push({ key: "jurisdiction", match: { value: filters.jurisdiction } });
  }
  if (filters.effective_date) {
    must.push({ key: "effective_date", match: { value: filters.effective_date } });
  }
  if (filters.source) {
    must.push({ key: "source", match: { value: filters.source } });
  }

  if (must.length === 0) {
    return undefined;
  }

  return { must };
};

const ensureQdrantConfig = (getEnv: (name: string) => string | undefined = readEnv): {
  collection: string;
} => {
  const collection = getEnv("QDRANT_COLLECTION");

  if (!collection) {
    throw new RetrieverHealthError(
      "Qdrant health error: QDRANT_COLLECTION is missing.",
    );
  }

  return { collection };
};

const getEmbedding = async (
  query: string,
  embeddingModel: string,
  dependencies: ReturnType<typeof resolveDependencies>,
): Promise<number[]> => {
  if (!dependencies.getEnv("OPENAI_API_KEY")) {
    throw new RetrieverHealthError(
      "Retriever health error: OPENAI_API_KEY is missing.",
    );
  }

  const { client } = await dependencies.getOpenAIClient();
  const response = await client.embeddings.create({
      model: embeddingModel,
      input: query,
  });

  const embedding = response.data?.[0]?.embedding;

  if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Embedding response missing vector payload.");
  }

  return embedding;
};

const searchQdrant = async (
  collection: string,
  request: QdrantSearchRequest,
  dependencies: ReturnType<typeof resolveDependencies>,
): Promise<QdrantPoint[]> => {
  try {
    const { client } = await dependencies.getQdrantClient();
    const payload = (await client.search(collection, request)) as
      | QdrantPoint[]
      | {
      points?: QdrantPoint[];
      result?: { points?: QdrantPoint[] } | QdrantPoint[];
    };

    if (Array.isArray(payload)) {
      return payload;
    }
    if (Array.isArray(payload.result)) {
      return payload.result;
    }
    if (Array.isArray(payload.points)) {
      return payload.points;
    }
    return payload.result?.points ?? [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown qdrant error";
    throw new RetrieverHealthError(`Qdrant health error: ${message}`);
  }
};

const pickFirstString = (
  source: Record<string, unknown>,
  keys: string[],
): string | undefined => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
};

const normalizeChunk = (point: QdrantPoint): RetrievedChunk | null => {
  const metadata = point.payload ?? {};
  const docId = pickFirstString(metadata, [
    "doc_id",
    "id_documento",
    "document_id",
    "documento_id",
    "id"
  ]);
  const chunkId = pickFirstString(metadata, [
    "chunk_id",
    "id_fragmento",
    "fragment_id",
    "fragmento_id",
    "id_chunk"
  ]);
  const textCandidate = pickFirstString(metadata, [
    "text",
    "content",
    "chunk",
    "texto",
    "contenido"
  ]);

  if (
    typeof docId !== "string" ||
    typeof textCandidate !== "string"
  ) {
    return null;
  }

  const safeChunkId =
    typeof chunkId === "string"
      ? chunkId
      : typeof point.id === "string" || typeof point.id === "number"
        ? String(point.id)
        : "chunk-unknown";

  return {
    doc_id: docId,
    chunk_id: safeChunkId,
    text: textCandidate,
    score: typeof point.score === "number" ? point.score : 0,
    metadata,
  };
};

const inferLowConfidence = (chunks: RetrievedChunk[]): boolean => {
  if (chunks.length === 0) {
    return true;
  }
  return Math.max(...chunks.map((chunk) => chunk.score)) < 0.35;
};

export const retrieve = async (input: RetrievalInput, dependencies?: RetrieverDependencies): Promise<RetrievalResult> => {
  const resolved = resolveDependencies(dependencies);
  const startedAt = resolved.now();
  const query = input.query?.trim();
  if (!query) {
    return {
      chunks: [],
      citations: [],
      latencyMs: resolved.now() - startedAt,
      lowConfidence: true,
    };
  }

  const topK = Math.max(1, input.topK ?? DEFAULT_TOP_K);
  const candidateTopK = Math.max(DEFAULT_RERANK_CANDIDATE_TOP_K, topK);
  const model = input.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  const { collection } = ensureQdrantConfig(resolved.getEnv);

  const embedding = await getEmbedding(query, model, resolved);
  const points = await searchQdrant(collection, {
    vector: embedding,
    limit: candidateTopK,
    with_payload: true,
    with_vector: false,
    filter: buildFilter(input.filters),
  }, resolved);

  const candidates = points.map(normalizeChunk).filter(Boolean) as RetrievedChunk[];
  let chunks = candidates.slice(0, topK);
  const shouldRerank = !input.disableRerank && candidates.length > 1;
  if (shouldRerank) {
    try {
      chunks = await resolved.rerankChunks({
        query,
        candidates,
        finalTopK: topK,
        requestId: input.requestId,
        conversationId: input.conversationId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown reranker error";
      chunks = candidates.slice(0, topK);
      resolved.logInfo(
        "rag.rerank.fallback",
        {
          requestId: input.requestId ?? null,
          conversationId: input.conversationId ?? null
        },
        {
          candidate_count: candidates.length,
          selected_count: chunks.length,
          model: null,
          fallback_used: true,
          error: message
        }
      );
    }
  }
  const citations = buildCitations(chunks);
  const latencyMs = resolved.now() - startedAt;
  const lowConfidence = inferLowConfidence(chunks);
  resolved.recordRetrievalLatency(latencyMs);

  resolved.logInfo(
    "rag.retrieve.complete",
    {
      requestId: input.requestId ?? null,
      conversationId: input.conversationId ?? null
    },
    {
      latency_ms: latencyMs,
      raw_point_count: points.length,
      candidate_count: candidates.length,
      result_count: chunks.length,
      dropped_point_count: Math.max(0, points.length - candidates.length),
      low_confidence: lowConfidence
    }
  );

  return {
    chunks,
    citations,
    latencyMs,
    lowConfidence,
  };
};
