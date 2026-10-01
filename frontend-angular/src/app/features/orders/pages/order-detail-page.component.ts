import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, lastValueFrom, tap } from 'rxjs';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { PriceComponent } from '@shared/components/price.component';
import { PricePanelComponent } from '@shared/components/price-panel.component';
import { ProtectedFileViewerComponent } from '@shared/components/protected-file-viewer.component';
import { ToastComponent } from '@shared/components/toast.component';
import { FilePickerComponent } from '@shared/components/file-picker.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import {
  DELIVERY_LIMITS, ORDER_STATUS_FALLBACK, Order, OrderAction, OrderDelivery, OrderDetail, OrderStatus, OrderTimelineEvent,
  REVIEW_CRITERIA, ReviewDraft, orderStatusKey
} from '../models/order-detail';
import { OrderDetailGateway } from '../services/order-detail.gateway';

type LoadState = 'loading' | 'ready' | 'missing' | 'failed';
type Panel = 'deliver' | 'revision' | 'review' | null;

/**
 * One order, for either participant (J6-06): what was agreed, where it stands, the deliveries and
 * the recorded history, and the step the order's own state allows this viewer to take - pay,
 * start, deliver, ask for a revision, complete, review - plus its conversation.
 */
@Component({
  selector: 'tf-order-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, PriceComponent, PricePanelComponent, ProtectedFileViewerComponent, ToastComponent, WorkspaceShellComponent, FilePickerComponent],
  templateUrl: './order-detail-page.component.html',
  styleUrl: '../../../shared/styles/workspace-detail.css'
})
export class OrderDetailPageComponent {
  @ViewChild(ProtectedFileViewerComponent) private readonly viewer?: ProtectedFileViewerComponent;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gateway = inject(OrderDetailGateway);
  private readonly session = inject(SESSION_STORE);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly title = inject(Title);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  readonly criteria = REVIEW_CRITERIA;
  readonly stars = [1, 2, 3, 4, 5] as const;
  readonly limits = DELIVERY_LIMITS;

