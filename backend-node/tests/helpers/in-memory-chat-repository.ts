import type {
  ChatRepositoryPort,
  ConversationRecord,
  MessageRecord,
  MessageRole,
  RenameSessionResult,
  RetrievalEventRecord,
  SessionDetailRecord,
  SessionListQuery,
  SessionLookupQuery,
  SessionSummaryRecord
} from "../../src/modules/chat/chat-repository.js";
import type { QueryType } from "../../src/modules/chat/types.js";

export class InMemoryChatRepository implements ChatRepositoryPort {
  private readonly conversations = new Map<string, ConversationRecord>();

  private readonly conversationBySessionId = new Map<string, string>();

  private readonly messagesByConversationId = new Map<string, MessageRecord[]>();

  private readonly retrievalEvents: RetrievalEventRecord[] = [];

  private retrievalEventId = 1;

  private messageId = 1;

  private conversationId = 1;

  seedSession(sessionId: string, history: Array<{ role: MessageRole; content: string }>): void {
    const conversation = this.ensureConversationBySessionIdSync({ sessionId });
    const seededMessages = history.map((message) => this.buildMessage(conversation.id, message.role, message.content));
    this.messagesByConversationId.set(conversation.id, seededMessages);
    conversation.updatedAt = new Date();
  }

  async createConversation(input: { userId?: string | null; title?: string | null }): Promise<ConversationRecord> {
    const id = `conv-${this.conversationId++}`;
    const createdAt = new Date();
    const conversation: ConversationRecord = {
      id,
      externalId: null,
      userId: input.userId ?? null,
      title: input.title ?? null,
      titleManual: false,
      deletedAt: null,
      createdAt,
      updatedAt: null
    };
    this.conversations.set(id, conversation);
    this.messagesByConversationId.set(id, []);
    return conversation;
  }

  private ensureConversationBySessionIdSync(input: {
    sessionId: string;
    userId?: string | null;
    title?: string | null;
  }): ConversationRecord {
    const existingId = this.conversationBySessionId.get(input.sessionId);
    if (existingId) {
      const existing = this.conversations.get(existingId);
      if (existing) {
        if (!existing.title && input.title) {
          existing.title = input.title;
          existing.updatedAt = new Date();
        }
        existing.deletedAt = null;
        return existing;
      }
    }

    const id = `conv-${this.conversationId++}`;
    const createdAt = new Date();
    const conversation: ConversationRecord = {
      id,
      externalId: input.sessionId,
      userId: input.userId ?? null,
      title: input.title ?? null,
      titleManual: false,
      deletedAt: null,
      createdAt,
      updatedAt: null
    };
    this.conversations.set(id, conversation);
    this.conversationBySessionId.set(input.sessionId, id);
    this.messagesByConversationId.set(id, []);
    return conversation;
  }

  async ensureConversationBySessionId(input: {
    sessionId: string;
    userId?: string | null;
    title?: string | null;
  }): Promise<ConversationRecord> {
    return this.ensureConversationBySessionIdSync(input);
  }

  private buildMessage(conversationId: string, role: MessageRole, content: string): MessageRecord {
    return {
      id: `msg-${this.messageId++}`,
      conversationId,
      userId: null,
      role,
      content,
      createdAt: new Date()
    };
  }

  async appendMessage(input: {
    conversationId: string;
    userId?: string | null;
    role: MessageRole;
    content: string;
  }): Promise<MessageRecord> {
    const message = this.buildMessage(input.conversationId, input.role, input.content);
    message.userId = input.userId ?? null;
    const messages = this.messagesByConversationId.get(input.conversationId) ?? [];
    messages.push(message);
    this.messagesByConversationId.set(input.conversationId, messages);
    const conversation = this.conversations.get(input.conversationId);
    if (conversation) {
      conversation.updatedAt = new Date();
    }
    return message;
  }

