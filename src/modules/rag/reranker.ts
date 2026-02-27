import { z } from "zod";
import { getOpenAIClient } from "../../clients/openai.js";
import { config } from "../../config/index.js";
import { logInfo } from "../../observability/logger.js";
import {
  RAG_RERANKER_SYSTEM_PROMPT,
  buildRagRerankerUserPrompt,
  type RerankerPromptCandidate
} from "../../prompts/index.js";
import type { RetrievedChunk } from "./types.js";

const rerankResponseSchema = z.object({
  selected_ids: z.array(z.string()).default([])
});

export interface RerankInput {
  query: string;
  candidates: RetrievedChunk[];
  finalTopK: number;
  requestId?: string;
  conversationId?: string;
}

export interface RerankDependencies {
  now?: () => number;
  getOpenAIClient?: typeof getOpenAIClient;
  logInfo?: typeof logInfo;
}

export class RerankerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RerankerError";
  }
}

const resolveDependencies = (dependencies?: RerankDependencies) => ({
  now: dependencies?.now ?? Date.now,
  getOpenAIClient: dependencies?.getOpenAIClient ?? getOpenAIClient,
  logInfo: dependencies?.logInfo ?? logInfo
});

const normalizeCompletionContent = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object") {
          const typed = part as { text?: unknown };
          if (typeof typed.text === "string") {
            return typed.text;
          }
        }
        return "";
      })
      .join("");
  }

  return "";
};

const dedupe = <T>(values: T[]): T[] => {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
};

export const rerankChunks = async (
  input: RerankInput,
  dependencies?: RerankDependencies
): Promise<RetrievedChunk[]> => {
  const resolved = resolveDependencies(dependencies);
  const startedAt = resolved.now();

  if (input.candidates.length <= 1) {
    return input.candidates.slice(0, Math.max(1, input.finalTopK));
  }

  const finalTopK = Math.max(1, input.finalTopK);
  const promptCandidates: RerankerPromptCandidate[] = input.candidates.map((chunk, index) => ({
    tempId: `cand_${index + 1}`,
    chunk
  }));
  const byTempId = new Map(promptCandidates.map((candidate) => [candidate.tempId, candidate.chunk]));

  const { client } = await resolved.getOpenAIClient();
  const response = await client.chat.completions.create({
    model: config.OPENAI_RERANK_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: RAG_RERANKER_SYSTEM_PROMPT },
      {
        role: "user",
        content: buildRagRerankerUserPrompt({
          query: input.query,
          finalTopK,
          candidates: promptCandidates
        })
      }
    ]
  });

  const rawContent = response.choices?.[0]?.message?.content;
  const content = normalizeCompletionContent(rawContent);
  if (!content || content.trim().length === 0) {
    throw new RerankerError("Reranker returned empty content.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid json";
    throw new RerankerError(`Reranker returned invalid JSON: ${message}`);
  }

  const parsed = rerankResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new RerankerError("Reranker JSON schema validation failed.");
  }

  const selected = dedupe(parsed.data.selected_ids)
    .map((id) => byTempId.get(id))
    .filter(Boolean) as RetrievedChunk[];

  const filled = dedupe([...selected, ...input.candidates]).slice(0, finalTopK);
  const latencyMs = resolved.now() - startedAt;
  resolved.logInfo(
    "rag.rerank.complete",
    {
      requestId: input.requestId ?? null,
      conversationId: input.conversationId ?? null
    },
    {
      candidate_count: input.candidates.length,
      selected_count: filled.length,
      latency_ms: latencyMs,
      model: config.OPENAI_RERANK_MODEL,
      fallback_used: false
    }
  );

  return filled;
};

