import { beforeEach, describe, expect, it, vi } from "vitest";

const pgMocks = vi.hoisted(() => ({
  getPostgresClient: vi.fn(),
  poolQuery: vi.fn()
}));

vi.mock("../../src/clients/postgres.js", () => ({
  getPostgresClient: pgMocks.getPostgresClient
}));

import { ChatRepository } from "../../src/modules/chat/chat-repository.js";

describe("modules/chat/chat-repository", () => {
  const repo = new ChatRepository();

  beforeEach(() => {
    pgMocks.poolQuery.mockReset();
    pgMocks.getPostgresClient.mockReset();
    pgMocks.getPostgresClient.mockResolvedValue({ pool: { query: pgMocks.poolQuery } });
  });

  it("creates conversations and maps row fields", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    pgMocks.poolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "conv-1",
          external_id: null,
          user_id: "u1",
          title: "My title",
          title_manual: true,
          deleted_at: null,
          created_at: now,
          updated_at: null
        }
      ]
    });

    await expect(repo.createConversation({ userId: "u1", title: "My title" })).resolves.toEqual({
      id: "conv-1",
      externalId: null,
      userId: "u1",
      title: "My title",
      titleManual: true,
      deletedAt: null,
      createdAt: now,
      updatedAt: null
    });
    expect(pgMocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO conversations"), ["u1", "My title"]);
  });

  it("ensures conversation by session id via upsert and trims title", async () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    pgMocks.poolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "conv-2",
          external_id: "session-2",
          user_id: "u2",
          title: "Title",
          title_manual: false,
          deleted_at: null,
          created_at: now,
          updated_at: now
        }
      ]
    });

    const result = await repo.ensureConversationBySessionId({
      sessionId: "session-2",
      userId: "u2",
      title: "  Title  "
    });

    expect(result.externalId).toBe("session-2");
    expect(pgMocks.poolQuery.mock.calls[0]?.[1]).toEqual(["session-2", "u2", "Title"]);
  });

  it("falls back to existing conversation and throws on ownership mismatch or missing record", async () => {
    const now = new Date("2026-01-03T00:00:00.000Z");

    pgMocks.poolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "conv-3",
            external_id: "s3",
            user_id: "owner-a",
            title: null,
            title_manual: false,
            deleted_at: null,
            created_at: now,
            updated_at: null
          }
        ]
      });

    await expect(
      repo.ensureConversationBySessionId({ sessionId: "s3", userId: "owner-b" })
    ).rejects.toThrow(/ownership mismatch/i);

    pgMocks.poolQuery.mockReset();
    pgMocks.poolQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await expect(repo.ensureConversationBySessionId({ sessionId: "missing" })).rejects.toThrow(
      /Could not create or load conversation/
    );
  });

  it("appends messages and retrieval events and reads messages", async () => {
    const createdAt = new Date("2026-01-04T00:00:00.000Z");
    pgMocks.poolQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: "msg-1",
            conversation_id: "conv-1",
            user_id: "u1",
            role: "user",
            content: "hello",
            created_at: createdAt
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            conversation_id: "conv-1",
            message_id: "msg-1",
            user_id: "u1",
            query: "hello",
            query_type: "analysis",
            results: { ok: true },
            created_at: createdAt
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "msg-1",
            conversation_id: "conv-1",
            user_id: "u1",
            role: "user",
            content: "hello",
            created_at: createdAt
          }
        ]
      });

    await expect(
      repo.appendMessage({ conversationId: "conv-1", userId: "u1", role: "user", content: "hello" })
    ).resolves.toEqual({
      id: "msg-1",
      conversationId: "conv-1",
      userId: "u1",
      role: "user",
      content: "hello",
      createdAt
    });
    await expect(
      repo.appendRetrievalEvent({
        conversationId: "conv-1",
        messageId: "msg-1",
        userId: "u1",
        query: "hello",
        queryType: "analysis",
        results: { ok: true }
      })
    ).resolves.toEqual({
      id: 1,
      conversationId: "conv-1",
      messageId: "msg-1",
      userId: "u1",
      query: "hello",
      queryType: "analysis",
      results: { ok: true },
      createdAt
    });
    await expect(repo.getConversationMessages("conv-1")).resolves.toEqual([
      {
        id: "msg-1",
        conversationId: "conv-1",
        userId: "u1",
        role: "user",
        content: "hello",
        createdAt
      }
    ]);
  });

  it("lists sessions with visibility clause variants and row mapping", async () => {
    const deletedAt = new Date("2026-01-05T00:00:00.000Z");
    pgMocks.poolQuery.mockResolvedValue({
      rows: [
        {
          conversation_id: "conv-1",
          session_id: "s1",
          owner_user_id: "u1",
          title: "T",
          turns: 2,
          last_message: "last",
          deleted_at: deletedAt
        }
      ]
    });

    const includeDeletedVisible = await repo.listSessions({ includeDeleted: true, visibleUserIds: [" u1 ", "u1"] });
    expect(includeDeletedVisible).toEqual([
      {
        conversationId: "conv-1",
        sessionId: "s1",
        ownerUserId: "u1",
        title: "T",
        turns: 2,
        lastMessage: "last",
        deletedAt
      }
    ]);
    const [sql1, params1] = pgMocks.poolQuery.mock.calls[0] ?? [];
    expect(sql1).toContain("c.user_id = ANY($1::text[])");
    expect(sql1).not.toContain("c.deleted_at IS NULL");
    expect(params1).toEqual([["u1"]]);

    pgMocks.poolQuery.mockClear();
    await repo.listSessions({ visibleUserIds: [] });
    const [sql2, params2] = pgMocks.poolQuery.mock.calls[0] ?? [];
    expect(sql2).toContain("c.deleted_at IS NULL");
    expect(sql2).toContain("1 = 0");
    expect(params2).toEqual([]);

    pgMocks.poolQuery.mockClear();
    await repo.listSessions({ visibleUserIds: null });
    const [sql3] = pgMocks.poolQuery.mock.calls[0] ?? [];
    expect(sql3).toContain("c.deleted_at IS NULL");
    expect(sql3).not.toContain("ANY(");
  });

  it("gets session detail with visibility filter and returns null when not found", async () => {
    const deletedAt = new Date("2026-01-06T00:00:00.000Z");
    pgMocks.poolQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: "conv-9",
            session_id: "s9",
            owner_user_id: "u9",
            title: "Title",
            deleted_at: deletedAt
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          { id: "msg-user-1", role: "user", content: "hola", created_at: deletedAt },
          { id: "msg-assistant-1", role: "assistant", content: "respuesta", created_at: deletedAt }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            message_id: "msg-user-1",
            results: {
              citations: [{ id: "d1:c1", doc_id: "d1", chunk_id: "c1", score: 0.8 }],
              lowConfidence: false
            },
            created_at: deletedAt
          }
        ]
      });

    const detail = await repo.getSessionById("s9", { includeDeleted: true, visibleUserIds: ["u9"] });
    expect(detail).toEqual({
      conversationId: "conv-9",
      sessionId: "s9",
      ownerUserId: "u9",
      title: "Title",
      deletedAt,
      history: [
        { role: "user", content: "hola" },
        {
          role: "assistant",
          content: "respuesta",
          citations: [{ id: "d1:c1", doc_id: "d1", chunk_id: "c1", score: 0.8 }],
          lowConfidence: false
        }
      ]
    });
    expect(pgMocks.poolQuery.mock.calls[0]?.[0]).toContain("AND c.user_id = ANY($2::text[])");

    pgMocks.poolQuery.mockReset();
    pgMocks.poolQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo.getSessionById("missing")).resolves.toBeNull();
  });

  it("soft deletes sessions with and without owner filters", async () => {
    pgMocks.poolQuery.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });

    await expect(repo.softDeleteSession("s1", "owner-1")).resolves.toBe(true);
    expect(pgMocks.poolQuery.mock.calls[0]?.[0]).toContain("AND user_id = $2");
    expect(pgMocks.poolQuery.mock.calls[0]?.[1]).toEqual(["s1", "owner-1"]);

    await expect(repo.softDeleteSession("s1")).resolves.toBe(false);
    expect(pgMocks.poolQuery.mock.calls[1]?.[0]).not.toContain("AND user_id =");
    expect(pgMocks.poolQuery.mock.calls[1]?.[1]).toEqual(["s1"]);
  });

  it("renames sessions and returns null when no row is updated", async () => {
    pgMocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ session_id: "s1", title: "Nuevo título" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(repo.renameSession("s1", "owner-1", "  Nuevo título  ")).resolves.toEqual({
      sessionId: "s1",
      title: "Nuevo título"
    });
    expect(pgMocks.poolQuery.mock.calls[0]?.[0]).toContain("title_manual = TRUE");
    expect(pgMocks.poolQuery.mock.calls[0]?.[1]).toEqual(["s1", "Nuevo título", "owner-1"]);

    await expect(repo.renameSession("s1", null, "t")).resolves.toBeNull();
    expect(pgMocks.poolQuery.mock.calls[1]?.[0]).not.toContain("AND user_id =");
    expect(pgMocks.poolQuery.mock.calls[1]?.[1]).toEqual(["s1", "t"]);
  });
});