  async appendRetrievalEvent(input: {
    conversationId: string;
    messageId?: string | null;
    userId?: string | null;
    query: string;
    queryType: QueryType;
    results: unknown;
  }): Promise<RetrievalEventRecord> {
    const event: RetrievalEventRecord = {
      id: this.retrievalEventId++,
      conversationId: input.conversationId,
      messageId: input.messageId ?? null,
      userId: input.userId ?? null,
      query: input.query,
      queryType: input.queryType,
      results: input.results,
      createdAt: new Date()
    };
    this.retrievalEvents.push(event);
    return event;
  }

  async getConversationMessages(conversationId: string): Promise<MessageRecord[]> {
    return [...(this.messagesByConversationId.get(conversationId) ?? [])];
  }

  async listSessions(input?: SessionListQuery): Promise<SessionSummaryRecord[]> {
    const visibleUserIds = input?.visibleUserIds;
    const includeDeleted = input?.includeDeleted ?? false;

    return [...this.conversations.values()]
      .filter((conversation) => includeDeleted || conversation.deletedAt === null)
      .filter((conversation) => {
        if (visibleUserIds === undefined || visibleUserIds === null) {
          return true;
        }
        return conversation.userId !== null && visibleUserIds.includes(conversation.userId);
      })
      .sort((a, b) => {
        const aTime = (a.updatedAt ?? a.createdAt).getTime();
        const bTime = (b.updatedAt ?? b.createdAt).getTime();
        return bTime - aTime;
      })
      .map((conversation) => {
        const sessionId = conversation.externalId ?? conversation.id;
        const messages = this.messagesByConversationId.get(conversation.id) ?? [];
        const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
        return {
          conversationId: conversation.id,
          sessionId,
          ownerUserId: conversation.userId,
          title: conversation.title,
          turns: messages.length,
          lastMessage: lastUserMessage?.content ?? null,
          deletedAt: conversation.deletedAt
        };
      });
  }

  async getSessionById(
    sessionId: string,
    options?: Omit<SessionLookupQuery, "sessionId">
  ): Promise<SessionDetailRecord | null> {
    const visibleUserIds = options?.visibleUserIds;
    const includeDeleted = options?.includeDeleted ?? false;
    const conversation = [...this.conversations.values()].find(
      (candidate) =>
        (includeDeleted || candidate.deletedAt === null) &&
        (candidate.externalId === sessionId || candidate.id === sessionId) &&
        (visibleUserIds === undefined ||
          visibleUserIds === null ||
          (candidate.userId !== null && visibleUserIds.includes(candidate.userId)))
    );
    if (!conversation) {
      return null;
    }
    const messages = this.messagesByConversationId.get(conversation.id) ?? [];
    return {
      conversationId: conversation.id,
      sessionId: conversation.externalId ?? conversation.id,
      ownerUserId: conversation.userId,
      title: conversation.title,
      deletedAt: conversation.deletedAt,
      history: messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    };
  }

  async softDeleteSession(sessionId: string, ownerUserId?: string | null): Promise<boolean> {
    const conversation = [...this.conversations.values()].find(
      (candidate) =>
        candidate.deletedAt === null &&
        (candidate.externalId === sessionId || candidate.id === sessionId) &&
        (ownerUserId === undefined || ownerUserId === null || candidate.userId === ownerUserId)
    );
    if (!conversation) {
      return false;
    }
    conversation.deletedAt = new Date();
    conversation.updatedAt = new Date();
    return true;
  }

  async renameSession(sessionId: string, ownerUserId: string | null, title: string): Promise<RenameSessionResult | null> {
    const normalizedTitle = title.trim();
    const conversation = [...this.conversations.values()].find(
      (candidate) =>
        candidate.deletedAt === null &&
        (candidate.externalId === sessionId || candidate.id === sessionId) &&
        (ownerUserId === null || candidate.userId === ownerUserId)
    );

    if (!conversation) {
      return null;
    }

    conversation.title = normalizedTitle;
    conversation.titleManual = true;
    conversation.updatedAt = new Date();

    return {
      sessionId: conversation.externalId ?? conversation.id,
      title: conversation.title
    };
  }
}
