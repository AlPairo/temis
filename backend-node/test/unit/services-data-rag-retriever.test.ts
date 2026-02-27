import { describe, expect, it, vi } from "vitest";
import type { RetrieverDependencies } from "../../src/modules/rag/retriever.js";
import { RetrieverHealthError, retrieve } from "../../src/modules/rag/retriever.js";
import type { RetrievedChunk } from "../../src/modules/rag/types.js";

const makeNowSequence = (...values: number[]) => {
  const queue = [...values];
  return vi.fn(() => queue.shift() ?? values[values.length - 1] ?? 0);
};

const makeDeps = (overrides?: Partial<RetrieverDependencies>) => {
  const embeddingsCreate = vi.fn().mockResolvedValue({
    data: [{ embedding: [0.1, 0.2, 0.3] }]
  });
  const qdrantSearch = vi.fn().mockResolvedValue([]);
  const rerankChunks = vi.fn(async (input: { candidates: RetrievedChunk[]; finalTopK: number }) =>
    input.candidates.slice(0, input.finalTopK)
  );
  const deps: RetrieverDependencies & {
    _embeddingsCreate: typeof embeddingsCreate;
    _qdrantSearch: typeof qdrantSearch;
    _rerankChunks: typeof rerankChunks;
  } = {
    now: makeNowSequence(100, 120),
    getEnv: (name) =>
      ({
        OPENAI_API_KEY: "key",
        QDRANT_COLLECTION: "laws"
      })[name],
    getOpenAIClient: vi.fn().mockResolvedValue({
      client: {
        embeddings: {
          create: embeddingsCreate
        }
      }
    }),
    getQdrantClient: vi.fn().mockResolvedValue({
      client: {
        search: qdrantSearch
      }
    }),
    rerankChunks,
    recordRetrievalLatency: vi.fn(),
    logInfo: vi.fn(),
    ...overrides,
    _embeddingsCreate: embeddingsCreate,
    _qdrantSearch: qdrantSearch,
    _rerankChunks: rerankChunks
  };

  return deps;
};

