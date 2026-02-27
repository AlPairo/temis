import type { RetrievalFilters, RetrievalResult } from "../rag/types.js";

export type ChatRole = "system" | "user" | "assistant";
export type QueryType = "normal" | "analysis";

export interface ChatCompletionMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOrchestratorInput {
  conversationId: string;
  sessionId?: string;
  userText: string;
  analysisEnabled?: boolean;
  userId?: string | null;
  retrievalFilters?: RetrievalFilters;
  retrievalTopK?: number;
  model?: string;
  requestId?: string;
}

export interface PromptBuildInput {
  history: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>;
  retrieval: RetrievalResult;
  userText: string;
  queryType?: QueryType;
}

export interface PromptBuildOutput {
  messages: ChatCompletionMessage[];
  systemPrompt: string;
}

export interface StreamTokenEvent {
  type: "token";
  token: string;
}

export interface StreamCompleteEvent {
  type: "complete";
  messageId: string;
  content: string;
  citations?: RetrievalResult["citations"];
  lowConfidence?: RetrievalResult["lowConfidence"];
}

export interface StreamErrorEvent {
  type: "error";
  safeMessage: string;
}

export type ChatStreamEvent = StreamTokenEvent | StreamCompleteEvent | StreamErrorEvent;

export interface OpenAIStreamRequest {
  model: string;
  messages: ChatCompletionMessage[];
}

export interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface OpenAIStreamTokenChunk {
  type: "token";
  token: string;
}

export interface OpenAIStreamUsageChunk {
  type: "usage";
  usage: OpenAIUsage;
}

export type OpenAIStreamChunk = OpenAIStreamTokenChunk | OpenAIStreamUsageChunk;

export interface OrchestratorDependencies {
  chatRepository: {
    appendMessage(input: {
      conversationId: string;
      userId?: string | null;
      role: "system" | "user" | "assistant" | "tool";
      content: string;
    }): Promise<{ id: string }>;
    getConversationMessages(conversationId: string): Promise<
      Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>
    >;
    appendRetrievalEvent(input: {
      conversationId: string;
      messageId?: string | null;
      userId?: string | null;
      query: string;
      queryType: QueryType;
      results: unknown;
    }): Promise<{ id: number }>;
  };
  auditRepository: {
    appendEvent(input: {
      conversationId?: string | null;
      userId?: string | null;
      eventType: string;
      payload: unknown;
    }): Promise<{ id: number }>;
  };
  retrieve(input: {
    query: string;
    filters?: RetrievalFilters;
    topK?: number;
    disableRerank?: boolean;
    requestId?: string;
    conversationId?: string;
  }): Promise<RetrievalResult>;
  streamOpenAI(request: OpenAIStreamRequest): AsyncIterable<string | OpenAIStreamChunk>;
  buildPrompt(input: PromptBuildInput): PromptBuildOutput;
}
