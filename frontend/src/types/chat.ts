export type ChatRole = "user" | "assistant";

export type ChatCitation = {
  id: string;
  doc_id?: string;
  chunk_id?: string;
  source?: string;
  jurisdiction?: string;
  effective_date?: string;
  score?: number;
};

export type ChatMessage = {
  role: ChatRole;
  content: string;
  citations?: ChatCitation[];
  lowConfidence?: boolean;
};
