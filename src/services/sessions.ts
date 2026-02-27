import { http } from "./http";
import { mockSessions, mockSessionDetails, useMock } from "./mocks";
import type { ChatMessage } from "../types/chat";
import { formatMockDeleteSessionDetail } from "../text";

export type SessionSummary = {
  session_id: string;
  title: string | null;
  turns: number;
  last_message: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  owner_user_id: string | null;
  can_rename: boolean;
  can_delete: boolean;
};

export type SessionDetail = {
  session_id: string;
  title: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  owner_user_id: string | null;
  can_rename: boolean;
  can_delete: boolean;
  history: ChatMessage[];
};

export type SessionListParams = {
  includeDeleted?: boolean;
  scope?: "mine" | "visible";
};

export async function listSessions(params?: SessionListParams): Promise<SessionSummary[]> {
  if (useMock()) return mockSessions;
  const query = new URLSearchParams();
  if (params?.includeDeleted) {
    query.set("include_deleted", "1");
  }
  if (params?.scope) {
    query.set("scope", params.scope);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return http<SessionSummary[]>(`/sessions${suffix}`);
}

export async function getSession(id: string, params?: { includeDeleted?: boolean }): Promise<SessionDetail> {
  if (useMock()) return mockSessionDetails(id);
  const query = new URLSearchParams();
  if (params?.includeDeleted) {
    query.set("include_deleted", "1");
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return http<SessionDetail>(`/sessions/${id}${suffix}`);
}

export async function renameSession(
  id: string,
  title: string
): Promise<{ session_id: string; title: string; updated: boolean }> {
  if (useMock()) {
    return { session_id: id, title, updated: true };
  }
  return http(`/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title })
  });
}

export async function deleteSession(id: string): Promise<{ detail: string; deleted: boolean }> {
  if (useMock()) {
    return { detail: formatMockDeleteSessionDetail(id), deleted: true };
  }
  return http(`/sessions/${id}`, {
    method: "DELETE"
  });
}
