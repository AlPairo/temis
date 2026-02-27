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

const buildAnalysisAnswerContract = (input: PromptBuildInput): string => {
  const availableCitations =
    input.retrieval.citations.length > 0
      ? input.retrieval.citations
          .map((citation) => `- [${citation.id}] ${citation.doc_id}/${citation.chunk_id}`)
          .join("\n")
      : "- (none)";

  return [
    "Mandatory response format for analysis mode:",
    "Language rule: respond in the same language as the user's message.",
    "1) Executive summary: 2-4 sentences focused on the user's question.",
    "2) Case-by-case analysis: one bullet per retrieved citation using this exact shape:",
    "   - [CITATION_ID] Rule: ... | Facts: ... | Application: ...",
    "3) Practical conclusion tied to the cited cases.",
    "Citation rules:",
    "- Use only citation IDs provided in the retrieval block.",
    "- Do not invent cases, statutes, facts, or dates.",
    "- If evidence is insufficient, say it explicitly.",
    "Available citation IDs:",
    availableCitations
  ].join("\n");
};

export const buildPrompt = (input: PromptBuildInput): PromptBuildOutput => {
  const retrievalBlock = buildChatRetrievalContextBlock(input.retrieval);
  const historyMessages = toHistoryMessages(input.history);
  const analysisModeContract = input.queryType === "analysis" ? buildAnalysisAnswerContract(input) : null;

  return {
    systemPrompt: CHAT_SYSTEM_GUARDRAILS,
    messages: [
      { role: "system", content: CHAT_SYSTEM_GUARDRAILS },
      ...historyMessages,
      { role: "system", content: retrievalBlock },
      ...(analysisModeContract ? [{ role: "system" as const, content: analysisModeContract }] : []),
      { role: "user", content: input.userText }
    ]
  };
};
