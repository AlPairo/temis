import type { SessionDetail, SessionSummary } from "./sessions";
import type { ChatMessage } from "../types/chat";
import { FRONTEND_TEXT } from "../text";

export const mockSessions: SessionSummary[] = FRONTEND_TEXT.mocks.sessions.map((session) => ({
  ...session,
  is_deleted: false,
  deleted_at: null,
  owner_user_id: "u-demo",
  can_rename: true,
  can_delete: true
}));

const mockHistories: Record<string, ChatMessage[]> = Object.fromEntries(
  Object.entries(FRONTEND_TEXT.mocks.histories).map(([id, history]) => [
    id,
    [
      { role: "user", content: history.user },
      ...(history.assistant ? [{ role: "assistant" as const, content: history.assistant }] : [])
    ]
  ])
);

export function mockSessionDetails(id: string): SessionDetail {
  return {
    session_id: id,
    title: mockSessions.find((session) => session.session_id === id)?.title ?? null,
    is_deleted: false,
    deleted_at: null,
    owner_user_id: "u-demo",
    can_rename: true,
    can_delete: true,
    history: mockHistories[id] ?? []
  };
}

export function useMock(): boolean {
  return String(import.meta.env.VITE_USE_MOCK ?? "false").toLowerCase() === "true";
}
