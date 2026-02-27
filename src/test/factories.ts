import type { ChatMessage } from "../types/chat";
import type { SessionDetail, SessionSummary } from "../services/sessions";

let nextId = 1;

const takeId = () => nextId++;

export function makeChatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    role: "user",
    content: `message-${takeId()}`,
    ...overrides
  };
}

export function makeSessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  const id = overrides.session_id ?? `session-${takeId()}`;
  return {
    session_id: id,
    title: `Title ${id}`,
    turns: 1,
    last_message: `Last ${id}`,
    is_deleted: false,
    deleted_at: null,
    owner_user_id: "u-test",
    can_rename: true,
    can_delete: true,
    ...overrides
  };
}

export function makeSessionDetail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  const id = overrides.session_id ?? `session-${takeId()}`;
  return {
    session_id: id,
    title: `Title ${id}`,
    is_deleted: false,
    deleted_at: null,
    owner_user_id: "u-test",
    can_rename: true,
    can_delete: true,
    history: [makeChatMessage({ role: "user", content: "hola" })],
    ...overrides
  };
}
