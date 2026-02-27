import { getPostgresPool, closePostgresPool } from "../clients/postgres.js";
import { runMigrations } from "../migrations/run-migrations.js";
import { ChatRepository } from "../modules/chat/chat-repository.js";
import { AuditRepository } from "../modules/audit/audit-repository.js";

async function verify(): Promise<void> {
  await runMigrations();

  const chatRepository = new ChatRepository();
  const auditRepository = new AuditRepository();

  const conversation = await chatRepository.createConversation({
    userId: "user-task04",
    title: "Synthetic conversation"
  });

  const message = await chatRepository.appendMessage({
    conversationId: conversation.id,
    userId: "user-task04",
    role: "user",
    content: "Synthetic hello"
  });

  await chatRepository.appendRetrievalEvent({
    conversationId: conversation.id,
    messageId: message.id,
    userId: "user-task04",
    query: "Synthetic query",
    queryType: "analysis",
    results: [{ source: "demo", score: 0.42 }]
  });

  await auditRepository.appendEvent({
    conversationId: conversation.id,
    userId: "user-task04",
    eventType: "chat.synthetic",
    payload: { step: "insert" }
  });

  const messages = await chatRepository.getConversationMessages(conversation.id);
  if (messages.length !== 1) {
    throw new Error(`Expected exactly 1 message, got ${messages.length}`);
  }

  const pool = getPostgresPool();
  let mutationBlocked = false;
  try {
    await pool.query("UPDATE messages SET content = $1 WHERE id = $2", ["mutated", message.id]);
  } catch {
    mutationBlocked = true;
  }

  if (!mutationBlocked) {
    throw new Error("Expected immutable message update to be blocked, but update succeeded.");
  }

  console.log(`Synthetic verification passed for conversation ${conversation.id}`);
}

verify()
  .catch((error) => {
    console.error("TASK_04 verification failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool();
  });
