import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { IconComponent } from '@shared/components/icon.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { FinanceAttention } from '../models/finance';
import { FinanceGateway } from '../services/finance.gateway';
import { FINANCE_STYLES, financeShellRole } from './finance-shared';

interface Queue { key: string; labelKey: string; fallback: string; count: number; path: string; query: Record<string, string> | null }

/**
 * The money operator's home: what waits on them, each count opening the list where it is handled. Nothing
 * here moves money; a count they cannot follow would only be a worry.
 */
@Component({
  selector: 'tf-finance-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, WorkspaceShellComponent],
  template: `
    <tf-workspace-shell [role]="shellRole()" section="finance">
      <div class="tf-fin">
        <header class="tf-fin-head">
          <div>
            <h1>{{ t('fin_home_title', 'Needs attention') }}</h1>
            <p>{{ t('fin_home_intro', 'Money that waits on the finance team: payouts to send, details to check, payments to investigate and accounts to reconcile.') }}</p>
          </div>
        </header>
        @if (loading()) {
          <div class="tf-state" data-state="loading" role="status">{{ t('common_loading', 'Loading…') }}</div>
        } @else if (error()) {
          <div class="tf-state" data-state="error" role="alert">
            <p class="tf-state-title">{{ t('fin_home_error', 'We couldn’t load the finance queues.') }}</p>
            <p class="tf-state-body">{{ error() }}</p>
            <button type="button" class="tf-button tf-button-secondary" (click)="load()">{{ t('common_retry', 'Try again') }}</button>
          </div>
        } @else if (attention(); as a) {
          @if (queues().length) {
            <ul class="tf-fin-queues" data-testid="finance-queues">
              @for (q of queues(); track q.key) {
                <li>
                  <a [routerLink]="q.path" [queryParams]="q.query" [attr.data-testid]="'finance-queue-' + q.key">
                    <strong>{{ fmt.number(q.count) }}</strong><span>{{ t(q.labelKey, q.fallback) }}</span>
                    <tf-icon class="tf-fin-go" name="arrow-right" [size]="18" />
                  </a>
                </li>
              }
            </ul>
          } @else {
            <p class="tf-fin-empty" data-testid="finance-clear">{{ t('fin_home_clear', 'Nothing is waiting on the finance team right now.') }}</p>
          }
          <p class="tf-fin-ledger" [attr.data-balanced]="a.ledgerBalanced" data-testid="finance-ledger-state">
            {{ a.ledgerBalanced ? t('fin_home_balanced', 'The ledger reconciles: every check passes.')
              : t('fin_home_unbalanced', 'The ledger has anomalies. Open Reconciliation to investigate them.') }}
          </p>
        }
      </div>
    </tf-workspace-shell>
  `,
  styles: [FINANCE_STYLES, `
    .tf-fin-queues { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .tf-fin-queues a { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; column-gap: 16px;
      padding: 16px 20px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface);
      color: inherit; text-decoration: none; transition: border-color var(--motion-fast) ease; }
    .tf-fin-queues li:first-child a { border-color: color-mix(in oklab, var(--primary) 34%, var(--border));
      background: color-mix(in oklab, var(--primary-soft) 55%, var(--surface)); }
    .tf-fin-queues a:hover { border-color: var(--primary); }
    .tf-fin-queues strong { font-size: 28px; line-height: 1; min-width: 2ch; font-variant-numeric: tabular-nums; }
    .tf-fin-queues span { font-size: 15px; font-weight: 650; }
    .tf-fin-go { color: var(--primary); }
    .tf-fin-ledger { margin: 0; padding: 12px 16px; border-radius: var(--r-md); font-size: 14px; font-weight: 600; }
    .tf-fin-ledger[data-balanced='true'] { background: var(--success-soft); color: var(--success); }
    .tf-fin-ledger[data-balanced='false'] { background: var(--warning-soft); color: var(--warning); }
    @media (prefers-reduced-motion: reduce) { .tf-fin-queues a { transition: none; } }
  `]
})
export class FinanceHomePageComponent {
  private readonly gateway = inject(FinanceGateway);
  private readonly session = inject(SESSION_STORE);
  readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);
  readonly shellRole = computed(() => financeShellRole(this.session.current()?.roles));
  readonly loading = signal(true);
  readonly error = signal('');
  readonly attention = signal<FinanceAttention | null>(null);
  readonly queues = computed<readonly Queue[]>(() => {
    const a = this.attention();
    if (!a) return [];
    const all: Queue[] = [
      { key: 'withdrawals', labelKey: 'fin_queue_withdrawals', fallback: 'Withdrawals to send', count: a.withdrawalsAwaitingTransfer, path: '/finance/withdrawals', query: null },
      { key: 'evidence', labelKey: 'fin_queue_evidence', fallback: 'Transfers started, waiting for the bank’s evidence', count: a.transfersAwaitingEvidence, path: '/finance/withdrawals', query: { status: '3' } },
      { key: 'payout-profiles', labelKey: 'fin_queue_payout_profiles', fallback: 'Payout details to verify', count: a.payoutProfilesAwaitingReview, path: '/finance/payout-profiles', query: null },
      { key: 'stuck', labelKey: 'fin_queue_stuck', fallback: 'Payments stuck at checkout', count: a.stuckPayments, path: '/finance/payments', query: { status: 'stuck' } },
      { key: 'failed', labelKey: 'fin_queue_failed', fallback: 'Payments that failed in the last 24 hours', count: a.failedPaymentsLast24Hours, path: '/finance/payments', query: { status: 'failed-recently' } },
      { key: 'exceptions', labelKey: 'fin_queue_exceptions', fallback: 'Reconciliation cases open', count: a.openReconciliationExceptions, path: '/finance/reconciliation', query: null }
    ];
    return all.filter(q => q.count > 0);
  });

  constructor() {
    inject(Title).setTitle(`${this.t('fin_home_title', 'Needs attention')} — Tafseel`);
    void this.load();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.attention.set(await this.gateway.attention());
    } catch (error) {
      this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
    }
  }
}
