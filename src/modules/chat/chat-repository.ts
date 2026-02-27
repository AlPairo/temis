import { getPostgresClient } from "../../clients/postgres.js";
import type { QueryType } from "./types.js";
import type { Citation } from "../rag/types.js";

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ConversationRecord {
  id: string;
  externalId: string | null;
  userId: string | null;
  title: string | null;
  titleManual: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  userId: string | null;
  role: MessageRole;
  content: string;
  createdAt: Date;
}

export interface RetrievalEventRecord {
  id: number;
  conversationId: string;
  messageId: string | null;
  userId: string | null;
  query: string;
  queryType: QueryType;
  results: unknown;
  createdAt: Date;
}

interface ConversationRow {
  id: string;
  external_id: string | null;
  user_id: string | null;
  title: string | null;
  title_manual?: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at?: Date | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  user_id: string | null;
  role: MessageRole;
  content: string;
  created_at: Date;
}

interface RetrievalEventRow {
  id: number;
  conversation_id: string;
  message_id: string | null;
  user_id: string | null;
  query: string;
  query_type: QueryType;
  results: unknown;
  created_at: Date;
}

interface SessionHistoryMessageRow {
  id: string;
  role: MessageRole;
  content: string;
  created_at: Date;
}

interface SessionHistoryRetrievalRow {
  message_id: string | null;
  results: unknown;
  created_at: Date;
}

export interface SessionSummaryRecord {
  conversationId: string;
  sessionId: string;
  ownerUserId: string | null;
  title: string | null;
  turns: number;
  lastMessage: string | null;
  deletedAt: Date | null;
}

export interface SessionDetailRecord {
  conversationId: string;
  sessionId: string;
  ownerUserId: string | null;
  title: string | null;
  deletedAt: Date | null;
  history: Array<{
    role: MessageRole;
    content: string;
    citations?: Citation[];
    lowConfidence?: boolean;
  }>;
}

export interface SessionListQuery {
  visibleUserIds?: string[] | null;
  includeDeleted?: boolean;
}

export interface SessionLookupQuery {
  sessionId: string;
  visibleUserIds?: string[] | null;
  includeDeleted?: boolean;
}

export interface RenameSessionResult {
  sessionId: string;
  title: string;
}

export interface ChatRepositoryPort {
  createConversation(input: { userId?: string | null; title?: string | null }): Promise<ConversationRecord>;
  ensureConversationBySessionId(input: {
    sessionId: string;
    userId?: string | null;
    title?: string | null;
  }): Promise<ConversationRecord>;
  appendMessage(input: {
    conversationId: string;
    userId?: string | null;
    role: MessageRole;
    content: string;
  }): Promise<MessageRecord>;
  appendRetrievalEvent(input: {
    conversationId: string;
    messageId?: string | null;
    userId?: string | null;
    query: string;
    queryType: QueryType;
    results: unknown;
  }): Promise<RetrievalEventRecord>;
  getConversationMessages(conversationId: string): Promise<MessageRecord[]>;
  listSessions(input?: SessionListQuery): Promise<SessionSummaryRecord[]>;
  getSessionById(sessionId: string, options?: Omit<SessionLookupQuery, "sessionId">): Promise<SessionDetailRecord | null>;
  softDeleteSession(sessionId: string, ownerUserId?: string | null): Promise<boolean>;
  renameSession(sessionId: string, ownerUserId: string | null, title: string): Promise<RenameSessionResult | null>;
}

const toConversationRecord = (row: ConversationRow): ConversationRecord => ({
  id: row.id,
  externalId: row.external_id,
  userId: row.user_id,
  title: row.title,
  titleManual: row.title_manual ?? false,
  deletedAt: row.deleted_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? null
});

const normalizeVisibleUserIds = (visibleUserIds?: string[] | null): string[] | null | undefined => {
  if (visibleUserIds === undefined) {
    return undefined;
  }
  if (visibleUserIds === null) {
    return null;
  }
  const cleaned = [...new Set(visibleUserIds.map((id) => id.trim()).filter(Boolean))];
  return cleaned;
};

