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

export type ReasoningStage =
  | "request_received"
  | "retrieval_started"
  | "retrieval_completed"
  | "prompt_built"
  | "model_generation_started"
  | "final_synthesis_completed";

export type ReasoningTraceItem = {
  step: string;
  detail?: string;
  stage: ReasoningStage | string;
  ts: string;
};

export type ChatMessage = {
  role: ChatRole;
  content: string;
  citations?: ChatCitation[];
  lowConfidence?: boolean;
  reasoningTrace?: ReasoningTraceItem[];
};
