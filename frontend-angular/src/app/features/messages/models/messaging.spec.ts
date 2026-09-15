import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { MessagesGateway } from '../services/messages.gateway';
import { CONVERSATION_SCOPE, MESSAGE_LIMITS, Message, Messaging } from './messaging';

const msg = (id: string, createdAt: string, body = id): Message => ({ id, conversationId: 'c1', senderId: 's', body, createdAt, attachments: [] });
const file = (name: string, size = 10) => new File([new Uint8Array(size)], name);

describe('Messaging', () => {
  it('shows a thread oldest first with no duplicates when a real-time copy arrives', () => {
    const page = [msg('m3', '2026-09-15T10:03:00Z'), msg('m1', '2026-09-15T10:01:00Z')];
    const merged = Messaging.merge(page, [msg('m1', '2026-09-15T10:01:00Z', 'edited copy'), msg('m4', '2026-09-15T10:04:00Z')]);
    expect(merged.map(m => m.id)).toEqual(['m1', 'm3', 'm4']);
    expect(merged[0].body).toBe('edited copy');
  });

  it('links a conversation back to the order, session or request it belongs to', () => {
    expect(Messaging.contextLink({ scope: CONVERSATION_SCOPE.ORDER, resourceId: 'o1' })).toEqual(['/orders', 'o1']);
    expect(Messaging.contextLink({ scope: CONVERSATION_SCOPE.LIVE_SESSION, resourceId: 'b1' })).toEqual(['/live-sessions', 'b1']);
    expect(Messaging.contextLink({ scope: CONVERSATION_SCOPE.LEARNING_REQUEST, resourceId: 'r1' })).toEqual(['/requests', 'r1']);
    expect(Messaging.contextLink({ scope: CONVERSATION_SCOPE.GENERAL, resourceId: 'x' })).toBeNull();
    expect(Messaging.contextLink({ scope: CONVERSATION_SCOPE.ORDER, resourceId: '' })).toBeNull();
  });

  it('refuses an empty or oversized message before sending', () => {
    expect(Messaging.bodyProblem('  ')).toBe('required');
    expect(Messaging.bodyProblem('x'.repeat(MESSAGE_LIMITS.body + 1))).toBe('too_long');
    expect(Messaging.bodyProblem('Hello')).toBeNull();
  });

  it('accepts only the attachment types the server accepts, within 50 MB', () => {
    expect(Messaging.attachmentProblem(null)).toBeNull();
    expect(Messaging.attachmentProblem(file('notes.PDF'))).toBeNull();
    expect(Messaging.attachmentProblem(file('slides.pptx'))).toBeNull();
    expect(Messaging.attachmentProblem(file('run.exe'))).toBe('type');
    expect(Messaging.attachmentProblem(file('noextension'))).toBe('type');
    expect(Messaging.attachmentProblem(file('empty.png', 0))).toBe('size');
  });
});

describe('MessagesGateway', () => {
  function gateway() {
    TestBed.configureTestingModule({ providers: [MessagesGateway, provideHttpClient(), provideHttpClientTesting()] });
    return { http: TestBed.inject(MessagesGateway), backend: TestBed.inject(HttpTestingController) };
  }

  it('marks a conversation read under the version it read', async () => {
    const { http, backend } = gateway();
    const done = firstValueFrom(http.markRead({ id: 'c1', version: 'cv1' }));
    const call = backend.expectOne('/api/v1/conversations/c1/read');
    expect(call.request.method).toBe('POST');
    expect(call.request.headers.get('If-Match')).toBe('cv1');
    call.flush(null);
    await done;
    backend.verify();
  });

  it('uploads an attachment as the form field the endpoint binds, and views it only through the protected route', async () => {
    const { http, backend } = gateway();
    const done = firstValueFrom(http.attach('m1', file('notes.pdf')));
    const call = backend.expectOne('/api/v1/messages/m1/attachments');
    expect((call.request.body as FormData).get('file')).toBeInstanceOf(File);
    call.flush({ id: 'a1', originalName: 'notes.pdf', contentType: 'application/pdf', size: 10 });
    expect((await done).name).toBe('notes.pdf');
    expect(http.attachmentPath('a1')).toBe('/api/v1/message-attachments/a1/content');
  });
});
