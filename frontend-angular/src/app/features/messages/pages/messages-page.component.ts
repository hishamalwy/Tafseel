import { UiStateComponent } from '@shared/components/ui-state.component';
import { SkeletonComponent } from '@shared/components/skeleton.component';
import { ActionFeedbackDirective } from '@shared/directives/action-feedback.directive';
import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, afterNextRender, computed, inject, Injector, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { ProtectedFileViewerComponent } from '@shared/components/protected-file-viewer.component';
import { FilePickerComponent } from '@shared/components/file-picker.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { Conversation, MESSAGE_LIMITS, Message, MessageAttachment, Messaging } from '../models/messaging';
import { MessagesGateway } from '../services/messages.gateway';
import { MessagesRealtime } from '../services/messages-realtime.service';
import { IconComponent } from '@shared/components/icon.component';
import { UnreadMessages } from '@features/navigation/services/unread-messages';

/**
 * The inbox and one conversation (J9-02). The list shows unread counts; opening a conversation
 * marks it read, joins its real-time group and loads its messages. A reply can carry one file,
 * uploaded to the message after it is sent; files open only through the protected endpoint.
 */
@Component({
  selector: 'tf-messages-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiStateComponent, SkeletonComponent, ActionFeedbackDirective, IconComponent, FormsModule, RouterLink, WorkspaceShellComponent, ProtectedFileViewerComponent, FilePickerComponent],
  templateUrl: './messages-page.component.html',
  styleUrl: '../../../shared/styles/workspace-detail.css',
  styles: `
    .tf-messages { display: grid; grid-template-columns: minmax(220px, 320px) minmax(0, 1fr); gap: 18px; align-items: start; }
    .tf-inbox { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .tf-inbox a { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--r-sm); color: inherit; text-decoration: none; }
    .tf-inbox a[aria-current="page"] { border-color: var(--primary); background: var(--primary-soft); }
    .tf-inbox small { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tf-thread { display: grid; gap: 10px; max-height: 60vh; overflow-y: auto; padding: 4px; margin: 0; list-style: none; }
    .tf-bubble { max-width: min(80%, 560px); padding: 10px 12px; border-radius: var(--r-md); background: var(--surface-2); overflow-wrap: anywhere; }
    .tf-bubble[data-mine="true"] { margin-inline-start: auto; background: var(--primary-soft); }
    .tf-bubble p { margin: 0; white-space: pre-line; }
    .tf-bubble small { display: block; margin-top: 4px; color: var(--muted); font-size: var(--type-caption-size); }
    /* One inbox surface: the list is a rail inside it, the conversation fills the rest (V3). */
    .tf-messages { gap: 0; padding: 0; align-items: stretch; border: 1px solid var(--border); border-radius: var(--r-lg);
      background: var(--surface); overflow: hidden; min-block-size: min(620px, calc(100dvh - 240px)); }
    .tf-messages > .tf-profile-editor-card { margin: 0; border: 0; border-radius: 0; box-shadow: none; background: transparent; }
    .tf-messages > .tf-inbox-panel { border-inline-end: 1px solid var(--border); background: color-mix(in oklab, var(--surface-2) 45%, var(--surface)); }
    .tf-inbox { gap: 2px; }
    .tf-inbox a { border-color: transparent; border-radius: var(--r-md); padding: 12px; transition: background-color var(--motion-fast) ease; }
    @media (hover:hover) and (pointer:fine){.tf-inbox a:hover { background: var(--surface-2); } }
    .tf-inbox a[aria-current='page'] { border-color: transparent; background: var(--primary-soft); }
    .tf-inbox strong { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .tf-thread-links { display: flex; flex-wrap: wrap; gap: 6px; }
    .tf-thread-panel--idle { display: grid; place-content: center; justify-items: center; gap: 6px; text-align: center; }
    .tf-thread-panel--idle h2 { margin: 0; font-size: var(--type-item-title-size); }
    .tf-thread-idle-icon { display: grid; place-items: center; width: 48px; height: 48px; margin-block-end: 6px; border-radius: 12px;
      background: var(--primary-soft); color: var(--primary); }
    @media (max-width: 860px) { .tf-messages { min-block-size: 0; } .tf-messages > .tf-inbox-panel { border-inline-end: 0; } .tf-thread-panel--idle { display: none; } }
    @media (prefers-reduced-motion: reduce) { .tf-inbox a { transition: none; } }
    @media (max-width: 860px) { .tf-messages { grid-template-columns: minmax(0, 1fr); } .tf-messages[data-open="true"] .tf-inbox-panel { display: none; } }
    /* On a phone the thread must leave room for the box you type in: at 60vh the composer fell below the
       fold, so a student opening a conversation could not see where to reply (UX-06). */
    @media (max-width: 860px) { .tf-thread { max-height: 40vh; } }
  `
})
export class MessagesPageComponent {
  @ViewChild(ProtectedFileViewerComponent) private readonly viewer?: ProtectedFileViewerComponent;
  @ViewChild('thread') private readonly threadRef?: ElementRef<HTMLElement>;
  private readonly route = inject(ActivatedRoute);
  private readonly gateway = inject(MessagesGateway);
  private readonly session = inject(SESSION_STORE);
  private readonly title = inject(Title);
  private readonly injector = inject(Injector);
  readonly realtime = inject(MessagesRealtime);
  private readonly unread = inject(UnreadMessages);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  readonly Messaging = Messaging;
  readonly limits = MESSAGE_LIMITS;

