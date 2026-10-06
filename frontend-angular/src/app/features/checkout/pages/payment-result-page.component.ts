import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LocaleService } from '@core/i18n/locale.service';
import { PriceComponent } from '@shared/components/price.component';
import { SkipLinkComponent } from '@shared/layouts/skip-link.component';
import { WorkflowHeaderComponent } from '@shared/layouts/workflow-header.component';
import { PAYMENT_GATEWAY, PaymentState } from '../services/checkout.ports';
import { GUID } from '../models/payable';

@Component({
  selector: 'tf-payment-result-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PriceComponent, SkipLinkComponent, WorkflowHeaderComponent],
  templateUrl: './payment-result-page.component.html',
  styleUrl: './payment-result-page.component.css'
})
export class PaymentResultPageComponent {
  readonly locale = inject(LocaleService);
  private readonly gateway = inject(PAYMENT_GATEWAY);
  private readonly route = inject(ActivatedRoute);
  private destroyed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private checks = 0;
  readonly state = signal<'verifying' | 'confirmed' | 'failed' | 'processing' | 'unknown' | 'refunded'>('verifying');
  readonly payment = signal<PaymentState['payment'] | null>(null);
  readonly busy = signal(false);
  readonly purchaseLink = computed(() => {
    const payment = this.payment();
    return payment?.orderId ? ['/orders', payment.orderId]
      : payment?.liveSessionBookingId ? ['/live-sessions', payment.liveSessionBookingId]
      : payment?.learningRequestId ? ['/requests', payment.learningRequestId] : ['/student'];
  });
  readonly tone = computed(() => this.state() === 'confirmed' ? 'success' : this.state() === 'failed' ? 'danger' : 'neutral');

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      if (this.timer) clearTimeout(this.timer);
    });
    void this.check();
  }

  t(key: string): string { return this.locale.t(key); }

  async retry(): Promise<void> {
    this.checks = 0;
    this.state.set('verifying');
    await this.check();
  }

  async check(): Promise<void> {
    if (this.busy() || this.destroyed) return;
    const id = this.route.snapshot.queryParamMap.get('paymentId') ?? '';
    if (!GUID.test(id)) { this.state.set('unknown'); return; }
    this.busy.set(true);
    try {
      // Redirect success, amount, currency and HMAC parameters are never read as payment evidence.
      const result = await firstValueFrom(this.gateway.state(id));
      if (this.destroyed) return;
      this.payment.set(result.payment);
      if (result.state === 'Confirmed') this.state.set('confirmed');
      else if (result.state === 'Failed') this.state.set('failed');
      else if (result.state === 'Refunded') this.state.set('refunded');
      else if (++this.checks < 12) this.timer = setTimeout(() => void this.check(), 2500);
      else this.state.set('processing');
    } catch {
      if (!this.destroyed) this.state.set('unknown');
    } finally {
      this.busy.set(false);
    }
  }
}
