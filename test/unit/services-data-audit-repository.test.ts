import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPostgresClient: vi.fn()
}));

vi.mock("../../src/clients/postgres.js", () => ({
  getPostgresClient: mocks.getPostgresClient
}));

import { AuditRepository } from "../../src/modules/audit/audit-repository.js";

describe("modules/audit/audit-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("appendEvent inserts JSON payload and maps the returned row", async () => {
    const createdAt = new Date("2026-02-25T12:00:00.000Z");
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 10,
          conversation_id: "conv-1",
          user_id: "user-1",
          event_type: "chat.start",
          payload: { requestId: "req-1" },
          created_at: createdAt
        }
      ]
    });
    mocks.getPostgresClient.mockResolvedValue({ pool: { query } });
    const repository = new AuditRepository();

    const record = await repository.appendEvent({
      conversationId: "conv-1",
      userId: "user-1",
      eventType: "chat.start",
      payload: { requestId: "req-1" }
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(["conv-1", "user-1", "chat.start", JSON.stringify({ requestId: "req-1" })]);
    expect(record).toEqual({
      id: 10,
      conversationId: "conv-1",
      userId: "user-1",
      eventType: "chat.start",
      payload: { requestId: "req-1" },
      createdAt
    });
  });

  it("appendEvent defaults optional identifiers to null", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 11,
          conversation_id: null,
          user_id: null,
          event_type: "chat.error",
          payload: { failed: true },
          created_at: new Date("2026-02-25T12:05:00.000Z")
        }
      ]
    });
    mocks.getPostgresClient.mockResolvedValue({ pool: { query } });

    await new AuditRepository().appendEvent({
      eventType: "chat.error",
      payload: { failed: true }
    });

    expect(query.mock.calls[0][1]).toEqual([null, null, "chat.error", JSON.stringify({ failed: true })]);
  });

  it("listByConversationId reads rows ordered by created_at and maps them", async () => {
    const first = new Date("2026-02-25T12:00:00.000Z");
    const second = new Date("2026-02-25T12:01:00.000Z");
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 1,
          conversation_id: "conv-1",
          user_id: "user-1",
          event_type: "chat.start",
          payload: { a: 1 },
          created_at: first
        },
        {
          id: 2,
          conversation_id: "conv-1",
          user_id: null,
          event_type: "chat.complete",
          payload: { b: 2 },
          created_at: second
        }
      ]
    });
    mocks.getPostgresClient.mockResolvedValue({ pool: { query } });

    const records = await new AuditRepository().listByConversationId("conv-1");

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(["conv-1"]);
    expect(records).toEqual([
      {
        id: 1,
        conversationId: "conv-1",
        userId: "user-1",
        eventType: "chat.start",
        payload: { a: 1 },
        createdAt: first
      },
      {
        id: 2,
        conversationId: "conv-1",
        userId: null,
        eventType: "chat.complete",
        payload: { b: 2 },
        createdAt: second
      }
    ]);
  });
});
