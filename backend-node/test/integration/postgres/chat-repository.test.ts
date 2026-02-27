import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createTestDbPool, ensureTestDatabaseExists, truncateAppTables } from "./helpers/db-admin.js";
import { applyBackendAppEnvForTestDb } from "./helpers/db-env.js";
import { insertConversation, insertMessage, insertUser } from "./helpers/fixtures.js";
import { applyBackendMigrationsToTestDb } from "./helpers/migrate.js";

async function importRepositoryModule() {
  applyBackendAppEnvForTestDb();
  vi.resetModules();
  const postgres = await import("../../../src/clients/postgres.js");
  postgres.resetPostgresClientForTests();
  const repoModule = await import("../../../src/modules/chat/chat-repository.js");
  return { repoModule, postgres };
}

describe("ChatRepository integration", () => {
  let pool: Pool;

  beforeAll(async () => {
    applyBackendAppEnvForTestDb();
    await ensureTestDatabaseExists();
    await applyBackendMigrationsToTestDb();
    pool = createTestDbPool();
  }, 30_000);

  beforeEach(async () => {
    await truncateAppTables(pool);
    const postgres = await import("../../../src/clients/postgres.js");
    postgres.resetPostgresClientForTests();
  });

  afterAll(async () => {
    try {
      const postgres = await import("../../../src/clients/postgres.js");
      await postgres.shutdownPostgresClient().catch(() => undefined);
      postgres.resetPostgresClientForTests();
    } finally {
      await pool.end();
    }
  });

  it("creates and reuses conversations by session id", async () => {
    const { repoModule } = await importRepositoryModule();
    const repo = new repoModule.ChatRepository();

    const created = await repo.createConversation({ userId: "owner-1", title: "Manual" });
    expect(created.userId).toBe("owner-1");
    expect(created.title).toBe("Manual");
    expect(created.externalId).toBeNull();
    expect(created.titleManual).toBe(false);

    const ensured1 = await repo.ensureConversationBySessionId({
      sessionId: "session-abc",
      userId: "owner-1",
      title: "  Sugerido  "
    });
    const ensured2 = await repo.ensureConversationBySessionId({
      sessionId: "session-abc",
      userId: "owner-1",
      title: "Otro"
    });

    expect(ensured1.id).toBe(ensured2.id);
    expect(ensured1.externalId).toBe("session-abc");
    expect(ensured1.title).toBe("Sugerido");
  });

  it("throws ownership mismatch for a session claimed by a different user", async () => {
    const existing = await insertConversation(pool, {
      externalId: "session-owned",
      userId: "owner-a",
      title: "Owned"
    });
    expect(existing.external_id).toBe("session-owned");

    const { repoModule } = await importRepositoryModule();
    const repo = new repoModule.ChatRepository();

    await expect(
      repo.ensureConversationBySessionId({ sessionId: "session-owned", userId: "owner-b", title: "Other" })
    ).rejects.toThrow(/ownership mismatch/i);
  });

  it("undeletes an existing soft-deleted session when ensuring by session id", async () => {
    const deletedAt = new Date("2026-02-01T00:00:00.000Z");
    const seeded = await insertConversation(pool, {
      externalId: "session-soft-deleted",
      userId: "owner-1",
      deletedAt,
      title: "Old"
    });

    const { repoModule } = await importRepositoryModule();
    const repo = new repoModule.ChatRepository();
    const ensured = await repo.ensureConversationBySessionId({
      sessionId: "session-soft-deleted",
      userId: "owner-1",
      title: "Recovered"
    });

    expect(ensured.id).toBe(seeded.id);
    expect(ensured.deletedAt).toBeNull();
  });

  it("appends messages and retrieval events and returns message history in order", async () => {
    const convo = await insertConversation(pool, { externalId: "session-msgs", userId: "owner-1" });
    const { repoModule } = await importRepositoryModule();
    const repo = new repoModule.ChatRepository();

    const m1 = await repo.appendMessage({
      conversationId: convo.id,
      userId: "owner-1",
      role: "user",
      content: "primero"
    });
    const m2 = await repo.appendMessage({
      conversationId: convo.id,
      userId: "owner-1",
      role: "assistant",
      content: "segundo"
    });
    const retrieval = await repo.appendRetrievalEvent({
      conversationId: convo.id,
      messageId: m1.id,
      userId: "owner-1",
      query: "q",
      queryType: "normal",
      results: { nested: { ok: true }, items: [1, 2, 3] }
    });

    expect(retrieval.results).toEqual({ nested: { ok: true }, items: [1, 2, 3] });
    expect(retrieval.queryType).toBe("normal");

    const retrievalRow = await pool.query<{ query_type: string }>(
      "SELECT query_type FROM retrieval_events WHERE id = $1",
      [retrieval.id]
    );
    expect(retrievalRow.rows[0]?.query_type).toBe("normal");

    const history = await repo.getConversationMessages(convo.id);
    expect(history.map((m) => [m.id, m.role, m.content])).toEqual([
      [m1.id, "user", "primero"],
      [m2.id, "assistant", "segundo"]
    ]);
  });

  it("lists sessions with visibility and deleted filters", async () => {
    const c1 = await insertConversation(pool, { externalId: "s1", userId: "u1", title: "One" });
    const c2 = await insertConversation(pool, { externalId: "s2", userId: "u2", title: "Two" });
    const c3 = await insertConversation(pool, {
      externalId: "s3",
      userId: "u1",
      title: "Deleted",
      deletedAt: new Date("2026-02-03T00:00:00.000Z")
    });
    await insertMessage(pool, { conversationId: c1.id, role: "assistant", content: "assistant msg" });
    await insertMessage(pool, { conversationId: c1.id, role: "user", content: "user older" });
    await insertMessage(pool, { conversationId: c1.id, role: "user", content: "user latest" });
    await insertMessage(pool, { conversationId: c2.id, role: "user", content: "user u2" });
    await insertMessage(pool, { conversationId: c3.id, role: "user", content: "deleted user" });

    const { repoModule } = await importRepositoryModule();
    const repo = new repoModule.ChatRepository();

    const defaults = await repo.listSessions();
    expect(defaults.map((s) => s.sessionId)).toEqual(expect.arrayContaining(["s1", "s2"]));
    expect(defaults.map((s) => s.sessionId)).not.toContain("s3");

    const onlyU1 = await repo.listSessions({ visibleUserIds: [" u1 ", "u1"] });
    expect(onlyU1.map((s) => s.sessionId).sort()).toEqual(["s1"]);
    expect(onlyU1[0]?.lastMessage).toBe("user latest");

    const visibleEmpty = await repo.listSessions({ visibleUserIds: [] });
    expect(visibleEmpty).toEqual([]);

    const includingDeleted = await repo.listSessions({ includeDeleted: true, visibleUserIds: null });
    expect(includingDeleted.map((s) => s.sessionId)).toEqual(expect.arrayContaining(["s1", "s2", "s3"]));
  });

  it("gets session details with visibility and includeDeleted behavior", async () => {
    const c1 = await insertConversation(pool, { externalId: "detail-1", userId: "u1", title: "Detail" });
    await insertMessage(pool, { conversationId: c1.id, role: "user", content: "hola" });
    await insertMessage(pool, { conversationId: c1.id, role: "assistant", content: "respuesta" });

    const cDeleted = await insertConversation(pool, {
      externalId: "detail-deleted",
      userId: "u1",
      deletedAt: new Date()
    });
    await insertMessage(pool, { conversationId: cDeleted.id, role: "user", content: "bye" });

    const { repoModule } = await importRepositoryModule();
    const repo = new repoModule.ChatRepository();

    const detail = await repo.getSessionById("detail-1", { visibleUserIds: ["u1"] });
    expect(detail?.sessionId).toBe("detail-1");
    expect(detail?.history).toEqual([
      { role: "user", content: "hola" },
      { role: "assistant", content: "respuesta" }
    ]);

    await expect(repo.getSessionById("detail-1", { visibleUserIds: ["u2"] })).resolves.toBeNull();
    await expect(repo.getSessionById("detail-deleted")).resolves.toBeNull();
    await expect(repo.getSessionById("detail-deleted", { includeDeleted: true })).resolves.toMatchObject({
      sessionId: "detail-deleted"
    });
  });

  it("soft deletes and renames sessions with owner filtering", async () => {
    const c1 = await insertConversation(pool, { externalId: "mut-1", userId: "owner-1", title: "Original" });
    const c2 = await insertConversation(pool, {
      externalId: "mut-2",
      userId: "owner-2",
      title: "Delete me",
      deletedAt: new Date()
    });

    const { repoModule } = await importRepositoryModule();
    const repo = new repoModule.ChatRepository();

    await expect(repo.renameSession("mut-1", "owner-1", "  Nuevo título  ")).resolves.toEqual({
      sessionId: "mut-1",
      title: "Nuevo título"
    });
    const renamedRow = await pool.query<{ title: string; title_manual: boolean }>(
      "SELECT title, title_manual FROM conversations WHERE external_id = $1",
      ["mut-1"]
    );
    expect(renamedRow.rows[0]).toEqual({ title: "Nuevo título", title_manual: true });

    await expect(repo.renameSession("mut-1", "wrong-owner", "x")).resolves.toBeNull();
    await expect(repo.renameSession("mut-2", "owner-2", "y")).resolves.toBeNull();

    await expect(repo.softDeleteSession("mut-1", "wrong-owner")).resolves.toBe(false);
    await expect(repo.softDeleteSession("mut-1", "owner-1")).resolves.toBe(true);
    const deletedCheck = await pool.query<{ deleted: boolean }>(
      "SELECT (deleted_at IS NOT NULL) AS deleted FROM conversations WHERE external_id = $1",
      ["mut-1"]
    );
    expect(deletedCheck.rows[0]?.deleted).toBe(true);
  });

  it("handles concurrent ensureConversationBySessionId calls for the same session id", async () => {
    await insertUser(pool, { id: "owner-concurrent", role: "basic" });
    const { repoModule } = await importRepositoryModule();
    const repo = new repoModule.ChatRepository();

    const [a, b] = await Promise.all([
      repo.ensureConversationBySessionId({
        sessionId: "session-concurrent",
        userId: "owner-concurrent",
        title: "A"
      }),
      repo.ensureConversationBySessionId({
        sessionId: "session-concurrent",
        userId: "owner-concurrent",
        title: "B"
      })
    ]);

    expect(a.id).toBe(b.id);
    const count = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM conversations WHERE external_id = $1",
      ["session-concurrent"]
    );
    expect(count.rows[0]?.count).toBe("1");
  });
});
