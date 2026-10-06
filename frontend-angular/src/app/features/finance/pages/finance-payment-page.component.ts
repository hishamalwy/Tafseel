import { ActionFeedbackDirective } from '@shared/directives/action-feedback.directive';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { PriceComponent } from '@shared/components/price.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import { FinancePaymentDetail, FinanceWords } from '../models/finance';
import { FinanceGateway } from '../services/finance.gateway';
import { FINANCE_STYLES, financeShellRole } from './finance-shared';

/**
 * One payment's whole trail, read-only: the purchase, the provider's attempts and webhook events, the escrow
 * custody, refunds and every ledger movement. The only action is the existing full refund, offered only when
 * the server's rules would accept it from this person; the server still decides.
 */
@Component({
  selector: 'tf-finance-payment-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionFeedbackDirective, RouterLink, PriceComponent, WorkspaceShellComponent],
  template: `
    <tf-workspace-shell [role]="shellRole()" section="finance">
      <a class="tf-back-link" routerLink="/finance/payments">{{ t('fin_back_payments', 'All payments') }}</a>
      @if (loading()) {
        <div class="tf-state" data-state="loading" role="status">{{ t('common_loading', 'Loading…') }}</div>
      } @else if (error()) {
        <div class="tf-state" data-state="error" role="alert">
          <p class="tf-state-title">{{ t('fin_payment_error', 'We couldn’t load this payment.') }}</p>
          <p class="tf-state-body">{{ error() }}</p>
        </div>
      } @else if (detail(); as d) {
        <div class="tf-fin" data-testid="finance-payment-detail">
          <header class="tf-fin-head">
            <div>
              <h1>{{ d.payment.purchaseTitle || purchase(d.payment.purchaseKind) }}</h1>
              <p><span class="tf-badge" [attr.data-tone]="status().tone" data-testid="finance-payment-state">{{ t(status().labelKey, status().fallback) }}</span></p>
            </div>
            @if (d.refundAvailable) {
              <button type="button" class="tf-button tf-button-secondary is-danger" (click)="refund()" [tfActionFeedback]="actionState('refund')" [disabled]="busy()" data-testid="finance-refund">{{ t('fin_refund', 'Refund in full') }}</button>
            }
          </header>
          @if (!d.refundAvailable && d.refundBlockedReason && d.payment.status === 1) {
            <p class="tf-fin-muted" data-testid="finance-refund-blocked">{{ t('err_' + d.refundBlockedReason, t('fin_refund_blocked', 'A refund is not available for this payment.')) }}</p>
          }

          <section class="tf-fin-card" aria-labelledby="fin-pay-summary">
            <h2 id="fin-pay-summary">{{ t('fin_payment_summary', 'Payment') }}</h2>
            <dl class="tf-fin-kv">
              <dt>{{ t('fin_col_amount', 'Amount') }}</dt><dd><tf-price [amount]="d.payment.amount" [currency]="d.payment.currency" /></dd>
              <dt>{{ t('fin_col_when', 'When') }}</dt><dd>{{ when(d.payment.createdAt) }}</dd>
              <dt>{{ t('fin_col_student', 'Student') }}</dt><dd>{{ d.payment.studentName || '—' }} @if (d.payment.studentEmail) { <span class="tf-fin-mono">{{ d.payment.studentEmail }}</span> }</dd>
              <dt>{{ t('fin_col_teacher', 'Teacher') }}</dt><dd>{{ d.payment.teacherName || '—' }}</dd>
              <dt>{{ t('fin_payment_provider', 'Provider') }}</dt><dd>{{ d.payment.provider }}</dd>
              <dt>{{ t('fin_payment_reference', 'Provider reference') }}</dt><dd class="tf-fin-mono">{{ d.payment.providerReference }}</dd>
              <dt>{{ t('fin_payment_id', 'Payment id') }}</dt><dd class="tf-fin-mono">{{ d.payment.id }}</dd>
            </dl>
          </section>

          @if (d.purchase; as p) {
            <section class="tf-fin-card" aria-labelledby="fin-pay-purchase">
              <h2 id="fin-pay-purchase">{{ purchase(p.kind) }}</h2>
              <dl class="tf-fin-kv">
                <dt>{{ t('fin_purchase_status', 'Status') }}</dt><dd class="tf-fin-mono">{{ p.status }}@if (p.paymentStatus) { · {{ p.paymentStatus }} }</dd>
                <dt>{{ t('fin_purchase_price', 'Price') }}</dt><dd><tf-price [amount]="p.price" [currency]="p.currency" /></dd>
                <dt>{{ t('fin_purchase_id', 'Id') }}</dt><dd class="tf-fin-mono">{{ p.id }}</dd>
              </dl>
              @if (p.hasDispute) { <p class="tf-fin-muted" data-testid="finance-purchase-disputed">{{ t('fin_purchase_disputed', 'This purchase has a dispute. Money follows the dispute decision, not a direct refund.') }}</p> }
            </section>
          }

          <section class="tf-fin-card" aria-labelledby="fin-pay-attempts">
            <h2 id="fin-pay-attempts">{{ t('fin_payment_attempts', 'Provider attempts and events') }}</h2>
            @if (d.attempts.length || d.webhooks.length) {
              <ul class="tf-fin-trail">
                @for (a of d.attempts; track a.id) {
                  <li><strong>{{ attempt(a.status) }}</strong> · {{ when(a.createdAt) }}@if (a.failureCode) { · <span class="tf-fin-mono">{{ a.failureCode }}</span> }</li>
                }
                @for (w of d.webhooks; track w.id) {
                  <li>{{ t('fin_webhook_received', 'Provider event received') }} · {{ when(w.processedAt) }} · <span class="tf-fin-mono">{{ w.eventId }}</span></li>
                }
              </ul>
            } @else { <p class="tf-fin-muted">{{ t('fin_payment_no_events', 'The provider has not reported anything for this payment yet.') }}</p> }
          </section>

          <section class="tf-fin-card" aria-labelledby="fin-pay-custody">
            <h2 id="fin-pay-custody">{{ t('fin_payment_custody', 'Escrow and refunds') }}</h2>
            @if (d.escrow.length || d.refunds.length) {
              <ul class="tf-fin-trail">
                @for (e of d.escrow; track $index) { <li><strong>{{ escrow(e.type) }}</strong> · <tf-price [amount]="e.amount" [currency]="e.currency" /> · {{ when(e.createdAt) }}</li> }
                @for (r of d.refunds; track r.id) { <li><strong>{{ t('fin_refunded_by', 'Refunded') }}</strong> · <tf-price [amount]="r.amount" [currency]="r.currency" /> · {{ r.actorName || '—' }} · {{ when(r.createdAt) }}</li> }
              </ul>
            } @else { <p class="tf-fin-muted">{{ t('fin_payment_no_custody', 'No money is held for this payment.') }}</p> }
          </section>

          <section class="tf-fin-card" aria-labelledby="fin-pay-ledger">
            <h2 id="fin-pay-ledger">{{ t('fin_payment_ledger', 'Ledger movements') }}</h2>
            @if (d.ledger.length) {
              <div class="tf-table-wrap">
                <table class="tf-table" data-phone="cards" data-testid="finance-ledger">
                  <thead><tr><th scope="col">{{ t('fin_col_when', 'When') }}</th><th scope="col">{{ t('fin_ledger_from', 'From') }}</th>
                    <th scope="col">{{ t('fin_ledger_to', 'To') }}</th><th scope="col">{{ t('fin_col_amount', 'Amount') }}</th></tr></thead>
                  <tbody>
                    @for (l of d.ledger; track l.businessKey) {
                      <tr><td [attr.data-label]="t('fin_col_when', 'When')">{{ when(l.createdAt) }}</td><td [attr.data-label]="t('fin_ledger_from', 'From')"><span class="tf-fin-mono">{{ l.debitAccount }}</span></td><td [attr.data-label]="t('fin_ledger_to', 'To')"><span class="tf-fin-mono">{{ l.creditAccount }}</span></td>
                        <td [attr.data-label]="t('fin_col_amount', 'Amount')"><tf-price [amount]="l.amount" [currency]="l.currency" /></td></tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else { <p class="tf-fin-muted">{{ t('fin_payment_no_ledger', 'No ledger movement yet.') }}</p> }
          </section>
        </div>
      }
    </tf-workspace-shell>
  `,
  styles: [FINANCE_STYLES, `
    .tf-fin-trail { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: var(--type-body-sm-size); }
    .tf-fin-trail li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; padding-block: 6px; border-block-end: 1px solid var(--border); }
    .tf-fin-trail li:last-child { border-block-end: 0; }
  `]
})
export class FinancePaymentPageComponent implements OnInit {
  private readonly gateway = inject(FinanceGateway);
  private readonly session = inject(SESSION_STORE);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);
  readonly id = input.required<string>();
  readonly shellRole = computed(() => financeShellRole(this.session.current()?.roles));
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly activeAction = signal('');
  actionState(key: string): 'busy' | 'idle' { return this.busy() && this.activeAction() === key ? 'busy' : 'idle'; }
  readonly error = signal('');
  readonly detail = signal<FinancePaymentDetail | null>(null);
  readonly status = computed(() => { const d = this.detail(); return FinanceWords.payment(d?.payment.status ?? -1, d?.payment.stuck); });
  private refundKey = '';

  constructor() {
    inject(Title).setTitle(`${this.t('fin_payment_summary', 'Payment')} — Tafseel`);
  }

  ngOnInit(): void { void this.load(); }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  when(value: string): string { return value ? this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
  purchase(kind: string): string { const w = FinanceWords.purchase(kind); return this.t(w.labelKey, w.fallback); }
  attempt(status: number): string { const w = FinanceWords.attempt(status); return this.t(w.labelKey, w.fallback); }
  escrow(type: number): string { const w = FinanceWords.escrow(type); return this.t(w.labelKey, w.fallback); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.detail.set(await this.gateway.payment(this.id()));
    } catch (error) {
      this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
    }
  }

  async refund(): Promise<void> {
    const d = this.detail();
    if (!d || this.busy()) return;
    const amount = this.fmt.money(d.payment.amount, d.payment.currency);
    const reason = await this.dialogs.prompt({
      message: this.locale.format('admin_refund_reason', { amount }, 'Refund {amount} in full to the student. Why?'),
      confirmLabel: this.t('common_continue', 'Continue'), cancelLabel: this.t('common_cancel', 'Cancel')
    });
    if (reason === null) return;
    if (!reason.trim()) { this.toasts.show(this.t('admin_reason_required', 'A reason is required.')); return; }
    if (!await this.dialogs.confirm({
      body: this.locale.format('admin_refund_confirm', { amount }, 'Refund {amount}? This cannot be undone.'),
      confirmLabel: this.t('fin_refund', 'Refund in full'), cancelLabel: this.t('common_cancel', 'Cancel'), destructive: true
    })) return;
    this.refundKey ||= crypto.randomUUID();
    this.activeAction.set('refund');
    this.busy.set(true);
    try {
      await this.gateway.refund(d.payment.id, reason.trim(), this.refundKey);
      this.refundKey = '';
      this.toasts.show(this.t('admin_refund_done', 'Refunded.'));
      await this.load();
    } catch (error) {
      this.toasts.show(problemMessage(error, (k, f) => this.t(k, f)).text || this.t('admin_action_failed', 'This could not be done.'));
    } finally {
      this.busy.set(false);
    }
  }
}