type SessionHistoryEntry = SessionDetailRecord["history"][number];
type RetrievalSummary = Pick<SessionHistoryEntry, "citations" | "lowConfidence">;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const readOptionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const coerceCitation = (value: unknown): Citation | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = readOptionalString(value.id);
  const docId = readOptionalString(value.doc_id);
  const chunkId = readOptionalString(value.chunk_id);
  if (!id || !docId || !chunkId) {
    return null;
  }

  return {
    id,
    doc_id: docId,
    chunk_id: chunkId,
    source: readOptionalString(value.source),
    jurisdiction: readOptionalString(value.jurisdiction),
    effective_date: readOptionalString(value.effective_date),
    score: readOptionalNumber(value.score) ?? 0
  };
};

const extractRetrievalSummary = (results: unknown): RetrievalSummary | null => {
  let payload = results;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = null;
    }
  }

  if (!isRecord(payload)) {
    return null;
  }

  const citations = Array.isArray(payload.citations)
    ? (payload.citations.map(coerceCitation).filter(Boolean) as Citation[])
    : undefined;
  const lowConfidence = typeof payload.lowConfidence === "boolean" ? payload.lowConfidence : undefined;

  if ((!citations || citations.length === 0) && lowConfidence === undefined) {
    return null;
  }

  return {
    citations: citations && citations.length > 0 ? citations : undefined,
    lowConfidence
  };
};

const attachRetrievalSummariesToHistory = (
  messages: SessionHistoryMessageRow[],
  retrievalEvents: SessionHistoryRetrievalRow[]
): SessionHistoryEntry[] => {
  const retrievalByUserMessageId = new Map<string, RetrievalSummary>();
  for (const event of retrievalEvents) {
    if (!event.message_id) {
      continue;
    }
    const summary = extractRetrievalSummary(event.results);
    if (summary) {
      retrievalByUserMessageId.set(event.message_id, summary);
    }
  }

  const pendingSummaries: RetrievalSummary[] = [];
  const history: SessionHistoryEntry[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      const summary = retrievalByUserMessageId.get(message.id);
      if (summary) {
        pendingSummaries.push(summary);
      }
      history.push({ role: message.role, content: message.content });
      continue;
    }

    if (message.role === "assistant" && pendingSummaries.length > 0) {
      const summary = pendingSummaries.shift();
      history.push({
        role: message.role,
        content: message.content,
        ...(summary?.citations ? { citations: summary.citations } : {}),
        ...(typeof summary?.lowConfidence === "boolean" ? { lowConfidence: summary.lowConfidence } : {})
      });
      continue;
    }

    history.push({ role: message.role, content: message.content });
  }

  return history;
};

