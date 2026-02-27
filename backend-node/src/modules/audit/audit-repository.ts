import { getPostgresClient } from "../../clients/postgres.js";

export interface AuditEventRecord {
  id: number;
  conversationId: string | null;
  userId: string | null;
  eventType: string;
  payload: unknown;
  createdAt: Date;
}

interface AuditEventRow {
  id: number;
  conversation_id: string | null;
  user_id: string | null;
  event_type: string;
  payload: unknown;
  created_at: Date;
}

export class AuditRepository {
  async appendEvent(input: {
    conversationId?: string | null;
    userId?: string | null;
    eventType: string;
    payload: unknown;
  }): Promise<AuditEventRecord> {
    const { pool } = await getPostgresClient();
    const result = await pool.query<AuditEventRow>(
      `
        INSERT INTO audit_events (conversation_id, user_id, event_type, payload)
        VALUES ($1, $2, $3, $4::jsonb)
        RETURNING id, conversation_id, user_id, event_type, payload, created_at
      `,
      [
        input.conversationId ?? null,
        input.userId ?? null,
        input.eventType,
        JSON.stringify(input.payload)
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      eventType: row.event_type,
      payload: row.payload,
      createdAt: row.created_at
    };
  }

  async listByConversationId(conversationId: string): Promise<AuditEventRecord[]> {
    const { pool } = await getPostgresClient();
    const result = await pool.query<AuditEventRow>(
      `
        SELECT id, conversation_id, user_id, event_type, payload, created_at
        FROM audit_events
        WHERE conversation_id = $1
        ORDER BY created_at ASC
      `,
      [conversationId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      eventType: row.event_type,
      payload: row.payload,
      createdAt: row.created_at
    }));
  }
}