  readonly conversationId = signal('');
  readonly conversations = signal<readonly Conversation[]>([]);
  readonly loadingList = signal(true);
  readonly listError = signal('');
  readonly messages = signal<readonly Message[]>([]);
  readonly loadingThread = signal(false);
  readonly threadError = signal('');
  readonly draft = signal('');
  readonly file = signal<File | null>(null);
  readonly sending = signal(false);
  readonly arriving = signal<ReadonlySet<string>>(new Set());
  readonly sendError = signal('');

  readonly viewerId = computed(() => this.session.current()?.userId ?? '');
  readonly shellRole = computed(() => (this.session.current()?.roles ?? []).includes('Teacher') ? 'Teacher' : 'Student');
  readonly workspacePath = computed(() => {
    const roles = this.session.current()?.roles ?? [];
    if (roles.includes('Teacher')) return '/teacher/work';
    if (roles.includes('Student')) return '/student/requests';
    if (roles.includes('Admin')) return '/admin/home';
    if (roles.includes('Finance')) return '/finance/home';
    return '/quality/applications';
  });
  readonly current = computed(() => this.conversations().find(c => c.id === this.conversationId()) ?? null);

  constructor() {
    this.title.setTitle(`${this.t('messages_title', 'Messages')} — Tafseel`);
    void this.realtime.start({
      message: incoming => this.receive(incoming),
      poll: () => void this.reloadThread(false).then(() => this.reloadList()).then(() => this.markRead()),
      inbox: () => void this.reloadList()
    });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.conversationId.set(params.get('conversationId') ?? '');
      this.messages.set([]);
      this.arriving.set(new Set());
      this.sendError.set('');
      void this.open();
    });
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  date(value: string): string { return value ? this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }) : ''; }
  name(conversation: Conversation): string {
    const other = Messaging.other(conversation, this.viewerId());
    return other ? ((this.locale.isRtl() ? other.name : other.nameEnglish) || other.name || other.nameEnglish) : this.t('messages_conversation', 'Conversation');
  }
  senderName(message: Message): string {
    if (message.senderId === this.viewerId()) return this.t('demand_you', 'You');
    const conversation = this.current();
    const other = conversation?.participants.find(p => p.userId === message.senderId);
    return other ? ((this.locale.isRtl() ? other.name : other.nameEnglish) || other.name) : '';
  }

  async open(): Promise<void> {
    await this.reloadList();
    const id = this.conversationId();
    if (!id) return;
    await this.realtime.join(id);
    await this.reloadThread(true);
    await this.markRead();
  }

  async reloadList(): Promise<void> {
    try {
      this.conversations.set(await firstValueFrom(this.gateway.conversations()));
      // The list just read is the freshest count there is; the navigation badge follows it (UX-71).
      this.unread.count.set(this.conversations().reduce((sum, c) => sum + c.unreadCount, 0));
      this.listError.set('');
    } catch (error) {
      this.listError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loadingList.set(false);
    }
  }

  async reloadThread(showLoading: boolean): Promise<void> {
    const id = this.conversationId();
    if (!id) return;
    if (showLoading) this.loadingThread.set(true);
    try {
      const page = await firstValueFrom(this.gateway.messages(id));
      if (id !== this.conversationId()) return;
      const before = this.messages().length;
      if (!showLoading) {
        const previous = new Set(this.messages().map(message => message.id));
        this.arriving.update(ids => new Set([...ids, ...page.filter(message => !previous.has(message.id)).map(message => message.id)]));
      }
      this.messages.set(Messaging.merge(this.messages(), page));
      this.threadError.set('');
      if (this.messages().length !== before) this.scrollToEnd();
    } catch (error) {
      this.threadError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loadingThread.set(false);
    }
  }

  pickFile(files: readonly File[]): void {
    const file = files[0] ?? null;
    this.file.set(file);
    const problem = Messaging.attachmentProblem(file);
    this.sendError.set(problem ? this.t(`messages_attachment_${problem}`, problem) : '');
  }

  removeFile(): void { this.file.set(null); this.sendError.set(''); }

  async send(form?: HTMLFormElement): Promise<void> {
    const id = this.conversationId(), body = this.draft(), file = this.file();
    if (!id || this.sending()) return;
    const bodyProblem = Messaging.bodyProblem(body), fileProblem = Messaging.attachmentProblem(file);
    if (bodyProblem || fileProblem) {
      this.sendError.set(bodyProblem ? this.t(`messages_body_${bodyProblem}`, bodyProblem) : this.t(`messages_attachment_${fileProblem}`, String(fileProblem)));
      return;
    }
    this.sending.set(true);
    this.sendError.set('');
    try {
      const sent = await firstValueFrom(this.gateway.send(id, body.trim()));
      this.receive(sent);
      this.draft.set('');
      if (file) {
        try {
          await firstValueFrom(this.gateway.attach(sent.id, file));
          await this.reloadThread(false);
        } catch (error) {
          this.sendError.set(`${this.t('messages_attachment_failed', 'The message was sent, but the file did not upload:')} ${problemMessage(error, (k, f) => this.t(k, f)).text}`);
        }
        this.file.set(null);
        form?.reset();
      }
      void this.reloadList();
    } catch (error) {
      this.sendError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.sending.set(false);
    }
  }

  openAttachment(attachment: MessageAttachment): void {
    void this.viewer?.open(this.gateway.attachmentPath(attachment.id), attachment.name, attachment.contentType);
  }

  private receive(incoming: Message): void {
    if (incoming.conversationId && incoming.conversationId !== this.conversationId()) {
      void this.reloadList();
      return;
    }
    if (!this.messages().some(message => message.id === incoming.id)) this.arriving.update(ids => new Set([...ids, incoming.id]));
    this.messages.set(Messaging.merge(this.messages(), [incoming]));
    this.scrollToEnd();
    // The listed unread count predates this message, so read the list again before deciding.
    if (incoming.senderId !== this.viewerId()) void this.reloadList().then(() => this.markRead());
  }

  private async markRead(): Promise<void> {
    const conversation = this.current();
    if (!conversation || conversation.unreadCount === 0) return;
    try {
      await firstValueFrom(this.gateway.markRead(conversation));
    } catch { /* a stale version only leaves the badge until the next reload */ }
    await this.reloadList();
  }

  private scrollToEnd(): void {
    afterNextRender(() => {
      const thread = this.threadRef?.nativeElement;
      if (thread) thread.scrollTop = thread.scrollHeight;
    }, { injector: this.injector });
  }
}
