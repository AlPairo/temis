import type { PromptBuildInput, PromptBuildOutput } from "./types.js";
import { buildChatRetrievalContextBlock, CHAT_SYSTEM_GUARDRAILS } from "../../prompts/index.js";

const MAX_HISTORY_MESSAGES = 16;

const toHistoryMessages = (history: PromptBuildInput["history"]): PromptBuildOutput["messages"] => {
  return history
    .filter((message) => message.role === "user" || message.role === "assistant" || message.role === "system")
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => {
      if (message.role === "system") {
        return { role: "system", content: message.content } as const;
      }
      if (message.role === "user") {
        return { role: "user", content: message.content } as const;
      }
      return { role: "assistant", content: message.content } as const;
    });
};

export const buildPrompt = (input: PromptBuildInput): PromptBuildOutput => {
  const retrievalBlock = buildChatRetrievalContextBlock(input.retrieval);
  const historyMessages = toHistoryMessages(input.history);

  return {
    systemPrompt: CHAT_SYSTEM_GUARDRAILS,
    messages: [
      { role: "system", content: CHAT_SYSTEM_GUARDRAILS },
      ...historyMessages,
      { role: "system", content: retrievalBlock },
      { role: "user", content: input.userText }
    ]
  };
};
