import type { Citation, RetrievedChunk } from "./types.js";

const sanitizeIdPart = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_-]/g, "_");

export const buildCitations = (chunks: RetrievedChunk[]): Citation[] => {
  const seen = new Map<string, number>();

  return chunks.map((chunk) => {
    const baseId = `${sanitizeIdPart(chunk.doc_id)}:${sanitizeIdPart(chunk.chunk_id)}`;
    const currentCount = seen.get(baseId) ?? 0;
    seen.set(baseId, currentCount + 1);
    const suffix = currentCount === 0 ? "" : `:${currentCount + 1}`;

    return {
      id: `${baseId}${suffix}`,
      doc_id: chunk.doc_id,
      chunk_id: chunk.chunk_id,
      source:
        typeof chunk.metadata.source === "string"
          ? chunk.metadata.source
          : undefined,
      jurisdiction:
        typeof chunk.metadata.jurisdiction === "string"
          ? chunk.metadata.jurisdiction
          : undefined,
      effective_date:
        typeof chunk.metadata.effective_date === "string"
          ? chunk.metadata.effective_date
          : undefined,
      score: chunk.score,
    };
  });
};