function buildVisibilityWhereClause(
  startParamIndex: number,
  options: { includeDeleted?: boolean; visibleUserIds?: string[] | null }
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const clauses: string[] = [];

  if (!options.includeDeleted) {
    clauses.push("c.deleted_at IS NULL");
  }

  const visibleUserIds = normalizeVisibleUserIds(options.visibleUserIds);
  if (visibleUserIds !== undefined && visibleUserIds !== null) {
    if (visibleUserIds.length === 0) {
      clauses.push("1 = 0");
    } else {
      clauses.push(`c.user_id = ANY($${startParamIndex + params.length}::text[])`);
      params.push(visibleUserIds);
    }
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

export class ChatRepository implements ChatRepositoryPort {
  async createConversation(input: { userId?: string | null; title?: string | null }): Promise<ConversationRecord> {
    const { pool } = await getPostgresClient();
    const result = await pool.query<ConversationRow>(
      `
        INSERT INTO conversations (user_id, title)
        VALUES ($1, $2)
        RETURNING id, external_id, user_id, title, title_manual, deleted_at, created_at, updated_at
      `,
      [input.userId ?? null, input.title ?? null]
    );

    return toConversationRecord(result.rows[0]);
  }

  async ensureConversationBySessionId(input: {
    sessionId: string;
    userId?: string | null;
    title?: string | null;
  }): Promise<ConversationRecord> {
    const { pool } = await getPostgresClient();
    const requestedUserId = input.userId ?? null;
    const suggestedTitle = input.title?.trim() ? input.title.trim() : null;

    const upsertResult = await pool.query<ConversationRow>(
      `
        INSERT INTO conversations (external_id, user_id, title, title_manual, deleted_at)
        VALUES ($1, $2, $3, FALSE, NULL)
        ON CONFLICT (external_id) DO UPDATE
        SET user_id = CASE
              WHEN conversations.user_id IS NULL THEN EXCLUDED.user_id
              ELSE conversations.user_id
            END,
            title = CASE
              WHEN conversations.title_manual = TRUE THEN conversations.title
              ELSE COALESCE(conversations.title, EXCLUDED.title)
            END,
            deleted_at = NULL,
            updated_at = NOW()
        WHERE EXCLUDED.user_id IS NULL
           OR conversations.user_id IS NULL
           OR conversations.user_id = EXCLUDED.user_id
        RETURNING id, external_id, user_id, title, title_manual, deleted_at, created_at, updated_at
      `,
      [input.sessionId, requestedUserId, suggestedTitle]
    );

    const row = upsertResult.rows[0];
    if (row) {
      return toConversationRecord(row);
    }

    const existingResult = await pool.query<ConversationRow>(
      `
        SELECT id, external_id, user_id, title, title_manual, deleted_at, created_at, updated_at
        FROM conversations
        WHERE external_id = $1 OR id::text = $1
        ORDER BY (external_id = $1) DESC
        LIMIT 1
      `,
      [input.sessionId]
    );

    const existing = existingResult.rows[0];
    if (existing && requestedUserId && existing.user_id && existing.user_id !== requestedUserId) {
      throw new Error("Conversation ownership mismatch");
    }

    if (existing) {
      return toConversationRecord(existing);
    }

    throw new Error("Could not create or load conversation");
  }

  async appendMessage(input: {
    conversationId: string;
    userId?: string | null;
    role: MessageRole;
    content: string;
  }): Promise<MessageRecord> {
    const { pool } = await getPostgresClient();
    const result = await pool.query<MessageRow>(
      `
        INSERT INTO messages (conversation_id, user_id, role, content)
        VALUES ($1, $2, $3, $4)
        RETURNING id, conversation_id, user_id, role, content, created_at
      `,
      [input.conversationId, input.userId ?? null, input.role, input.content]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at
    };
  }

  async appendRetrievalEvent(input: {
    conversationId: string;
    messageId?: string | null;
    userId?: string | null;
    query: string;
    queryType: QueryType;
    results: unknown;
  }): Promise<RetrievalEventRecord> {
    const { pool } = await getPostgresClient();
    const result = await pool.query<RetrievalEventRow>(
      `
        INSERT INTO retrieval_events (conversation_id, message_id, user_id, query, query_type, results)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING id, conversation_id, message_id, user_id, query, query_type, results, created_at
      `,
      [
        input.conversationId,
        input.messageId ?? null,
        input.userId ?? null,
        input.query,
        input.queryType,
        JSON.stringify(input.results)
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      userId: row.user_id,
      query: row.query,
      queryType: row.query_type,
      results: row.results,
      createdAt: row.created_at
    };
  }

  async getConversationMessages(conversationId: string): Promise<MessageRecord[]> {
    const { pool } = await getPostgresClient();
    const result = await pool.query<MessageRow>(
      `
        SELECT id, conversation_id, user_id, role, content, created_at
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
      `,
      [conversationId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at
    }));
  }

  async listSessions(input?: SessionListQuery): Promise<SessionSummaryRecord[]> {
    const { pool } = await getPostgresClient();
    const visibility = buildVisibilityWhereClause(1, {
      includeDeleted: input?.includeDeleted,
      visibleUserIds: input?.visibleUserIds
    });

    const result = await pool.query<{
      conversation_id: string;
      session_id: string;
      owner_user_id: string | null;
      title: string | null;
      turns: number;
      last_message: string | null;
      deleted_at: Date | null;
    }>(
      `
        SELECT
          c.id AS conversation_id,
          COALESCE(c.external_id, c.id::text) AS session_id,
          c.user_id AS owner_user_id,
          c.title,
          COUNT(m.id)::int AS turns,
          (
            SELECT m2.content
            FROM messages m2
            WHERE m2.conversation_id = c.id
              AND m2.role = 'user'
            ORDER BY m2.created_at DESC
            LIMIT 1
          ) AS last_message,
          c.deleted_at
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        ${visibility.sql}
        GROUP BY c.id, c.external_id, c.user_id, c.title, c.deleted_at, c.updated_at, c.created_at
        ORDER BY COALESCE(c.updated_at, c.created_at) DESC, c.created_at DESC
      `,
      visibility.params
    );

    return result.rows.map((row) => ({
      conversationId: row.conversation_id,
      sessionId: row.session_id,
      ownerUserId: row.owner_user_id,
      title: row.title,
      turns: row.turns,
      lastMessage: row.last_message,
      deletedAt: row.deleted_at
    }));
  }

  async getSessionById(
    sessionId: string,
    options?: Omit<SessionLookupQuery, "sessionId">
  ): Promise<SessionDetailRecord | null> {
    const { pool } = await getPostgresClient();
    const visibility = buildVisibilityWhereClause(2, {
      includeDeleted: options?.includeDeleted,
      visibleUserIds: options?.visibleUserIds
    });
    const visibilitySql = visibility.sql ? visibility.sql.replace(/^WHERE\s+/i, "AND ") : "";

    const conversationResult = await pool.query<{
      id: string;
      session_id: string;
      owner_user_id: string | null;
      title: string | null;
      deleted_at: Date | null;
    }>(
      `
        SELECT
          id,
          COALESCE(external_id, id::text) AS session_id,
          user_id AS owner_user_id,
          title,
          deleted_at
        FROM conversations c
        WHERE (external_id = $1 OR id::text = $1)
          ${visibilitySql}
        ORDER BY (external_id = $1) DESC
        LIMIT 1
      `,
      [sessionId, ...visibility.params]
    );

    const conversation = conversationResult.rows[0];
    if (!conversation) {
      return null;
    }

    const messageResult = await pool.query<SessionHistoryMessageRow>(
      `
        SELECT id, role, content, created_at
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
      `,
      [conversation.id]
    );

    const retrievalResult = await pool.query<SessionHistoryRetrievalRow>(
      `
        SELECT message_id, results, created_at
        FROM retrieval_events
        WHERE conversation_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [conversation.id]
    );

    return {
      conversationId: conversation.id,
      sessionId: conversation.session_id,
      ownerUserId: conversation.owner_user_id,
      title: conversation.title,
      deletedAt: conversation.deleted_at,
      history: attachRetrievalSummariesToHistory(messageResult.rows, retrievalResult.rows)
    };
  }

  async softDeleteSession(sessionId: string, ownerUserId?: string | null): Promise<boolean> {
    const { pool } = await getPostgresClient();
    const params: unknown[] = [sessionId];
    let ownerSql = "";
    if (ownerUserId !== undefined && ownerUserId !== null) {
      params.push(ownerUserId);
      ownerSql = ` AND user_id = $${params.length}`;
    }

    const result = await pool.query<{ id: string }>(
      `
        UPDATE conversations
        SET deleted_at = NOW(),
            updated_at = NOW()
        WHERE (external_id = $1 OR id::text = $1)
          AND deleted_at IS NULL
          ${ownerSql}
        RETURNING id
      `,
      params
    );

    return (result.rowCount ?? 0) > 0;
  }

  async renameSession(sessionId: string, ownerUserId: string | null, title: string): Promise<RenameSessionResult | null> {
    const { pool } = await getPostgresClient();
    const params: unknown[] = [sessionId, title.trim()];
    let ownerSql = "";
    if (ownerUserId !== null) {
      params.push(ownerUserId);
      ownerSql = ` AND user_id = $${params.length}`;
    }

    const result = await pool.query<{ session_id: string; title: string }>(
      `
        UPDATE conversations
        SET title = $2,
            title_manual = TRUE,
            updated_at = NOW()
        WHERE (external_id = $1 OR id::text = $1)
          AND deleted_at IS NULL
          ${ownerSql}
        RETURNING COALESCE(external_id, id::text) AS session_id, title
      `,
      params
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      sessionId: row.session_id,
      title: row.title
    };
  }
}
