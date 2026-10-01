import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { AcceptRequestDialogComponent } from '@features/dashboards/components/accept-request-dialog.component';
import { PriceComponent } from '@shared/components/price.component';
import { PricePanelComponent } from '@shared/components/price-panel.component';
import { ProtectedFileViewerComponent } from '@shared/components/protected-file-viewer.component';
import { ToastComponent } from '@shared/components/toast.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import { FilePickerComponent } from '@shared/components/file-picker.component';
import { Attachment, Demand, REPLY_FILE_LIMITS, SOURCING, replyFileProblem } from '../models/demand';
import { DraftInvalid, LoadRequest, ManageRequest, RequestView } from '../services/demand.use-cases';

/**
 * One learning request for its student or its assigned teacher: what was asked, where it
 * stands, the clarification thread, and the next step the status allows - offers and payment
 * for an open request, acceptance for the teacher, the order once there is one.
 */
@Component({
  selector: 'tf-request-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, WorkspaceShellComponent, ToastComponent, PriceComponent, PricePanelComponent, ProtectedFileViewerComponent, AcceptRequestDialogComponent, FilePickerComponent],
  templateUrl: './request-detail-page.component.html',
  styleUrl: '../../../shared/styles/workspace-detail.css'
})
export class RequestDetailPageComponent {
  @ViewChild(ProtectedFileViewerComponent) private readonly viewer?: ProtectedFileViewerComponent;
  @ViewChild(AcceptRequestDialogComponent) private readonly acceptDialog?: AcceptRequestDialogComponent;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly load = inject(LoadRequest);
  private readonly manage = inject(ManageRequest);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly title = inject(Title);
  private readonly session = inject(SESSION_STORE);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  readonly Demand = Demand;

  requestId = '';
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly view = signal<RequestView | null>(null);
  readonly busy = signal(false);
  readonly actionError = signal('');
  readonly message = signal('');
  /** Files the student adds to their answer; sent before the answer itself. */
  readonly replyFiles = signal<readonly File[]>([]);
  readonly fileLimits = REPLY_FILE_LIMITS;
  readonly fileAccept = REPLY_FILE_LIMITS.acceptedTypes.join(',');
  readonly now = signal(Date.now());

  readonly viewerId = computed(() => this.session.current()?.userId ?? '');
  readonly isTeacher = computed(() => { const v = this.view(); return !!v && v.request.teacherId === this.viewerId() && v.request.studentId !== this.viewerId(); });
  readonly isOpen = computed(() => this.view()?.request.sourcing === SOURCING.OPEN);
  readonly secondsLeft = computed(() => {
    const open = this.view()?.open;
    return open && Demand.isReserved(open) ? Demand.reservationSecondsLeft(open.reservationExpiresAt, this.now()) : 0;
  });

