import { UiStateComponent } from '@shared/components/ui-state.component';
import { SkeletonComponent } from '@shared/components/skeleton.component';
import { ActionFeedbackDirective } from '@shared/directives/action-feedback.directive';
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { timeZoneLabel } from '@features/teacher-setup/models/availability';
import { PriceComponent } from '@shared/components/price.component';
import { ProtectedFileViewerComponent } from '@shared/components/protected-file-viewer.component';
import { ToastComponent } from '@shared/components/toast.component';
import { FilePickerComponent } from '@shared/components/file-picker.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { DialogService } from '@shared/services/dialog.service';
import { Order, REVIEW_CRITERIA, ReviewDraft } from '@features/orders/models/order-detail';
import { LiveSession, SESSION_STATUS, Session, SessionAction, SessionAttachment } from '../models/live-session';
import { LiveSessionGateway } from '../services/live-session.gateway';

type Busy = SessionAction | 'message' | '';
type JitsiApi = { dispose(): void; addEventListener(event: string, handler: () => void): void };
type JitsiWindow = Window & { JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiApi };

/** One live session for its student or teacher: time, payment, join, and the settlement lifecycle. */
@Component({
  selector: 'tf-live-session-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiStateComponent, SkeletonComponent, ActionFeedbackDirective, FormsModule, RouterLink, WorkspaceShellComponent, ToastComponent, PriceComponent, ProtectedFileViewerComponent, FilePickerComponent],
  templateUrl: './live-session-page.component.html',
  styleUrls: ['../../../shared/styles/workspace-detail.css', './live-session-page.component.css']
})
export class LiveSessionPageComponent {
  @ViewChild(ProtectedFileViewerComponent) private readonly viewer?: ProtectedFileViewerComponent;
  @ViewChild('meetingHost') private meetingHost?: ElementRef<HTMLElement>;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gateway = inject(LiveSessionGateway);
  private readonly session = inject(SESSION_STORE);
  readonly teacherWorkspace = computed(() => (this.session.current()?.roles ?? []).includes('Teacher'));
  private readonly dialogs = inject(DialogService);
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private meetingApi: JitsiApi | undefined;
  private meetingGeneration = 0;
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  readonly Session = Session;
  readonly STATUS = SESSION_STATUS;
  readonly zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  /** A zone named in the reader's language rather than as its IANA identifier (UX-06). */
  zoneLabel(zone: string): string { return timeZoneLabel(zone || 'UTC', this.locale.lang()); }

  sessionId = '';
  readonly loading = signal(true);
  readonly missing = signal(false);
  readonly loadError = signal('');
  readonly booking = signal<LiveSession | null>(null);
  readonly busy = signal<Busy>('');
  readonly actionError = signal('');
  readonly successNotice = signal('');
  readonly pendingChoice = signal<boolean | null>(null);
  readonly joinUrl = signal('');
  readonly meetingOpen = signal(false);
  readonly rescheduleOpen = signal(false);
  readonly rescheduleAt = signal('');
  readonly now = signal(Date.now());
  readonly criteria = REVIEW_CRITERIA;
  readonly stars = [1, 2, 3, 4, 5] as const;
  readonly reviewOpen = signal(false);
  readonly review = signal<ReviewDraft>(Order.emptyReview());
  readonly reviewAttempted = signal(false);
  readonly reviewProblems = computed(() => this.reviewAttempted() ? Order.reviewProblems(this.review()) : []);

  readonly viewerId = computed(() => this.session.current()?.userId ?? '');
  readonly role = computed(() => { const b = this.booking(); return b ? Session.roleOf(b, this.viewerId()) : null; });
  readonly actions = computed(() => { const b = this.booking(); return b ? Session.actions(b, this.viewerId(), this.now()) : []; });
  readonly counterpart = computed(() => { const b = this.booking(); return b ? (this.role() === 'teacher' ? b.studentName : b.teacherName) || '—' : ''; });

