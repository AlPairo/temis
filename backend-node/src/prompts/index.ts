import type { RetrievalResult, RetrievedChunk } from "../modules/rag/types.js";

export const CHAT_SYSTEM_GUARDRAILS = [
  "Eres un asistente legal que responde preguntas sobre jurisprudencia uruguaya.",
  "Usa los fragmentos proporcionados entre corchetes para fundamentar tu respuesta.",
  "Si no encuentras información suficiente, reconoce la limitación.",
  "Incluye citas de la fuente (id_documento y materia) en tu respuesta."
].join(" ");

export const SESSION_TITLE_SYSTEM_PROMPT = [
  "Eres un asistente que resume conversaciones jurídicas en español de forma concisa.",
  "Resume la siguiente conversación en pocas frases"
].join(" ");

export const buildChatRetrievalContextBlock = (retrieval: RetrievalResult): string => {
  const citations = retrieval.citations
    .map((citation) => {
      const source = citation.source ?? "unknown-source";
      return `[${citation.id}] ${citation.doc_id}/${citation.chunk_id} source=${source} score=${citation.score.toFixed(3)}`;
    })
    .join("\n");

  const chunks = retrieval.chunks
    .map((chunk, index) => `[chunk_${index + 1}] ${chunk.text}`)
    .join("\n\n");

  return [
    "Retrieved legal context (may be empty):",
    citations.length > 0 ? citations : "(none)",
    "",
    "Retrieved chunks:",
    chunks.length > 0 ? chunks : "(none)",
    "",
    `Low confidence retrieval: ${retrieval.lowConfidence ? "yes" : "no"}`
  ].join("\n");
};

export type RerankerPromptCandidate = {
  tempId: string;
  chunk: RetrievedChunk;
};

export const RAG_RERANKER_SYSTEM_PROMPT = [
  "You are a legal retrieval reranker.",
  "Your task is to select the most relevant retrieved chunks for answering the user's legal research question.",
  "Return only valid JSON with a `selected_ids` array containing candidate IDs in best-to-worst order.",
  "Use only candidate IDs that were provided.",
  "Do not include any explanation or extra keys."
].join(" ");

export const buildRagRerankerUserPrompt = (input: {
  query: string;
  finalTopK: number;
  candidates: RerankerPromptCandidate[];
}): string => {
  const candidateLines = input.candidates.map(({ tempId, chunk }, index) => {
    const source = typeof chunk.metadata.source === "string" ? chunk.metadata.source : "unknown-source";
    const jurisdiction =
      typeof chunk.metadata.jurisdiction === "string" ? chunk.metadata.jurisdiction : "unknown";
    const effectiveDate =
      typeof chunk.metadata.effective_date === "string" ? chunk.metadata.effective_date : "unknown";

    return [
      `Candidate ${index + 1} (${tempId})`,
      `doc_id: ${chunk.doc_id}`,
      `chunk_id: ${chunk.chunk_id}`,
      `vector_score: ${chunk.score.toFixed(6)}`,
      `source: ${source}`,
      `jurisdiction: ${jurisdiction}`,
      `effective_date: ${effectiveDate}`,
      "text:",
      chunk.text
    ].join("\n");
  });

  return [
    "User query:",
    input.query,
    "",
    `Select the best ${input.finalTopK} candidates for answering the query.`,
    "Return JSON exactly like:",
    '{"selected_ids":["cand_1","cand_2"]}',
    "",
    "Candidates:",
    ...candidateLines
  ].join("\n");
};
