import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { PriceComponent } from '@shared/components/price.component';
import { ProtectedFileViewerComponent } from '@shared/components/protected-file-viewer.component';
import { ToastComponent } from '@shared/components/toast.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import { LiveSession, SESSION_STATUS, Session, SessionAction, SessionAttachment } from '../models/live-session';
import { LiveSessionGateway } from '../services/live-session.gateway';

type Busy = SessionAction | 'message' | '';

/** One live session for its student or teacher: time, payment, join, and the settlement lifecycle. */
@Component({
  selector: 'tf-live-session-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, WorkspaceShellComponent, ToastComponent, PriceComponent, ProtectedFileViewerComponent],
  templateUrl: './live-session-page.component.html',
  styleUrl: '../../../shared/styles/workspace-detail.css'
})
export class LiveSessionPageComponent {
  @ViewChild(ProtectedFileViewerComponent) private readonly viewer?: ProtectedFileViewerComponent;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gateway = inject(LiveSessionGateway);
  private readonly session = inject(SESSION_STORE);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  readonly Session = Session;
  readonly STATUS = SESSION_STATUS;
  readonly zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  sessionId = '';
  readonly loading = signal(true);
  readonly missing = signal(false);
  readonly loadError = signal('');
  readonly booking = signal<LiveSession | null>(null);
  readonly busy = signal<Busy>('');
  readonly actionError = signal('');
  readonly joinUrl = signal('');
  readonly rescheduleOpen = signal(false);
  readonly rescheduleAt = signal('');
  readonly now = signal(Date.now());

  readonly viewerId = computed(() => this.session.current()?.userId ?? '');
  readonly role = computed(() => { const b = this.booking(); return b ? Session.roleOf(b, this.viewerId()) : null; });
  readonly actions = computed(() => { const b = this.booking(); return b ? Session.actions(b, this.viewerId(), this.now()) : []; });
  readonly counterpart = computed(() => { const b = this.booking(); return b ? (this.role() === 'teacher' ? b.studentName : b.teacherName) || '—' : ''; });

  constructor() {
    this.title.setTitle(`${this.t('session_title', 'Live session')} — Tafseel`);
    const timer = setInterval(() => this.now.set(Date.now()), 15_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.sessionId = params.get('sessionId') ?? '';
      this.booking.set(null);
      this.joinUrl.set('');
      void this.load();
    });
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  can(action: SessionAction): boolean { return this.actions().includes(action); }
  when(value: string | number, zone?: string): string {
    return value ? this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short', ...(zone ? { timeZone: zone } : {}) }) : '—';
  }
  joinOpens(): string { const b = this.booking(); return b ? this.when(Session.joinOpensAt(b)) : ''; }
  joinCloses(): string { const b = this.booking(); return b ? this.when(Session.joinClosesAt(b)) : ''; }

  async load(): Promise<void> {
    this.loading.set(!this.booking());
    this.loadError.set('');
    try {
      const booking = await this.gateway.find(this.sessionId);
      this.booking.set(booking);
      this.missing.set(!booking);
      if (booking) this.title.setTitle(`${booking.title} — Tafseel`);
    } catch (error) {
      this.loadError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
      this.now.set(Date.now());
    }
  }

  async join(): Promise<void> {
    const booking = this.booking();
    if (!booking || this.busy()) return;
    this.busy.set('join');
    this.actionError.set('');
    try {
      const access = await firstValueFrom(this.gateway.join(booking.id));
      this.joinUrl.set(access.url);
      this.document.defaultView?.open(access.url, '_blank', 'noopener');
    } catch (error) {
      this.actionError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.busy.set('');
    }
  }

  async complete(): Promise<void> {
    const b = this.booking();
    if (!b || !await this.confirm(this.t('session_complete_body', 'Tell Tafseel the session took place? The student confirms, or it is settled automatically after the review window.'), this.t('session_complete', 'Mark as completed'))) return;
    await this.run('complete', () => firstValueFrom(this.gateway.complete(b.id, b.version)), this.t('session_completion_requested', 'Completion sent to the student for confirmation.'));
  }

