import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSessionDetail, makeSessionSummary } from "../test/factories";

const sessionServiceMocks = vi.hoisted(() => ({
  http: vi.fn(),
  useMock: vi.fn(),
  mockSessions: [
    {
      session_id: "mock-a",
      title: "Mock A",
      turns: 1,
      last_message: "hola",
      is_deleted: false,
      deleted_at: null,
      owner_user_id: "u-test",
      can_rename: true,
      can_delete: true
    }
  ],
  mockSessionDetails: vi.fn((id: string) => ({
    session_id: id,
    title: `Mock ${id}`,
    is_deleted: false,
    deleted_at: null,
    owner_user_id: "u-test",
    can_rename: true,
    can_delete: true,
    history: []
  }))
}));

vi.mock("./http", () => ({
  http: sessionServiceMocks.http
}));

vi.mock("./mocks", () => ({
  useMock: sessionServiceMocks.useMock,
  mockSessions: sessionServiceMocks.mockSessions,
  mockSessionDetails: sessionServiceMocks.mockSessionDetails
}));

import { deleteSession, getSession, listSessions, renameSession } from "./sessions";

describe("services/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionServiceMocks.useMock.mockReturnValue(false);
  });

  it("builds the sessions list query string from filters", async () => {
    const resultRows = [makeSessionSummary({ session_id: "s-1" })];
    sessionServiceMocks.http.mockResolvedValue(resultRows);

    await expect(listSessions({ includeDeleted: true, scope: "visible" })).resolves.toBe(resultRows);

    expect(sessionServiceMocks.http).toHaveBeenCalledWith("/sessions?include_deleted=1&scope=visible");
  });

  it("fetches session detail with include_deleted query param", async () => {
    const detail = makeSessionDetail({ session_id: "s-99" });
    sessionServiceMocks.http.mockResolvedValue(detail);

    await expect(getSession("s-99", { includeDeleted: true })).resolves.toBe(detail);

    expect(sessionServiceMocks.http).toHaveBeenCalledWith("/sessions/s-99?include_deleted=1");
  });

  it("sends rename and delete requests with the expected methods and payloads", async () => {
    sessionServiceMocks.http
      .mockResolvedValueOnce({ session_id: "s-1", title: "Nuevo", updated: true })
      .mockResolvedValueOnce({ detail: "ok", deleted: true });

    await renameSession("s-1", "Nuevo");
    await deleteSession("s-1");

    expect(sessionServiceMocks.http).toHaveBeenNthCalledWith(1, "/sessions/s-1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Nuevo" })
    });
    expect(sessionServiceMocks.http).toHaveBeenNthCalledWith(2, "/sessions/s-1", {
      method: "DELETE"
    });
  });

  it("returns mock session data without calling http when mock mode is enabled", async () => {
    sessionServiceMocks.useMock.mockReturnValue(true);

    const listed = await listSessions();
    const detail = await getSession("mock-a");
    const renamed = await renameSession("mock-a", "Titulo");
    const deleted = await deleteSession("mock-a");

    expect(listed).toEqual(sessionServiceMocks.mockSessions);
    expect(detail.session_id).toBe("mock-a");
    expect(renamed).toEqual({ session_id: "mock-a", title: "Titulo", updated: true });
    expect(deleted.deleted).toBe(true);
    expect(deleted.detail).toContain("mock-a");
    expect(sessionServiceMocks.http).not.toHaveBeenCalled();
  });
});
