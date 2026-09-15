import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { ToastService } from '@shared/services/toast.service';
import { ToastComponent } from '@shared/components/toast.component';
import { PriceComponent } from '@shared/components/price.component';
import { WorkflowHeaderComponent } from '@shared/layouts/workflow-header.component';
import { MOCK_CHECKOUT_GATEWAY, MockCheckoutSession, PAYABLE_GATEWAY } from '../services/checkout.ports';
import { OrderLike } from '../models/payable';

const AUTO_RETURN_SECONDS = 8;
const DEFAULT_RETURN = '/student';

/**
 * The payment simulator — ported from `Tafseel-Mock-Checkout.dc.html`.
 *
 * Stands in for a real provider in non-production environments: it shows what is
 * being paid for and lets you confirm or fail the payment. It refuses to render
 * at all unless the deployment reports the simulator as enabled, which is what
 * keeps it from being reachable in production.
 *
 * After a confirmed payment it counts down and returns on its own, so the flow
 * behaves like a provider redirect rather than leaving the student on a dead end.
 */
@Component({
  selector: 'tf-payment-simulator-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, WorkflowHeaderComponent, ToastComponent, PriceComponent],
  templateUrl: './payment-simulator-page.component.html',
  styleUrl: './payment-simulator-page.component.css'
})
export class PaymentSimulatorPageComponent {
  private readonly mock = inject(MOCK_CHECKOUT_GATEWAY);
  private readonly payables = inject(PAYABLE_GATEWAY);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly toasts = inject(ToastService);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);

  readonly loading = signal(true);
  readonly unavailable = signal(false);
  readonly submitting = signal(false);
  readonly session = signal<MockCheckoutSession | null>(null);
  readonly order = signal<OrderLike | null>(null);
  readonly outcome = signal<'confirmed' | 'failed' | null>(null);
  readonly countdown = signal(0);
  private returnPath = DEFAULT_RETURN;
  private timer: ReturnType<typeof setInterval> | undefined;

  readonly confirmed = computed(() =>
    this.outcome() === 'confirmed' || this.session()?.confirmed === true);
  readonly failed = computed(() => this.outcome() === 'failed' && !this.confirmed());
  /** Actions show only while the payment is still undecided. */
  readonly showActions = computed(() => this.session() !== null && !this.confirmed() && !this.failed());

  constructor() {
    queueMicrotask(() =>
      this.title.setTitle(this.t('mock_pay_breadcrumb', 'Payment simulator') + ' — Tafseel'));

    inject(DestroyRef).onDestroy(() => this.stopCountdown());
    void this.load((this.route.snapshot.queryParamMap.get('ref') ?? '').trim());
  }

  t(key: string, fallback = ''): string {
    return this.locale.t(key, fallback);
  }

  readonly teacherName = computed(() => {
    const order = this.order();
    return order ? this.fmt.partyName(order, 'teacher') : '';
  });

  readonly serviceName = computed(() => {
    const order = this.order();
    if (!order) return '';
    const arabic = this.locale.lang() === 'ar';
    return (arabic ? order.serviceNameArabic : order.serviceNameEnglish)
      || order.serviceNameEnglish || order.serviceNameArabic
      || this.t('pay_order_title', 'Order');
  });

  readonly deliveryValue = computed(() => {
    const at = this.order()?.agreedDeliveryAt;
    return at ? this.fmt.dateOnly(at) : '—';
  });

  readonly cancelLink = computed(() => {
    const session = this.session();
    const orderId = session?.orderId ?? this.order()?.id ?? '';
    const query: Record<string, string> = orderId ? { orderId }
      : session?.liveSessionBookingId ? { liveSessionId: session.liveSessionBookingId }
      : session?.learningRequestId ? { learningRequestId: session.learningRequestId } : {};
    return Object.keys(query).length ? { path: '/checkout', query } : { path: DEFAULT_RETURN, query };
  });

  async load(reference: string): Promise<void> {
    this.loading.set(true);
    if (!reference) {
      this.unavailable.set(true);
      this.loading.set(false);
      return;
    }

    try {
      const session = await firstValueFrom(this.mock.session(reference));
      this.session.set(session);
      // Back to what was paid for: the order, the live session, or the request that becomes an order.
      this.returnPath = session.orderId ? `/orders/${session.orderId}`
        : session.liveSessionBookingId ? `/live-sessions/${session.liveSessionBookingId}`
        : session.learningRequestId ? `/requests/${session.learningRequestId}?paid=1` : DEFAULT_RETURN;
      if (session.confirmed) this.outcome.set('confirmed');

      // Order context is a nicety; the simulator works without it.
      if (session.orderId) {
        try {
          const orders = await firstValueFrom(this.payables.myOrders());
          this.order.set(orders.find(
            o => String(o.id).toLowerCase() === session.orderId!.toLowerCase()) ?? null);
        } catch { this.order.set(null); }
      }
      this.unavailable.set(false);
    } catch {
      this.unavailable.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async complete(succeeded: boolean): Promise<void> {
    const session = this.session();
    if (!session || this.submitting()) return;

    this.submitting.set(true);
    try {
      const result = await firstValueFrom(
        this.mock.complete(session.providerReference, succeeded, this.returnPath));

      if (result.confirmed) {
        this.outcome.set('confirmed');
        this.toasts.show(this.t('mock_pay_toast_confirmed', 'Payment confirmed.'));
        this.startCountdown(result.returnUrl ?? this.returnPath);
      } else {
        this.outcome.set('failed');
        this.toasts.show(this.t('mock_pay_toast_failed', 'Payment failed.'));
      }
    } catch {
      this.toasts.show(this.t('mock_pay_failed', 'Could not complete.'));
    } finally {
      this.submitting.set(false);
    }
  }

  /** Cancel the auto-return if the student would rather stay and read. */
  stopCountdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.countdown.set(0);
  }

  private startCountdown(path: string): void {
    this.stopCountdown();
    this.returnPath = path;
    this.countdown.set(AUTO_RETURN_SECONDS);
    this.timer = setInterval(() => {
      const next = this.countdown() - 1;
      if (next <= 0) {
        this.stopCountdown();
        void this.leave(path);
        return;
      }
      this.countdown.set(next);
    }, 1000);
  }

  /** An in-app path routes; anything else is a real navigation. */
  private async leave(path: string): Promise<void> {
    if (path.startsWith('/app/') || /^https?:/i.test(path)) {
      this.document.location.href = path;
      return;
    }
    await this.router.navigateByUrl(path.startsWith('/') ? path : DEFAULT_RETURN);
  }

  returnNow(): void {
    this.stopCountdown();
    void this.leave(this.returnPath);
  }
}
