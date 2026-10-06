import { SkeletonComponent } from '@shared/components/skeleton.component';
import { ActionFeedbackDirective } from '@shared/directives/action-feedback.directive';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { FinanceWords, ReconciliationCase, ReconciliationSummary } from '../models/finance';
import { FinanceGateway } from '../services/finance.gateway';
import { FINANCE_STYLES, financeShellRole } from './finance-shared';

const FILTERS: readonly (readonly [number | null, string, string])[] = [
  [null, 'fin_filter_unresolved', 'Not resolved'],
  [2, 'fin_exception_resolved', 'Resolved']
];

/**
 * Reconciliation as owned cases. Opening the page runs the checks; each anomaly becomes a case someone
 * acknowledges and resolves with a written explanation. Nothing here changes a balance: a real ledger mistake is
 * corrected through the protected financial workflows, and the case records what was found.
 */
@Component({
  selector: 'tf-finance-reconciliation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SkeletonComponent, ActionFeedbackDirective, RouterLink, PriceComponent, WorkspaceShellComponent],
  template: `
    <tf-workspace-shell [role]="shellRole()" section="finance">
      <div class="tf-fin">
        <header class="tf-fin-head">
          <div>
            <h1>{{ t('fin_recon_title', 'Reconciliation') }}</h1>
            <p>{{ t('fin_recon_intro', 'Every check of the ledger, escrow and payouts. An anomaly becomes a case: acknowledge it while you investigate, then resolve it with what you found. No balance is edited here.') }}</p>
          </div>
          <button type="button" class="tf-button tf-button-secondary" (click)="scan()" [tfActionFeedback]="loading() ? 'busy' : 'idle'" [attr.aria-busy]="loading()" [disabled]="busy()" data-testid="finance-recon-scan">{{ t('fin_recon_run', 'Run the checks again') }}</button>
        </header>
        @if (summary(); as s) {
          <section class="tf-fin-card" aria-labelledby="fin-recon-summary" data-testid="finance-recon-summary">
            <h2 id="fin-recon-summary">{{ s.balanced ? t('fin_home_balanced', 'The ledger reconciles: every check passes.') : t('fin_recon_unbalanced', 'Some checks fail. The cases below say which.') }}</h2>
            <dl class="tf-stat-grid">
              <div class="tf-stat-tile"><dt>{{ t('fin_recon_payments', 'Paid in') }}</dt><dd><tf-price [amount]="s.totalPayments" currency="SAR" /></dd></div>
              <div class="tf-stat-tile"><dt>{{ t('fin_recon_held', 'Held in escrow') }}</dt><dd><tf-price [amount]="s.escrowHeld - s.escrowReleased - s.refunded" currency="SAR" /></dd></div>
              <div class="tf-stat-tile"><dt>{{ t('fin_recon_available', 'Teachers can withdraw') }}</dt><dd><tf-price [amount]="s.teacherAvailable" currency="SAR" /></dd></div>
              <div class="tf-stat-tile"><dt>{{ t('fin_recon_payouts', 'Being paid out') }}</dt><dd><tf-price [amount]="s.pendingWithdrawals" currency="SAR" /></dd></div>
              <div class="tf-stat-tile"><dt>{{ t('fin_recon_revenue', 'Platform revenue') }}</dt><dd><tf-price [amount]="s.platformRevenue" currency="SAR" /></dd></div>
            </dl>
          </section>
        }
        <div class="tf-fin-segments" role="group" [attr.aria-label]="t('fin_recon_filter', 'Show cases')">
          @for (f of filters; track $index) {
            <button type="button" [attr.aria-pressed]="filter() === f[0]" (click)="choose(f[0])">{{ t(f[1], f[2]) }}</button>
          }
        </div>
        @if (loading()) {
          <tf-skeleton kind="queue" [label]="t('common_loading', 'Loading…')" />
        } @else if (error()) {
          <div class="tf-state" data-state="error" role="alert">
            <p class="tf-state-title">{{ t('fin_recon_error', 'We couldn’t run reconciliation.') }}</p>
            <p class="tf-state-body">{{ error() }}</p>
            <button type="button" class="tf-button tf-button-secondary" (click)="scan()" [tfActionFeedback]="loading() ? 'busy' : 'idle'" [attr.aria-busy]="loading()">{{ t('common_retry', 'Try again') }}</button>
          </div>
        } @else if (visible().length) {
          <ul class="tf-fin-cases" data-testid="finance-recon-cases">
            @for (c of visible(); track c.id) {
              <li class="tf-fin-card" data-testid="finance-recon-case">
                <div class="tf-fin-case-head">
                  <h2 class="tf-fin-mono">{{ c.kind }}</h2>
                  <span class="tf-badge" [attr.data-tone]="words(c).tone">{{ t(words(c).labelKey, words(c).fallback) }}</span>
                  @if (!c.detectedInLatestScan) { <span class="tf-badge" data-tone="neutral">{{ t('fin_recon_gone', 'No longer detected') }}</span> }
                </div>
                <p class="tf-fin-muted">{{ c.detail }}</p>
                <dl class="tf-fin-kv">
                  <dt>{{ t('fin_recon_difference', 'Difference') }}</dt><dd><tf-price [amount]="c.difference" currency="SAR" /></dd>
                  <dt>{{ t('fin_recon_first', 'First found') }}</dt><dd>{{ when(c.firstDetectedAt) }}</dd>
                  @if (c.paymentId) { <dt>{{ t('fin_payment_summary', 'Payment') }}</dt><dd><a [routerLink]="['/finance/payments', c.paymentId]">{{ t('fin_recon_open_payment', 'Open the payment') }}</a></dd> }
                  @if (c.acknowledgedByName) { <dt>{{ t('fin_recon_owner', 'Investigating') }}</dt><dd>{{ c.acknowledgedByName }} · {{ when(c.acknowledgedAt) }}@if (c.acknowledgementNote) { — {{ c.acknowledgementNote }} }</dd> }
                  @if (c.resolvedByName) { <dt>{{ t('fin_recon_resolution', 'Resolution') }}</dt><dd>{{ c.resolvedByName }} · {{ when(c.resolvedAt) }} — {{ c.resolutionNote }}</dd> }
                </dl>
                @if (c.status !== 2) {
                  <div class="tf-fin-actions">
                    @if (c.status === 0) { <button type="button" class="tf-button" (click)="annotate(c, 'acknowledge')" [tfActionFeedback]="actionState('acknowledge:' + c.id)" [disabled]="busy()" data-testid="finance-recon-ack">{{ t('fin_recon_ack', 'I am investigating') }}</button> }
                    <button type="button" class="tf-button" [class.tf-button-secondary]="c.status === 0" (click)="annotate(c, 'resolve')" [tfActionFeedback]="actionState('resolve:' + c.id)" [disabled]="busy()" data-testid="finance-recon-resolve">{{ t('fin_recon_resolve', 'Resolve with a note') }}</button>
                  </div>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="tf-fin-empty" data-testid="finance-recon-empty">{{ filter() === 2 ? t('fin_recon_none_resolved', 'No resolved cases yet.') : t('fin_recon_none', 'No open reconciliation cases.') }}</p>
        }
      </div>
    </tf-workspace-shell>
  `,
  styles: [FINANCE_STYLES, `
    .tf-fin-cases { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
    .tf-fin-case-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .tf-fin-case-head h2 { font-size: var(--type-body-sm-size); }
  `]
})
export class FinanceReconciliationPageComponent {
  private readonly gateway = inject(FinanceGateway);
  private readonly session = inject(SESSION_STORE);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);
  readonly filters = FILTERS;
  readonly shellRole = computed(() => financeShellRole(this.session.current()?.roles));
  readonly filter = signal<number | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly activeAction = signal('');
  actionState(key: string): 'busy' | 'idle' { return this.busy() && this.activeAction() === key ? 'busy' : 'idle'; }
  readonly error = signal('');
  readonly summary = signal<ReconciliationSummary | null>(null);
  readonly cases = signal<readonly ReconciliationCase[]>([]);
  readonly visible = computed(() => this.cases().filter(c => this.filter() === 2 ? c.status === 2 : c.status !== 2));

  constructor() {
    inject(Title).setTitle(`${this.t('fin_recon_title', 'Reconciliation')} — Tafseel`);
    void this.scan();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  when(value: string | null): string { return value ? this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
  words(c: ReconciliationCase) { return FinanceWords.exception(c.status); }
  choose(filter: number | null): void { this.filter.set(filter); }

  async scan(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.summary.set(await this.gateway.scan());
      this.cases.set((await this.gateway.exceptions(null)).items);
    } catch (error) {
      this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
    }
  }

  async annotate(c: ReconciliationCase, action: 'acknowledge' | 'resolve'): Promise<void> {
    const note = await this.dialogs.prompt({
      message: action === 'resolve'
        ? this.t('fin_recon_resolve_prompt', 'What did you find, and why can this case close? (at least 10 characters)')
        : this.t('fin_recon_ack_prompt', 'Add a note for the team (optional).'),
      confirmLabel: this.t('common_continue', 'Continue'), cancelLabel: this.t('common_cancel', 'Cancel')
    });
    if (note === null) return;
    this.activeAction.set(action + ':' + c.id);
    this.busy.set(true);
    try {
      const updated = await this.gateway.annotate(c.id, action, note.trim(), c.version);
      this.cases.update(list => list.map(x => x.id === updated.id ? updated : x));
      this.toasts.show(action === 'resolve' ? this.t('fin_recon_resolved_done', 'Case resolved.') : this.t('fin_recon_ack_done', 'You are investigating this case.'));
    } catch (error) {
      this.toasts.show(problemMessage(error, (k, f) => this.t(k, f)).text || this.t('admin_action_failed', 'This could not be done.'));
    } finally {
      this.busy.set(false);
    }
  }
}