  orderId = '';
  readonly state = signal<LoadState>('loading');
  readonly order = signal<OrderDetail | null>(null);
  /** With several deliveries (after a revision), the newest is marked so the student reviews the right one (UX-41). */
  readonly latestDeliveryId = computed(() => {
    const deliveries = this.order()?.deliveries ?? [];
    return deliveries.length > 1 ? [...deliveries].sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt))[0]?.id ?? '' : '';
  });
  readonly timeline = signal<readonly OrderTimelineEvent[]>([]);
  readonly timelineFailed = signal(false);
  /** What the student asked to change in their latest revision request. */
  readonly latestRevisionNote = computed(() => [...this.timeline()].reverse()
    .find(event => event.eventType === 'revision_requested' && event.metadata?.note)?.metadata?.note ?? '');
  readonly panel = signal<Panel>(null);
  readonly busy = signal<OrderAction | 'message' | ''>('');
  readonly actionError = signal('');
  /** A delivery that cannot be sent is explained at the file picker, where it is fixed (UX-38). */
  readonly deliveryError = signal('');
  readonly files = signal<readonly File[]>([]);
  readonly deliveryMessage = signal('');
  readonly progress = signal<number | null>(null);
  readonly revisionReason = signal('');
  readonly review = signal<ReviewDraft>(Order.emptyReview());
  readonly reviewAttempted = signal(false);

  readonly viewerId = computed(() => this.session.current()?.userId ?? '');
  readonly role = computed(() => { const o = this.order(); return o ? Order.roleOf(o, this.viewerId()) : null; });
  readonly actions = computed(() => { const o = this.order(); return o ? Order.actions(o, this.viewerId()) : []; });
  readonly reviewProblems = computed(() => this.reviewAttempted() ? Order.reviewProblems(this.review()) : []);

  readonly heading = computed(() => {
    const order = this.order();
    if (!order) return this.t('order_detail_title', 'Order');
    const service = this.locale.lang() === 'ar'
      ? (order.serviceNameArabic || order.serviceNameEnglish)
      : (order.serviceNameEnglish || order.serviceNameArabic);
    return order.requestTitle || service || this.t('order_detail_title', 'Order');
  });

  readonly statusLabel = computed(() => {
    const order = this.order();
    if (!order) return '';
    const key = orderStatusKey(order, this.role() === 'teacher' ? 'teacher' : 'student');
    return this.t(key, ORDER_STATUS_FALLBACK[key]);
  });

  readonly counterpart = computed(() => {
    const order = this.order();
    if (!order) return '';
    return this.role() === 'teacher'
      ? this.fmt.partyName(order, 'student')
      : this.fmt.partyName(order, 'teacher');
  });

  constructor() {
    this.title.setTitle(`${this.t('order_detail_title', 'Order')} — Tafseel`);
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.orderId = params.get('orderId') ?? '';
      this.order.set(null);
      this.panel.set(null);
      void this.load();
    });
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  can(action: OrderAction): boolean { return this.actions().includes(action); }
  date(value: string): string { return value ? this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
  revisionsLeft(): number { const o = this.order(); return o ? Order.revisionsLeft(o) : 0; }
  eventLabel(event: OrderTimelineEvent): string { return this.t(`order_timeline_event_${event.eventType}`, event.eventType); }
  actorLabel(event: OrderTimelineEvent): string { return this.t(`order_timeline_actor_${event.actorRole.toLowerCase()}`, event.actorRole); }
  isCompleted(): boolean { return this.order()?.status === OrderStatus.Completed; }

  async load(): Promise<void> {
    // Moving to another one while this load is in flight must not let its late answer paint the other.
    const orderId = this.orderId;
    this.state.set(this.order() ? 'ready' : 'loading');
    try {
      const order = await firstValueFrom(this.gateway.order(orderId));
      if (orderId !== this.orderId) return;
      this.order.set(order);
      this.state.set('ready');
      this.title.setTitle(`${this.heading()} — Tafseel`);
    } catch (error) {
      if (orderId !== this.orderId) return;
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      this.state.set(status === 404 || status === 403 || status === 400 ? 'missing' : 'failed');
      return;
    }
    try {
      const timeline = await firstValueFrom(this.gateway.timeline(orderId));
      if (orderId !== this.orderId) return;
      this.timeline.set(timeline);
      this.timelineFailed.set(false);
    } catch {
      this.timelineFailed.set(true);
    }
  }

  openDelivery(file: OrderDelivery): void {
    void this.viewer?.open(`/api/v1/orders/deliveries/${encodeURIComponent(file.id)}/content`, file.originalName, file.contentType);
  }

  toggle(panel: Exclude<Panel, null>): void {
    this.panel.set(this.panel() === panel ? null : panel);
    this.actionError.set('');
  }

  async start(): Promise<void> {
    const order = this.order();
    if (!order || !await this.dialogs.confirm({
      body: this.t('order_start_confirm', 'Start work on this order? The agreed delivery time applies from now on.'),
      confirmLabel: this.t('td_start', 'Start'), cancelLabel: this.t('common_cancel', 'Cancel')
    })) return;
    await this.run('start', () => firstValueFrom(this.gateway.start(order.id, order.version ?? '')), this.t('order_started', 'Work started.'));
  }

  /** A second choice adds to the first; Remove takes one away. */
  pickFiles(chosen: readonly File[]): void {
    this.files.update(files => [...files, ...chosen]);
    this.actionError.set('');
    this.deliveryError.set('');
  }

  removeFile(index: number): void { this.files.update(files => files.filter((_, i) => i !== index)); }

  async deliver(): Promise<void> {
    const order = this.order(), files = this.files();
    if (!order || this.busy()) return;
    const problem = Order.deliveryProblem(files);
    if (problem) {
      this.deliveryError.set(this.locale.format(`order_delivery_problem_${problem}`, { max: DELIVERY_LIMITS.files, size: DELIVERY_LIMITS.bytes / 1048576 }, problem));
      return;
    }
    await this.run('deliver', async () => {
      this.progress.set(0);
      await lastValueFrom(this.gateway.deliver(order.id, files, this.deliveryMessage().trim(), order.version ?? '').pipe(tap(event => {
        if (event.type === HttpEventType.UploadProgress && event.total) this.progress.set(Math.round(100 * event.loaded / event.total));
      })));
      this.files.set([]);
      this.deliveryMessage.set('');
      this.panel.set(null);
    }, this.t('order_delivered', 'Delivered. The student has been notified.'));
    this.progress.set(null);
  }

  async requestRevision(): Promise<void> {
    const order = this.order(), reason = this.revisionReason().trim();
    if (!order || this.busy()) return;
    if (!reason || reason.length > 2000) {
      this.actionError.set(this.t('order_revision_reason_required', 'Explain what should change (up to 2000 characters).'));
      return;
    }
    await this.run('revision', async () => {
      await firstValueFrom(this.gateway.requestRevision(order.id, reason, order.version ?? ''));
      this.revisionReason.set('');
      this.panel.set(null);
    }, this.t('order_revision_requested', 'Revision requested. The teacher will deliver again.'));
  }

  async complete(): Promise<void> {
    const order = this.order();
    if (!order || !await this.dialogs.confirm({
      title: this.t('order_complete_title', 'Accept the delivery and complete the order?'),
      body: this.t('order_complete_body', 'The order closes and the payment is released to the teacher’s pending earnings. You can then leave a review.'),
      confirmLabel: this.t('sd_approve_delivery', 'Accept delivery'), cancelLabel: this.t('common_cancel', 'Cancel')
    })) return;
    await this.run('complete', () => firstValueFrom(this.gateway.complete(order.id, order.version ?? '')), this.t('order_completed', 'Order completed.'));
  }

  async cancel(): Promise<void> {
    const order = this.order();
    if (!order || !await this.dialogs.confirm({
      body: this.t('order_cancel_body', 'Cancel this order before it is paid?'),
      confirmLabel: this.t('order_cancel', 'Cancel order'), cancelLabel: this.t('common_back', 'Back'), destructive: true
    })) return;
    await this.run('cancel', () => firstValueFrom(this.gateway.cancel(order.id, order.version ?? '')), this.t('order_cancelled', 'Order cancelled.'));
  }

  rate(criterion: typeof REVIEW_CRITERIA[number], value: number): void {
    this.review.update(r => ({ ...r, [criterion]: value }));
  }

  setReview(field: 'comment' | 'recommends', value: string | boolean): void {
    this.review.update(r => ({ ...r, [field]: value }));
  }

  async submitReview(): Promise<void> {
    const order = this.order();
    if (!order || this.busy()) return;
    this.reviewAttempted.set(true);
    if (Order.reviewProblems(this.review()).length) return;
    await this.run('review', async () => {
      await firstValueFrom(this.gateway.review(order.id, this.review()));
      this.panel.set(null);
      this.review.set(Order.emptyReview());
      this.reviewAttempted.set(false);
    }, this.t('order_review_thanks', 'Thank you. Your review is published on the teacher’s profile.'));
  }

  async openConversation(): Promise<void> {
    const order = this.order();
    if (!order || this.busy()) return;
    const other = this.role() === 'teacher' ? order.studentId : order.teacherId;
    this.busy.set('message');
    this.actionError.set('');
    try {
      const conversationId = await firstValueFrom(this.gateway.conversation(order.id, other));
      await this.router.navigate(['/conversations', conversationId]);
    } catch (error) {
      this.actionError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.busy.set('');
    }
  }

  private async run(action: OrderAction, work: () => Promise<unknown>, done: string): Promise<void> {
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