  constructor() {
    this.title.setTitle(`${this.t('session_title', 'Live session')} — Tafseel`);
    const timer = setInterval(() => this.now.set(Date.now()), 15_000);
    inject(DestroyRef).onDestroy(() => { clearInterval(timer); this.closeMeeting(); });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.sessionId = params.get('sessionId') ?? '';
      this.successNotice.set('');
      this.booking.set(null);
      this.joinUrl.set('');
      this.closeMeeting();
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
  requestExpired(): boolean { const b = this.booking(); return !!b && this.now() >= Date.parse(b.startsAt); }

  async load(): Promise<void> {
    // Moving to another one while this load is in flight must not let its late answer paint the other.
    const sessionId = this.sessionId;
    this.loading.set(!this.booking());
    this.loadError.set('');
    try {
      const booking = await this.gateway.find(sessionId);
      if (sessionId !== this.sessionId) return;
      this.booking.set(booking);
      this.missing.set(!booking);
      if (booking) this.title.setTitle(`${booking.title} — Tafseel`);
    } catch (error) {
      if (sessionId !== this.sessionId) return;
      this.loadError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      if (sessionId === this.sessionId) this.loading.set(false);
      this.now.set(Date.now());
    }
  }

  /** A live session is not delivered work: "on-time delivery" reads as starting on time here. */
  criterionLabel(criterion: string): string {
    return criterion === 'onTimeDelivery'
      ? this.t('review_session_on_time', 'Started on time')
      : this.t('review_' + criterion, criterion);
  }

  rate(criterion: (typeof REVIEW_CRITERIA)[number], value: number): void {
    this.review.update(r => ({ ...r, [criterion]: value }));
  }

  setReview(field: 'comment' | 'recommends', value: string | boolean): void {
    this.review.update(r => ({ ...r, [field]: value }));
  }

  async submitReview(): Promise<void> {
    const booking = this.booking();
    if (!booking || this.busy()) return;
    this.reviewAttempted.set(true);
    if (Order.reviewProblems(this.review()).length) return;
    this.busy.set('review');
    this.actionError.set('');
    this.successNotice.set('');
    try {
      await this.gateway.review(booking.id, this.review());
      this.review.set(Order.emptyReview());
      this.reviewAttempted.set(false);
      this.reviewOpen.set(false);
      await this.load();
      this.successNotice.set(this.t('session_review_thanks', 'Thank you. Your review is published on the teacher’s profile.'));
    } catch (error) {
      this.actionError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.busy.set('');
    }
  }

  async join(): Promise<void> {
    const booking = this.booking();
    if (!booking || this.busy()) return;
    this.busy.set('join');
    this.actionError.set('');
    try {
      const access = await firstValueFrom(this.gateway.join(booking.id));
      if (access.roomName && access.jwt && access.externalApiUrl) {
        await this.openMeeting(access.roomName, access.jwt, access.externalApiUrl);
      } else {
        this.joinUrl.set(access.url);
        this.document.defaultView?.open(access.url, '_blank', 'noopener');
      }
    } catch (error) {
      this.actionError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.busy.set('');
    }
  }

  closeMeeting(): void {
    this.meetingGeneration++;
    this.meetingApi?.dispose();
    this.meetingApi = undefined;
    this.meetingOpen.set(false);
  }

  private async openMeeting(roomName: string, jwt: string, scriptUrl: string): Promise<void> {
    const win = this.document.defaultView as JitsiWindow | null;
    const generation = ++this.meetingGeneration;
    try {
      if (!win || !/^https:\/\/8x8\.vc\/vpaas-magic-cookie-[a-z0-9]+\/external_api\.js$/.test(scriptUrl)) {
        throw new Error('Meeting provider is unavailable.');
      }
      this.meetingOpen.set(true);
      this.changeDetector.detectChanges();
      this.meetingHost?.nativeElement.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!win.JitsiMeetExternalAPI) await new Promise<void>((resolve, reject) => {
        const script = this.document.createElement('script');
        script.src = scriptUrl;
        script.onload = () => resolve();
        script.onerror = () => { script.remove(); reject(new Error('Meeting provider could not load.')); };
        this.document.head.appendChild(script);
      });
      if (generation !== this.meetingGeneration) return;
      if (!win.JitsiMeetExternalAPI || !this.meetingHost) throw new Error('Meeting provider could not load.');
      this.meetingApi = new win.JitsiMeetExternalAPI('8x8.vc', {
        roomName, jwt, parentNode: this.meetingHost.nativeElement,
        width: '100%', height: '100%', lang: this.locale.lang()
      });
      this.meetingApi.addEventListener('videoConferenceLeft', () => this.closeMeeting());
    } catch {
      this.closeMeeting();
      this.actionError.set(this.t('session_meeting_failed', 'The meeting could not open. Please try joining again.'));
    }
  }

  async complete(): Promise<void> {
    const b = this.booking();
    if (!b || !await this.confirm(this.t('session_complete_body', 'Tell Tafseel the session took place? The student confirms, or it is settled automatically after the review window.'), this.t('session_complete', 'Mark as completed'))) return;
    await this.run('complete', () => firstValueFrom(this.gateway.complete(b.id, b.version)), this.t('session_completion_requested', 'Completion sent to the student for confirmation.'));
  }

  async respondToRequest(accept: boolean): Promise<void> {
    const b = this.booking();
    if (!b) return;
    if (!accept && !await this.confirm(
      this.t('session_decline_request_body', 'Decline this session request? The student will be notified and cannot pay for it.'),
      this.t('session_decline_request', 'Decline request'), true)) return;
    await this.run('respond-request', () => firstValueFrom(this.gateway.respondToRequest(b.id, accept, b.version)),
      accept ? this.t('session_request_accepted', 'Request accepted. The student can now pay.')
        : this.t('session_request_declined', 'Request declined.'));
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
    const body = b.status === SESSION_STATUS.AWAITING_PAYMENT || b.status === SESSION_STATUS.AWAITING_TEACHER_APPROVAL
      ? this.t('session_cancel_unpaid', 'Cancel this booking? Nothing has been paid.')
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

  async attach(files: readonly File[]): Promise<void> {
    const b = this.booking(), file = files[0];
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
    this.successNotice.set('');
    try {
      await work();
      await this.load();
      this.successNotice.set(done);
    } catch (error) {
      this.actionError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
      await this.load();
    } finally {
      this.busy.set('');
    }
  }
}
