import { DestroyRef, Injectable, NgZone, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import type { HubConnection } from '@microsoft/signalr';
import { Message, RealtimeState } from '../models/messaging';
import { message as toMessage } from './messages.gateway';

const POLL_MS = 8000;

/**
 * Live updates for the open conversation over `/hubs/messages`.
 *
 * SignalR delivers `MessageReceived` for conversations this connection has joined (the hub checks
 * participation) and `NotificationChanged` for the signed-in user. While the hub is unreachable the
 * page falls back to polling, so a message still arrives - only later - and the state it shows says
 * which mode it is in. The client library loads only in the browser and only for this screen.
 */
@Injectable()
export class MessagesRealtime {
  private readonly session = inject(SESSION_STORE);
  private readonly zone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private connection: HubConnection | null = null;
  private joined = '';
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private onMessage: (message: Message) => void = () => {};
  private onPoll: () => void = () => {};
  private onInbox: () => void = () => {};

  readonly state = signal<RealtimeState>('connecting');

  constructor() {
    inject(DestroyRef).onDestroy(() => void this.stop());
  }

  async start(handlers: { message: (message: Message) => void; poll: () => void; inbox: () => void }): Promise<void> {
    this.onMessage = handlers.message;
    this.onPoll = handlers.poll;
    this.onInbox = handlers.inbox;
    if (!this.isBrowser) return;
    try {
      const signalR = await import('@microsoft/signalr');
      const connection = new signalR.HubConnectionBuilder()
        .withUrl('/hubs/messages', { accessTokenFactory: () => this.session.current()?.accessToken ?? '' })
        .withAutomaticReconnect()
        .configureLogging(signalR.LogLevel.None)
        .build();
      connection.on('MessageReceived', (dto: Record<string, unknown>) => this.zone.run(() => this.onMessage(toMessage(dto))));
      connection.on('NotificationChanged', () => this.zone.run(() => this.onInbox()));
      connection.onreconnecting(() => this.zone.run(() => this.degrade('reconnecting')));
      connection.onreconnected(() => this.zone.run(() => { void this.rejoin(); this.live(); }));
      connection.onclose(() => this.zone.run(() => this.degrade('polling')));
      this.connection = connection;
      await connection.start();
      this.live();
      await this.rejoin();
    } catch {
      this.degrade('polling');
    }
  }

  /** Receive this conversation's messages; the hub refuses a conversation the user is not in. */
  async join(conversationId: string): Promise<void> {
    this.joined = conversationId;
    await this.rejoin();
  }

  async stop(): Promise<void> {
    this.stopPolling();
    const connection = this.connection;
    this.connection = null;
    try { await connection?.stop(); } catch { /* already closed */ }
  }

  private async rejoin(): Promise<void> {
    if (!this.joined || this.connection?.state !== 'Connected') return;
    try { await this.connection.invoke('JoinConversation', this.joined); }
    catch { this.degrade('polling'); }
  }

  private live(): void {
    this.state.set('live');
    this.stopPolling();
  }

  private degrade(state: RealtimeState): void {
    this.state.set(state);
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.zone.run(() => this.onPoll()), POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }
}
