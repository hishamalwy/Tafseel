import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ViewChild, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { PriceComponent } from '@shared/components/price.component';
import { ProtectedFileViewerComponent } from '@shared/components/protected-file-viewer.component';
import { WorkflowHeaderComponent } from '@shared/layouts/workflow-header.component';
import {
  ORDER_STATUS_FALLBACK, OrderDelivery, OrderDetail, OrderTimelineEvent, orderStatusKey
} from '../models/order-detail';
import { OrderDetailGateway } from '../services/order-detail.gateway';

type LoadState = 'loading' | 'ready' | 'missing' | 'failed';

/**
 * One order, for either of its participants: what was agreed, where it stands, the files
 * delivered, and its recorded history. This is the page every order notification links to.
 * Order actions (start, deliver, accept) stay in the dashboard for now, which this page links to.
 */
@Component({
  selector: 'tf-order-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PriceComponent, ProtectedFileViewerComponent, WorkflowHeaderComponent],
  templateUrl: './order-detail-page.component.html',
  styleUrl: './order-detail-page.component.css'
})
export class OrderDetailPageComponent {
  @ViewChild(ProtectedFileViewerComponent) private readonly viewer?: ProtectedFileViewerComponent;
  private readonly route = inject(ActivatedRoute);
  private readonly gateway = inject(OrderDetailGateway);
  private readonly session = inject(SignalSessionStore);
  private readonly title = inject(Title);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);

  readonly orderId = this.route.snapshot.paramMap.get('orderId') ?? '';
  readonly state = signal<LoadState>('loading');
  readonly order = signal<OrderDetail | null>(null);
  readonly timeline = signal<readonly OrderTimelineEvent[]>([]);
  readonly timelineFailed = signal(false);

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
    const key = orderStatusKey(order);
    return this.t(key, ORDER_STATUS_FALLBACK[key]);
  });

  /** The dashboard list this order belongs to for the signed-in participant. */
  readonly dashboardLink = computed(() => {
    const order = this.order();
    const userId = this.session.current()?.userId;
    return order && userId === order.teacherId
      ? { path: '/teacher/work', query: { tab: 'orders', orderId: this.orderId } }
      : { path: '/student/requests', query: { tab: 'orders', orderId: this.orderId } };
  });

  constructor() {
    queueMicrotask(() => this.title.setTitle(`${this.t('order_detail_title', 'Order')} — Tafseel`));
    void this.load();
  }

  t(key: string, fallback = ''): string {
    return this.locale.t(key, fallback);
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.order.set(await firstValueFrom(this.gateway.order(this.orderId)));
      this.state.set('ready');
      this.title.setTitle(`${this.heading()} — Tafseel`);
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      this.state.set(status === 404 || status === 403 || status === 400 ? 'missing' : 'failed');
      return;
    }
    try {
      this.timeline.set(await firstValueFrom(this.gateway.timeline(this.orderId)));
      this.timelineFailed.set(false);
    } catch {
      this.timelineFailed.set(true);
    }
  }

  eventLabel(event: OrderTimelineEvent): string {
    return this.t(`order_timeline_event_${event.eventType}`, event.eventType);
  }

  actorLabel(event: OrderTimelineEvent): string {
    const role = event.actorRole.toLowerCase();
    return this.t(`order_timeline_actor_${role}`, event.actorRole);
  }

  openDelivery(file: OrderDelivery): void {
    void this.viewer?.open(`/api/v1/orders/deliveries/${encodeURIComponent(file.id)}/content`, file.originalName, file.contentType);
  }
}