  constructor() {
    this.title.setTitle(`${this.t('demand_request_title', 'Learning request')} — Tafseel`);
    const timer = setInterval(() => this.tick(), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.requestId = params.get('requestId') ?? '';
      this.view.set(null);
      void this.refresh();
    });
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  date(value: string): string { return value ? this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
  serviceName(): string {
    const r = this.view()?.request;
    return r ? ((this.locale.isRtl() ? r.serviceNameArabic : '') || r.serviceName || r.serviceNameArabic || '—') : '—';
  }
  subjectName(): string {
    const open = this.view()?.open;
    return open ? Demand.localName({ name: open.subjectName, nameArabic: open.subjectNameArabic }, this.locale.isRtl()) : '';
  }
  countdown(): string { return Demand.countdown(this.secondsLeft()); }
  senderLabel(senderId: string): string {
    const r = this.view()?.request;
    if (!r) return '';
    return senderId === this.viewerId() ? this.t('demand_you', 'You') : senderId === r.teacherId ? (r.teacherName || this.t('demand_teacher', 'Teacher')) : (r.studentName || this.t('demand_student', 'Student'));
  }

  async refresh(): Promise<void> {
    // The request this load is for: moving to another request while an earlier load (say, the reload
    // after an acceptance) is still in flight must not let that late answer paint the other request.
    const requestId = this.requestId;
    this.loading.set(true);
    this.loadError.set('');
    try {
      const view = await this.load.execute(requestId, this.viewerId());
      if (requestId !== this.requestId) return;
      // Arriving from a completed payment: the order it created is where the student continues.
      if (view.orderId && this.route.snapshot.queryParamMap.get('paid') === '1') {
        await this.router.navigate(['/orders', view.orderId], { replaceUrl: true });
        return;
      }
      this.view.set(view);
      this.title.setTitle(`${view.request.title} — Tafseel`);
    } catch (error) {
      if (requestId !== this.requestId) return;
      // A teacher opening an open request they were not assigned sees it as an opportunity.
      const roles = this.session.current()?.roles ?? [];
      if (error instanceof HttpErrorResponse && (error.status === 404 || error.status === 400) && roles.includes('Teacher')) {
        await this.router.navigate(['/teacher/opportunities', this.requestId], { replaceUrl: true });
        return;
      }
      this.loadError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      if (requestId === this.requestId) this.loading.set(false);
    }
  }

  openAttachment(file: Attachment): void {
    void this.viewer?.open(`/api/v1/learning-requests/attachments/${encodeURIComponent(file.id)}/content`, file.name, file.contentType);
  }

  async cancel(): Promise<void> {
    const view = this.view();
    if (!view || this.busy() || !await this.dialogs.confirm({
      title: this.t('demand_cancel_title', 'Cancel this request?'),
      body: this.t('demand_cancel_body', 'Teachers will no longer see it, and any offer selection is released.'),
      confirmLabel: this.t('demand_cancel', 'Cancel request'), cancelLabel: this.t('common_back', 'Back'), destructive: true
    })) return;
    await this.act(() => this.manage.cancel(view.request), this.t('demand_cancelled', 'Request cancelled.'));
  }

  async reply(): Promise<void> {
    const view = this.view();
    if (!view) return;
    await this.act(() => this.manage.reply(view.request, this.message(), this.replyFiles()), this.t('demand_reply_sent', 'Reply sent.'), true);
  }

  addReplyFiles(incoming: readonly File[], existing: number): void {
    const kept = [...this.replyFiles()];
    for (const file of incoming) {
      const reason = replyFileProblem(file, existing + kept.length);
      if (!reason) { kept.push(file); continue; }
      this.toasts.show(reason === 'too-large'
        ? this.locale.format('req_file_rejected_large', { name: file.name, max: REPLY_FILE_LIMITS.maxBytes / 1_048_576 }, '{name} is larger than {max} MB.')
        : reason === 'wrong-type'
          ? this.locale.format('req_file_type_invalid', { name: file.name }, '{name} is not an allowed file type.')
          : this.locale.format('req_file_limit', { n: REPLY_FILE_LIMITS.maxFiles }, 'You can attach up to {n} files.'));
    }
    this.replyFiles.set(kept);
  }

  removeReplyFile(index: number): void {
    this.replyFiles.update(current => current.filter((_, i) => i !== index));
  }

  async askClarification(): Promise<void> {
    const view = this.view();
    if (!view) return;
    await this.act(() => this.manage.askClarification(view.request, this.message()), this.t('demand_question_sent', 'Question sent to the student.'), true);
  }

  async decline(): Promise<void> {
    const view = this.view();
    if (!view || this.busy()) return;
    const reason = await this.dialogs.prompt({ title: this.t('demand_decline_title', 'Decline this request'), message: this.t('common_reason', 'Reason') });
    if (!reason) return;
    await this.act(() => this.manage.decline(view.request, reason), this.t('demand_declined', 'Request declined.'));
  }

  async accept(): Promise<void> {
    const view = this.view();
    if (!view) return;
    await this.acceptDialog?.open({
      id: view.request.id, version: view.request.version, title: view.request.title,
      teacherServiceId: view.request.teacherServiceId, preferredDeliveryAt: view.request.preferredDeliveryAt || null,
      listedPrice: view.request.listedPriceAtRequest ?? null
    });
  }

  async onAccepted(): Promise<void> {
    await this.refresh();
    this.toasts.show(this.t('accept_done', 'Accepted. The order is waiting for the student’s payment.'));
  }

  private tick(): void {
    this.now.set(Date.now());
    const open = this.view()?.open;
    // The reservation ran out: read the request again rather than keep offering payment.
    if (open && Demand.isReserved(open) && this.secondsLeft() === 0 && !this.loading()) void this.refresh();
  }

  private async act(work: () => Promise<void>, done: string, clearMessage = false): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set('');
    try {
      await work();
      if (clearMessage) { this.message.set(''); this.replyFiles.set([]); }
      await this.refresh();
      this.toasts.show(done);
    } catch (error) {
      this.actionError.set(error instanceof DraftInvalid
        ? this.t('demand_message_required', 'Write a message first (up to 2000 characters).')
        : problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.busy.set(false);
    }
  }
}
