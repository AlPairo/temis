import { describe, expect, it, vi } from "vitest";
import { RerankerError, rerankChunks } from "../../src/modules/rag/reranker.js";
import type { RetrievedChunk } from "../../src/modules/rag/types.js";

const makeCandidates = (): RetrievedChunk[] => [
  { doc_id: "d1", chunk_id: "c1", text: "First", score: 0.9, metadata: {} },
  { doc_id: "d2", chunk_id: "c2", text: "Second", score: 0.8, metadata: {} },
  { doc_id: "d3", chunk_id: "c3", text: "Third", score: 0.7, metadata: {} }
];

describe("modules/rag/reranker", () => {
  it("reorders by returned candidate ids and fills missing slots from vector order", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              selected_ids: ["cand_3", "cand_999"]
            })
          }
        }
      ]
    });
    const logInfo = vi.fn();

    const result = await rerankChunks(
      {
        query: "contract breach",
        candidates: makeCandidates(),
        finalTopK: 2,
        requestId: "req-1",
        conversationId: "conv-1"
      },
      {
        now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(120),
        getOpenAIClient: vi.fn().mockResolvedValue({
          client: {
            chat: { completions: { create } }
          }
        } as any),
        logInfo
      }
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0,
        response_format: { type: "json_object" }
      })
    );
    expect(result.map((chunk) => chunk.doc_id)).toEqual(["d3", "d1"]);
    expect(logInfo).toHaveBeenCalledWith(
      "rag.rerank.complete",
      { requestId: "req-1", conversationId: "conv-1" },
      expect.objectContaining({
        candidate_count: 3,
        selected_count: 2,
        fallback_used: false
      })
    );
  });

  it("throws RerankerError on invalid JSON", async () => {
    await expect(
      rerankChunks(
        {
          query: "contract breach",
          candidates: makeCandidates(),
          finalTopK: 2
        },
        {
          getOpenAIClient: vi.fn().mockResolvedValue({
            client: {
              chat: {
                completions: {
                  create: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: "{not-json" } }]
                  })
                }
              }
            }
          } as any),
          logInfo: vi.fn()
        }
      )
    ).rejects.toThrowError(RerankerError);
  });
});

