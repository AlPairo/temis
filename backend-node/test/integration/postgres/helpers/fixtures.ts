import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export async function insertUser(
  pool: Pool,
  input: {
    id?: string;
    role: "basic" | "supervisor" | "admin";
    parentUserId?: string | null;
    displayName?: string | null;
    isActive?: boolean;
  }
): Promise<{ id: string; role: string; parent_user_id: string | null; is_active: boolean }> {
  const id = input.id ?? randomUUID();
  const result = await pool.query<{
    id: string;
    role: string;
    parent_user_id: string | null;
    is_active: boolean;
  }>(
    `
      INSERT INTO users (id, role, parent_user_id, display_name, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, role, parent_user_id, is_active
    `,
    [id, input.role, input.parentUserId ?? null, input.displayName ?? null, input.isActive ?? true]
  );

  return result.rows[0];
}

export async function insertConversation(
  pool: Pool,
  input: {
    id?: string;
    externalId?: string | null;
    userId?: string | null;
    title?: string | null;
    titleManual?: boolean;
    deletedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  } = {}
): Promise<{
  id: string;
  external_id: string | null;
  user_id: string | null;
  title: string | null;
  title_manual: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}> {
  const id = input.id ?? randomUUID();
  const now = input.createdAt ?? new Date();
  const updatedAt = input.updatedAt ?? now;
  const result = await pool.query<{
    id: string;
    external_id: string | null;
    user_id: string | null;
    title: string | null;
    title_manual: boolean;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `
      INSERT INTO conversations (id, external_id, user_id, title, title_manual, deleted_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, external_id, user_id, title, title_manual, deleted_at, created_at, updated_at
    `,
    [
      id,
      input.externalId ?? null,
      input.userId ?? null,
      input.title ?? null,
      input.titleManual ?? false,
      input.deletedAt ?? null,
      now,
      updatedAt
    ]
  );

  return result.rows[0];
}

export async function insertMessage(
  pool: Pool,
  input: {
    id?: string;
    conversationId: string;
    userId?: string | null;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    createdAt?: Date;
  }
): Promise<{
  id: string;
  conversation_id: string;
  user_id: string | null;
  role: string;
  content: string;
  created_at: Date;
}> {
  const id = input.id ?? randomUUID();
  const result = await pool.query<{
    id: string;
    conversation_id: string;
    user_id: string | null;
    role: string;
    content: string;
    created_at: Date;
  }>(
    `
      INSERT INTO messages (id, conversation_id, user_id, role, content, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, conversation_id, user_id, role, content, created_at
    `,
    [id, input.conversationId, input.userId ?? null, input.role, input.content, input.createdAt ?? new Date()]
  );

  return result.rows[0];
}

export async function insertRetrievalEvent(
  pool: Pool,
  input: {
    conversationId: string;
    messageId?: string | null;
    userId?: string | null;
    query: string;
    results: unknown;
  }
): Promise<{
  id: number;
  conversation_id: string;
  message_id: string | null;
  user_id: string | null;
  query: string;
  results: unknown;
}> {
  const result = await pool.query<{
    id: number;
    conversation_id: string;
    message_id: string | null;
    user_id: string | null;
    query: string;
    results: unknown;
  }>(
    `
      INSERT INTO retrieval_events (conversation_id, message_id, user_id, query, results)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id, conversation_id, message_id, user_id, query, results
    `,
    [input.conversationId, input.messageId ?? null, input.userId ?? null, input.query, JSON.stringify(input.results)]
  );

  return result.rows[0];
}

