import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { Conversation, Message } from '../models/messaging';
import { MessagesGateway } from '../services/messages.gateway';
import { MessagesRealtime } from '../services/messages-realtime.service';
import { MessagesPageComponent } from './messages-page.component';

const conversation = (unreadCount: number, version = `v${unreadCount}`): Conversation => ({
  id: 'c1', scope: 2, resourceId: 'o1', participantIds: ['me', 'them'],
  participants: [
    { userId: 'me', name: 'Me', nameEnglish: 'Me', initials: 'M', role: 'Student' },
    { userId: 'them', name: 'Teacher', nameEnglish: 'Teacher', initials: 'T', role: 'Teacher' }
  ],
  latestMessage: null, unreadCount, updatedAt: '2026-09-15T10:00:00Z', version
});
const message = (id: string, senderId: string): Message => ({ id, conversationId: 'c1', senderId, body: id, createdAt: '2026-09-15T10:00:00Z', attachments: [] });

async function open(conversations: () => readonly Conversation[]) {
  let handlers!: { message: (m: Message) => void; poll: () => void; inbox: () => void };
  const gateway = {
    conversations: vi.fn(() => of(conversations())),
    messages: vi.fn(() => of<readonly Message[]>([])),
    markRead: vi.fn(() => of(undefined)),
    send: vi.fn(), attach: vi.fn(), attachmentPath: (id: string) => `/api/v1/message-attachments/${id}/content`
  };
  const realtime = {
    state: signal('live'),
    start: vi.fn(async (h: typeof handlers) => { handlers = h; }),
    join: vi.fn(async () => {}), stop: vi.fn(async () => {})
  };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(), provideHttpClientTesting(),
      provideRouter([{ path: 'conversations/:conversationId', component: MessagesPageComponent, providers: [
        { provide: MessagesGateway, useValue: gateway }, { provide: MessagesRealtime, useValue: realtime }
      ] }]),
      { provide: SESSION_STORE, useValue: { current: () => ({ userId: 'me', roles: ['Student'], accessToken: 't' }) } }
    ]
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/conversations/c1');
  await new Promise(resolve => setTimeout(resolve));
  return { harness, gateway, realtime, handlers: () => handlers };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 10));

describe('MessagesPageComponent', () => {
  it('keeps initial history still and animates only a newly received message across poll refreshes', async () => {
    const { harness, gateway, handlers } = await open(() => [conversation(0)]);
    gateway.messages.mockReturnValue(of([message('history', 'them')]));
    const component = harness.routeDebugElement!.componentInstance as MessagesPageComponent;
    await component.reloadThread(true);
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('[data-message-id="history"]')?.classList.contains('tf-message-arrive')).toBe(false);
    handlers().message(message('new', 'them'));
    await settle(); harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('[data-message-id="new"]')?.classList.contains('tf-message-arrive')).toBe(true);
    await component.reloadThread(false); harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('[data-message-id="history"]')?.classList.contains('tf-message-arrive')).toBe(false);
    expect(harness.routeNativeElement!.querySelectorAll('[data-message-id="new"]')).toHaveLength(1);
  });
  it('joins the conversation and marks it read when it opens with unread messages', async () => {
    const { gateway, realtime } = await open(() => [conversation(2)]);
    expect(realtime.join).toHaveBeenCalledWith('c1');
    expect(gateway.markRead).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', version: 'v2' }));
  });

  it('marks a message that arrives live as read, although the listed count predated it', async () => {
    let unread = 0;
    const { gateway, handlers } = await open(() => [conversation(unread)]);
    expect(gateway.markRead).not.toHaveBeenCalled();

    unread = 1;
    handlers().message(message('m1', 'them'));
    await settle();
    expect(gateway.markRead).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', version: 'v1' }));
  });

  it('does not mark read for the viewer’s own message', async () => {
    const { gateway, handlers } = await open(() => [conversation(0)]);
    handlers().message(message('m2', 'me'));
    await settle();
    expect(gateway.markRead).not.toHaveBeenCalled();
  });

  it('marks messages fetched by polling as read too', async () => {
    let unread = 0;
    const { gateway, handlers } = await open(() => [conversation(unread)]);
    unread = 3;
    handlers().poll();
    await settle();
    expect(gateway.messages).toHaveBeenCalledTimes(2);
    expect(gateway.markRead).toHaveBeenCalledWith(expect.objectContaining({ version: 'v3' }));
  });
});
