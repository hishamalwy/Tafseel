import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { Title } from '@angular/platform-browser';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { ToastService } from '@shared/services/toast.service';
import { ToastComponent } from '@shared/components/toast.component';
import { PriceComponent } from '@shared/components/price.component';
import { PricePanelComponent } from '@shared/components/price-panel.component';
import { WorkflowHeaderComponent } from '@shared/layouts/workflow-header.component';
import { CheckoutContext, InitiatePayment, LoadCheckoutContext } from '../services/checkout.use-cases';
import { PayableKind, mockReference } from '../models/payable';

/**
 * Checkout — ported from `Tafseel-Payment.dc.html`.
 *
 * The screen pays for either an order or a live-session booking. The legacy
 * version branched on `kind` throughout `renderVals`; here that difference is
 * resolved once, in `Payable.fromOrder` / `fromLiveSession`, and this component
 * only renders a payable.
 */
@Component({
  selector: 'tf-payment-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, WorkflowHeaderComponent, ToastComponent, PriceComponent, PricePanelComponent],
  templateUrl: './payment-page.component.html',
  styleUrl: './payment-page.component.css'
})
export class PaymentPageComponent {
  private readonly loadContext = inject(LoadCheckoutContext);
  private readonly initiate = inject(InitiatePayment);
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
  readonly context = signal<CheckoutContext | null>(null);
  readonly checkoutReference = signal('');

  readonly initiated = computed(() => this.checkoutReference() !== '');
  readonly showCheckout = computed(() =>
    !this.loading() && !this.unavailable() && !this.initiated() && this.context() !== null);

  constructor() {
    queueMicrotask(() => this.title.setTitle(this.t('pay_breadcrumb', 'Payment') + ' — Tafseel'));

    const q = this.route.snapshot.queryParamMap;
    const orderId = (q.get('orderId') ?? '').trim();
    const sessionId = (q.get('liveSessionId') ?? '').trim();
    const requestId = (q.get('learningRequestId') ?? '').trim();
    this.kind = orderId ? 'order' : requestId ? 'open-request' : 'live-session';
    this.payableId = orderId || requestId || sessionId;
    const timer = setInterval(() => this.tick(), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    void this.load(this.kind, this.payableId);
  }

  kind: PayableKind = 'order';
  payableId = '';
  readonly now = signal(Date.now());
  readonly payError = signal('');
  /** Seconds left on an open request's reservation; display only, the server decides at payment. */
  readonly reservationSeconds = computed(() => {
    const expires = Date.parse(this.context()?.payable.reservationExpiresAt ?? '');
    return Number.isNaN(expires) ? null : Math.max(0, Math.floor((expires - this.now()) / 1000));
  });
  readonly reservationClock = computed(() => {
    const s = this.reservationSeconds() ?? 0;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });

  private tick(): void {
    this.now.set(Date.now());
    if (this.kind === 'open-request' && this.reservationSeconds() === 0 && this.context() && !this.submitting()) {
      this.context.set(null);
      this.unavailable.set(true);
    }
  }

  t(key: string, fallback = ''): string {
    return this.locale.t(key, fallback);
  }

  // ---- context panel ----
  readonly teacherName = computed(() => {
    const teacher = this.context()?.teacher;
    return teacher ? this.fmt.userName(teacher) : '—';
  });

  readonly teacherAvatar = computed(() => {
    const teacher = this.context()?.teacher;
    return this.fmt.avatarUrl(teacher?.id, !!teacher?.hasAvatar, null, this.teacherName());
  });

  readonly serviceName = computed(() => {
    const payable = this.context()?.payable;
    if (!payable) return '—';
    return payable.kind === 'live-session'
      ? this.t(payable.subtitleKey, 'Live session')
      : (payable.title || this.t('pay_order_title', 'Order'));
  });

  readonly deliveryValue = computed(() => {
    const payable = this.context()?.payable;
    return payable?.agreedDeliveryAt ? this.fmt.dateOnly(payable.agreedDeliveryAt) : '—';
  });

  readonly revisionsValue = computed(() => {
    const allowance = Number(this.context()?.payable.revisionAllowance ?? 0);
    if (allowance <= 0) return this.t('tp_no_revisions', 'No revisions');
    return `${allowance} ${this.t('tp_free_revisions', 'free revisions')}`;
  });

  readonly filesValue = computed(() => {
    const count = this.context()?.attachmentCount;
    return count == null ? '—' : String(count);
  });

  readonly categoryValue = computed(() => {
    const payable = this.context()?.payable;
    if (!payable) return '—';
    if (payable.kind === 'open-request') return this.t('pay_open_request_title', 'Open request');
    if (payable.kind !== 'order') return this.t('pay_live_session_title', 'Live session');
    if (!payable.categoryCode) return '—';
    // The legacy helper fell back to the raw code when no translation existed;
    // `t()` already does exactly that.
    return this.t('admin_service_category_' + payable.categoryCode.trim().toLowerCase(),
                  payable.categoryCode);
  });

  readonly priceLines = computed(() => {
    const payable = this.context()?.payable;
    if (!payable) return [];
    return payable.lines.map(line => ({
      label: this.t(line.labelKey, ''),
      ...this.fmt.moneyView(line.amount, payable.currency)
    }));
  });

  readonly total = computed(() => {
    const payable = this.context()?.payable;
    return payable
      ? this.fmt.moneyView(payable.total, payable.currency)
      : this.fmt.moneyView(null);
  });

  readonly mockContinueLink = computed(() => {
    const payable = this.context()?.payable;
    if (!payable || !this.context()?.canResumeMock) return null;
    return mockReference(payable.id);
  });

  readonly nextSteps = computed(() => [1, 2, 3, 4].map(n => ({
    n: String(n),
    text: this.t(`pay_next_${n}`, '')
  })));

  // ---- actions ----
  async load(kind: PayableKind, id: string): Promise<void> {
    this.loading.set(true);
    try {
      const context = await this.loadContext.execute(kind, id, this.locale.lang() === 'ar');
      if (!context) {
        this.unavailable.set(true);
        return;
      }
      this.context.set(context);
      this.unavailable.set(false);
    } catch {
      this.unavailable.set(true);
      this.toasts.show(this.t('pay_unavailable_body', 'This payment is not available.'));
    } finally {
      this.loading.set(false);
    }
  }

  async pay(): Promise<void> {
    const context = this.context();
    if (!context || this.submitting()) return;

    this.submitting.set(true);
    this.payError.set('');
    try {
      const outcome = await this.initiate.execute(context.payable, context.mockEnabled);
      switch (outcome.kind) {
        case 'redirect':
          this.document.location.href = outcome.url;
          return;
        case 'mock':
        case 'resume-mock':
          if (outcome.kind === 'resume-mock') {
            this.toasts.show(this.t('pay_already_resume', 'Resuming your existing checkout.'));
          }
          await this.router.navigate(['/checkout/simulator'], {
            queryParams: { ref: outcome.reference }
          });
          return;
        case 'initiated':
          this.checkoutReference.set(outcome.reference);
          return;
      }
    } catch (error) {
      const problem = problemMessage(error, (k, f) => this.t(k, f));
      this.payError.set(problem.text || this.t('pay_failed', 'Payment could not start.'));
      // An open request whose reservation lapsed is no longer payable; read it again.
      if (this.kind === 'open-request') await this.load(this.kind, this.payableId);
    } finally {
      this.submitting.set(false);
    }
  }

  /** Where to send the student back to after a completed initiation. */
  readonly dashboardLink = '/student';
}
