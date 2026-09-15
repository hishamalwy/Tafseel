/**
 * Conversations between the people on an order, a request or a live session (J9-02).
 *
 * `ConversationScope` is the API's enum. Who may read a conversation is decided by the server
 * from its participants, never by the id in the address.
 */

export const CONVERSATION_SCOPE = { GENERAL: 0, LEARNING_REQUEST: 1, ORDER: 2, LIVE_SESSION: 3 } as const;

export const MESSAGE_LIMITS = { body: 4000, attachmentBytes: 50 * 1024 * 1024 } as const;

/** The attachment types `PrivateMediaRules.EnsureAttachment` accepts for messages. */
export const ATTACHMENT_EXTENSIONS: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip'
};

export interface MessageAttachment {
  readonly id: string;
  readonly name: string;
  readonly contentType: string;
  readonly size: number;
}

export interface Message {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly body: string;
  readonly createdAt: string;
  readonly attachments: readonly MessageAttachment[];
}

export interface Participant {
  readonly userId: string;
  readonly name: string;
  readonly nameEnglish: string;
  readonly initials: string;
  readonly role: string;
}

export interface Conversation {
  readonly id: string;
  readonly scope: number;
  readonly resourceId: string;
  readonly participantIds: readonly string[];
  readonly participants: readonly Participant[];
  readonly latestMessage: Message | null;
  readonly unreadCount: number;
  readonly updatedAt: string;
  readonly version: string;
}

export type RealtimeState = 'connecting' | 'live' | 'reconnecting' | 'polling';

export const Messaging = {
  other(conversation: Conversation, viewerId: string): Participant | null {
    return conversation.participants.find(p => p.userId !== viewerId) ?? null;
  },

  /** Where the conversation's subject lives, when it has one. */
  contextLink(conversation: Pick<Conversation, 'scope' | 'resourceId'>): string[] | null {
    if (!conversation.resourceId) return null;
    switch (conversation.scope) {
      case CONVERSATION_SCOPE.ORDER: return ['/orders', conversation.resourceId];
      case CONVERSATION_SCOPE.LIVE_SESSION: return ['/live-sessions', conversation.resourceId];
      case CONVERSATION_SCOPE.LEARNING_REQUEST: return ['/requests', conversation.resourceId];
      default: return null;
    }
  },

  scopeKey(scope: number): string {
    return ['messages_scope_general', 'messages_scope_request', 'messages_scope_order', 'messages_scope_session'][scope] ?? 'messages_scope_general';
  },

  /** Oldest first, one entry per id; a real-time copy of a message already listed replaces it. */
  merge(current: readonly Message[], incoming: readonly Message[]): readonly Message[] {
    const byId = new Map(current.map(message => [message.id, message]));
    for (const message of incoming) byId.set(message.id, message);
    return [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  },

  bodyProblem(body: string): 'required' | 'too_long' | null {
    const text = body.trim();
    return !text ? 'required' : text.length > MESSAGE_LIMITS.body ? 'too_long' : null;
  },

  attachmentProblem(file: File | null): 'type' | 'size' | null {
    if (!file) return null;
    const dot = file.name.lastIndexOf('.');
    const expected = dot >= 0 ? ATTACHMENT_EXTENSIONS[file.name.slice(dot).toLowerCase()] : undefined;
    if (!expected) return 'type';
    if (file.size <= 0 || file.size > MESSAGE_LIMITS.attachmentBytes) return 'size';
    return null;
  }
} as const;