describe("modules/rag/retriever", () => {
  it("returns empty low-confidence result for blank queries without external calls", async () => {
    const deps = makeDeps({ now: makeNowSequence(100, 101) });

    const result = await retrieve({ query: "   " }, deps);

    expect(result).toEqual({
      chunks: [],
      citations: [],
      latencyMs: 1,
      lowConfidence: true
    });
    expect(deps.getOpenAIClient).not.toHaveBeenCalled();
    expect(deps.getQdrantClient).not.toHaveBeenCalled();
    expect(deps._rerankChunks).not.toHaveBeenCalled();
    expect(deps.recordRetrievalLatency).not.toHaveBeenCalled();
  });

  it("throws RetrieverHealthError when QDRANT_COLLECTION is missing", async () => {
    const deps = makeDeps({
      getEnv: (name) => (name === "OPENAI_API_KEY" ? "key" : undefined)
    });

    await expect(retrieve({ query: "hola" }, deps)).rejects.toThrowError(RetrieverHealthError);
    await expect(retrieve({ query: "hola" }, deps)).rejects.toThrow("QDRANT_COLLECTION is missing");
  });

  it("throws RetrieverHealthError when OPENAI_API_KEY is missing", async () => {
    const deps = makeDeps({
      getEnv: (name) => (name === "QDRANT_COLLECTION" ? "laws" : undefined)
    });

    await expect(retrieve({ query: "hola" }, deps)).rejects.toThrowError(RetrieverHealthError);
    await expect(retrieve({ query: "hola" }, deps)).rejects.toThrow("OPENAI_API_KEY is missing");
  });

  it("throws when embeddings response does not include a vector", async () => {
    const deps = makeDeps();
    deps._embeddingsCreate.mockResolvedValue({ data: [{ embedding: [] }] });

    await expect(retrieve({ query: "hola" }, deps)).rejects.toThrow("Embedding response missing vector payload.");
  });

  it("wraps qdrant errors as RetrieverHealthError", async () => {
    const deps = makeDeps();
    deps._qdrantSearch.mockRejectedValue(new Error("connection error"));

    await expect(retrieve({ query: "hola" }, deps)).rejects.toThrowError(RetrieverHealthError);
    await expect(retrieve({ query: "hola" }, deps)).rejects.toThrow("Qdrant health error: connection error");
  });

  it("builds filters, clamps topK to at least 1, normalizes chunks, and records metrics/logs", async () => {
    const deps = makeDeps({ now: makeNowSequence(1000, 1037) });
    deps._qdrantSearch.mockResolvedValue([
      {
        id: 7,
        score: 0.9,
        payload: {
          doc_id: "doc-1",
          text: "Chunk A",
          jurisdiction: "AR",
          source: "gazette"
        }
      },
      {
        id: "c-2",
        score: 0.1,
        payload: {
          doc_id: "doc-2",
          chunk_id: "chunk-2",
          content: "Chunk B"
        }
      },
      {
        id: "bad-1",
        score: 0.7,
        payload: {
          doc_id: "doc-3"
        }
      }
    ]);

    const result = await retrieve(
      {
        query: "  tax filing  ",
        topK: 0,
        filters: {
          jurisdiction: "AR",
          effective_date: "2024-01-01",
          source: "gazette"
        },
        requestId: "req-1",
        conversationId: "conv-1"
      },
      deps
    );

    expect(deps._embeddingsCreate).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: "tax filing"
    });
    expect(deps._qdrantSearch).toHaveBeenCalledWith(
      "laws",
      expect.objectContaining({
        limit: 20,
        with_payload: true,
        with_vector: false,
        vector: [0.1, 0.2, 0.3],
        filter: {
          must: [
            { key: "jurisdiction", match: { value: "AR" } },
            { key: "effective_date", match: { value: "2024-01-01" } },
            { key: "source", match: { value: "gazette" } }
          ]
        }
      })
    );
    expect(deps._rerankChunks).toHaveBeenCalledWith({
      query: "tax filing",
      candidates: expect.any(Array),
      finalTopK: 1,
      requestId: "req-1",
      conversationId: "conv-1"
    });
    expect(result.chunks).toEqual([
      expect.objectContaining({
        doc_id: "doc-1",
        chunk_id: "7",
        text: "Chunk A",
        score: 0.9
      })
    ]);
    expect(result.citations).toHaveLength(1);
    expect(result.latencyMs).toBe(37);
    expect(result.lowConfidence).toBe(false);
    expect(deps.recordRetrievalLatency).toHaveBeenCalledWith(37);
    expect(deps.logInfo).toHaveBeenCalledWith(
      "rag.retrieve.complete",
      { requestId: "req-1", conversationId: "conv-1" },
      expect.objectContaining({
        latency_ms: 37,
        result_count: 1,
        low_confidence: false
      })
    );
  });

  it("supports qdrant payloads that return a root points array", async () => {
    const deps = makeDeps();
    deps._qdrantSearch.mockResolvedValue([
      {
        id: "p-1",
        score: 0.2,
        payload: {
          doc_id: "doc-1",
          chunk: "Root array"
        }
      }
    ]);

    const result = await retrieve({ query: "root" }, deps);

    expect(result.chunks[0]?.text).toBe("Root array");
    expect(result.lowConfidence).toBe(true);
    expect(deps._rerankChunks).not.toHaveBeenCalled();
  });

  it("supports qdrant payloads that return result as an array", async () => {
    const deps = makeDeps();
    deps._qdrantSearch.mockResolvedValue([
      {
        id: "p-2",
        score: 0.4,
        payload: {
          doc_id: "doc-2",
          text: "Direct result array"
        }
      }
    ]);

    const result = await retrieve({ query: "array", embeddingModel: "custom-model" }, deps);

    expect(deps._embeddingsCreate).toHaveBeenCalledWith({
      model: "custom-model",
      input: "array"
    });
    expect(result.chunks[0]?.text).toBe("Direct result array");
    expect(result.lowConfidence).toBe(false);
  });

  it("maps legacy payload keys used by the python service", async () => {
    const deps = makeDeps();
    deps._qdrantSearch.mockResolvedValue([
      {
        id: "pt-legacy-1",
        score: 0.81,
        payload: {
          id_documento: "EXP-1234",
          texto: "Texto de jurisprudencia",
          materia: "civil"
        }
      }
    ]);

    const result = await retrieve({ query: "jurisprudencia" }, deps);

    expect(result.chunks).toEqual([
      expect.objectContaining({
        doc_id: "EXP-1234",
        chunk_id: "pt-legacy-1",
        text: "Texto de jurisprudencia",
        score: 0.81
      })
    ]);
    expect(result.citations).toHaveLength(1);
  });

  it("uses reranked order for final chunks and citations", async () => {
    const deps = makeDeps();
    deps._qdrantSearch.mockResolvedValue([
      { id: "p1", score: 0.92, payload: { doc_id: "doc-1", text: "Chunk 1" } },
      { id: "p2", score: 0.88, payload: { doc_id: "doc-2", text: "Chunk 2" } },
      { id: "p3", score: 0.81, payload: { doc_id: "doc-3", text: "Chunk 3" } }
    ]);
    deps._rerankChunks.mockImplementationOnce(async (input: any) => [
      input.candidates[2],
      input.candidates[0]
    ]);

    const result = await retrieve({ query: "ranking", topK: 2 }, deps);

    expect(result.chunks.map((chunk) => chunk.doc_id)).toEqual(["doc-3", "doc-1"]);
    expect(result.citations.map((citation) => citation.doc_id)).toEqual(["doc-3", "doc-1"]);
  });

  it("falls back to vector order when reranker fails", async () => {
    const deps = makeDeps();
    deps._qdrantSearch.mockResolvedValue([
      { id: "p1", score: 0.92, payload: { doc_id: "doc-1", text: "Chunk 1" } },
      { id: "p2", score: 0.88, payload: { doc_id: "doc-2", text: "Chunk 2" } },
      { id: "p3", score: 0.81, payload: { doc_id: "doc-3", text: "Chunk 3" } }
    ]);
    deps._rerankChunks.mockRejectedValueOnce(new Error("rerank timeout"));

    const result = await retrieve(
      { query: "ranking", topK: 2, requestId: "req-fallback", conversationId: "conv-fallback" },
      deps
    );

    expect(result.chunks.map((chunk) => chunk.doc_id)).toEqual(["doc-1", "doc-2"]);
    expect(deps.logInfo).toHaveBeenCalledWith(
      "rag.rerank.fallback",
      { requestId: "req-fallback", conversationId: "conv-fallback" },
      expect.objectContaining({
        candidate_count: 3,
        selected_count: 2,
        fallback_used: true,
        error: "rerank timeout"
      })
    );
  });

  it("skips reranking when disableRerank is enabled", async () => {
    const deps = makeDeps();
    deps._qdrantSearch.mockResolvedValue([
      { id: "p1", score: 0.92, payload: { doc_id: "doc-1", text: "Chunk 1" } },
      { id: "p2", score: 0.88, payload: { doc_id: "doc-2", text: "Chunk 2" } },
      { id: "p3", score: 0.81, payload: { doc_id: "doc-3", text: "Chunk 3" } }
    ]);
    deps._rerankChunks.mockImplementationOnce(async () => {
      throw new Error("should-not-run");
    });

    const result = await retrieve({ query: "ranking", topK: 2, disableRerank: true }, deps);

    expect(deps._rerankChunks).not.toHaveBeenCalled();
    expect(result.chunks.map((chunk) => chunk.doc_id)).toEqual(["doc-1", "doc-2"]);
    expect(result.citations.map((citation) => citation.doc_id)).toEqual(["doc-1", "doc-2"]);
  });
});