  async noShow(): Promise<void> {
    const b = this.booking(), teacher = this.role() === 'teacher';
    if (!b || !await this.confirm(teacher
      ? this.t('session_student_no_show_body', 'Report that the student did not attend? The student can confirm, or it is settled after the review window.')
      : this.t('session_teacher_no_show_body', 'Report that the teacher did not attend? The teacher can confirm, or it is settled after the review window.'),
      this.t('session_report_no_show', 'Report no-show'), true)) return;
    await this.run('no-show', () => firstValueFrom(this.gateway.noShow(b.id, teacher, b.version)), this.t('session_no_show_reported', 'No-show reported.'));
  }

  async confirmSettlement(): Promise<void> {
    const b = this.booking();
    if (!b || !await this.confirm(this.t('session_settle_body', 'Confirm this outcome? It becomes final.'), this.t('session_confirm_outcome', 'Confirm outcome'))) return;
    await this.run('confirm-settlement', () => firstValueFrom(this.gateway.confirmSettlement(b.id, b.version)), this.t('session_settled', 'Outcome confirmed.'));
  }

  async cancel(): Promise<void> {
    const b = this.booking();
    if (!b) return;
    const refunds = Session.cancellationRefunds(b, this.viewerId(), Date.now());
    const body = b.status === SESSION_STATUS.AWAITING_PAYMENT ? this.t('session_cancel_unpaid', 'Cancel this booking? Nothing has been paid.')
      : refunds ? this.t('session_cancel_refund', 'Cancel this session? The student’s payment is refunded.')
        : this.locale.format('session_cancel_no_refund', { hours: b.cancellationWindowHours }, 'Cancel this session? It starts within {hours} hours, so the payment is not refunded.');
    if (!await this.confirm(body, this.t('session_cancel', 'Cancel session'), true)) return;
    await this.run('cancel', () => firstValueFrom(this.gateway.cancel(b.id, b.version)), this.t('session_cancelled', 'Session cancelled.'));
  }

  async reschedule(): Promise<void> {
    const b = this.booking(), at = this.rescheduleAt();
    if (!b) return;
    if (!at || Number.isNaN(Date.parse(at)) || Date.parse(at) <= Date.now()) {
      this.actionError.set(this.t('session_reschedule_future', 'Choose a new start time in the future.'));
      return;
    }
    await this.run('reschedule', async () => {
      await firstValueFrom(this.gateway.reschedule(b.id, Session.rescheduleInput(at, this.zone), b.version));
      this.rescheduleOpen.set(false);
      this.rescheduleAt.set('');
    }, this.t('session_reschedule_sent', 'New time proposed. The other person accepts or declines it.'));
  }

  async respond(accept: boolean): Promise<void> {
    const b = this.booking();
    if (!b) return;
    await this.run('respond-reschedule', () => firstValueFrom(this.gateway.respondToReschedule(b.id, accept, b.version)),
      accept ? this.t('session_reschedule_accepted', 'New time accepted.') : this.t('session_reschedule_declined', 'New time declined.'));
  }

  async attach(event: Event): Promise<void> {
    const b = this.booking(), input = event.target as HTMLInputElement, file = input.files?.[0];
    input.value = '';
    if (!b || !file) return;
    await this.run('attach', () => firstValueFrom(this.gateway.attach(b.id, file, b.version)), this.t('session_file_added', 'File added to the session.'));
  }

  openAttachment(file: SessionAttachment): void {
    void this.viewer?.open(this.gateway.attachmentPath(file.id), file.name, file.contentType);
  }

  async message(): Promise<void> {
    const b = this.booking();
    if (!b || this.busy()) return;
    this.busy.set('message');
    try {
      const id = await firstValueFrom(this.gateway.conversation(b.id, this.role() === 'teacher' ? b.studentId : b.teacherId));
      await this.router.navigate(['/conversations', id]);
    } catch (error) {
      this.actionError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.busy.set('');
    }
  }

  private confirm(body: string, confirmLabel: string, destructive = false): Promise<boolean> {
    return this.dialogs.confirm({ body, confirmLabel, cancelLabel: this.t('common_back', 'Back'), destructive });
  }

  private async run(action: SessionAction, work: () => Promise<unknown>, done: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(action);
    this.actionError.set('');
    try {
      await work();
      await this.load();
      this.toasts.show(done);
    } catch (error) {
      this.actionError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
      await this.load();
    } finally {
      this.busy.set('');
    }
  }
}
