import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Conversation, Message, MessageAttachment, Participant } from '../models/messaging';

type Json = Record<string, any>;

/** The conversations and messages endpoints. The server checks participation on every call. */
@Injectable()
export class MessagesGateway {
  private readonly http = inject(HttpClient);

  conversations(): Observable<readonly Conversation[]> {
    return this.http.get<Json>('/api/v1/conversations?page=1&pageSize=50')
      .pipe(map(page => ((page['items'] ?? []) as Json[]).map(conversation)));
  }

  /** The latest page, newest first as the API returns it. */
  messages(conversationId: string): Observable<readonly Message[]> {
    return this.http.get<Json>(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages?page=1&pageSize=100`)
      .pipe(map(page => ((page['items'] ?? []) as Json[]).map(message)));
  }

  send(conversationId: string, body: string): Observable<Message> {
    return this.http.post<Json>(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, { body })
      .pipe(map(message));
  }

  attach(messageId: string, file: File): Observable<MessageAttachment> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<Json>(`/api/v1/messages/${encodeURIComponent(messageId)}/attachments`, form).pipe(map(attachment));
  }

  markRead(conversation: Pick<Conversation, 'id' | 'version'>): Observable<void> {
    return this.http.post<void>(`/api/v1/conversations/${encodeURIComponent(conversation.id)}/read`, null,
      { headers: new HttpHeaders({ 'If-Match': conversation.version }) });
  }

  attachmentPath(attachmentId: string): string {
    return `/api/v1/message-attachments/${encodeURIComponent(attachmentId)}/content`;
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function attachment(x: Json): MessageAttachment {
  return { id: text(x['id']), name: text(x['originalName']), contentType: text(x['contentType']), size: Number(x['size'] ?? 0) };
}

export function message(x: Json): Message {
  return {
    id: text(x['id']), conversationId: text(x['conversationId']), senderId: text(x['senderId']), body: text(x['body']),
    createdAt: text(x['createdAt']), attachments: (x['attachments'] ?? []).map(attachment)
  };
}

function participant(x: Json): Participant {
  return {
    userId: text(x['userId']), name: text(x['displayName']), nameEnglish: text(x['displayNameEnglish']),
    initials: text(x['initials']), role: text(x['role'])
  };
}

export function conversation(x: Json): Conversation {
  return {
    id: text(x['id']), scope: Number(x['scope'] ?? 0), resourceId: text(x['resourceId']),
    participantIds: (x['participantIds'] ?? []).map((id: unknown) => String(id)),
    participants: (x['participants'] ?? []).map(participant),
    latestMessage: x['latestMessage'] ? message(x['latestMessage']) : null,
    unreadCount: Number(x['unreadCount'] ?? 0), updatedAt: text(x['updatedAt']), version: text(x['version'])
  };
}
