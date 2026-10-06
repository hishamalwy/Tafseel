import { SkeletonComponent } from '@shared/components/skeleton.component';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { PriceComponent } from '@shared/components/price.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { FinancePayment, FinanceWords, Page } from '../models/finance';
import { FinanceGateway } from '../services/finance.gateway';
import { FINANCE_STYLES, financeShellRole } from './finance-shared';

const STATUSES = [
  ['', 'fin_filter_all', 'All payments'],
  ['stuck', 'fin_filter_stuck', 'Stuck at checkout'],
  ['failed-recently', 'fin_filter_failed', 'Failed attempt (24 h)'],
  ['Pending', 'fin_payment_pending', 'Awaiting the provider'],
  ['Confirmed', 'fin_payment_confirmed', 'Paid'],
  ['Refunded', 'fin_payment_refunded', 'Refunded']
] as const;

/**
 * Payment investigation: find a payment by its id, the order, session or request it paid for, the provider's
 * reference, or the student's or teacher's name or email, then open its whole trail.
 */
@Component({
  selector: 'tf-finance-payments-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SkeletonComponent, FormsModule, RouterLink, PriceComponent, WorkspaceShellComponent],
  template: `
    <tf-workspace-shell [role]="shellRole()" section="finance">
      <div class="tf-fin">
        <header class="tf-fin-head">
          <div>
            <h1>{{ t('fin_payments_title', 'Payments') }}</h1>
            <p>{{ t('fin_payments_intro', 'Find a payment by an id (payment, order, session or request), the provider’s reference, or a student’s or teacher’s name or email.') }}</p>
          </div>
        </header>
        <form class="tf-fin-toolbar" (ngSubmit)="search()" role="search" [attr.aria-label]="t('fin_payments_search', 'Search payments')">
          <div class="tf-field">
            <label for="fin-pay-q">{{ t('fin_payments_query', 'Id, reference, name or email') }}</label>
            <input autocomplete="off" id="fin-pay-q" name="q" type="search" maxlength="200" [ngModel]="query()" (ngModelChange)="query.set($event)" data-testid="finance-payment-query">
          </div>
          <div class="tf-field tf-field--narrow">
            <label for="fin-pay-status">{{ t('fin_payments_status', 'Status') }}</label>
            <select id="fin-pay-status" name="status" [ngModel]="status()" (ngModelChange)="status.set($event); search()" data-testid="finance-payment-status">
              @for (s of statuses; track s[0]) { <option [value]="s[0]">{{ t(s[1], s[2]) }}</option> }
            </select>
          </div>
          <button type="submit" class="tf-button" data-testid="finance-payment-search">{{ t('common_search', 'Search') }}</button>
        </form>

        @if (loading()) {
          <tf-skeleton kind="table" [label]="t('common_loading', 'Loading…')" />
        } @else if (error()) {
          <div class="tf-state" data-state="error" role="alert">
            <p class="tf-state-title">{{ t('fin_payments_error', 'We couldn’t search payments.') }}</p>
            <p class="tf-state-body">{{ error() }}</p>
            <button type="button" class="tf-button tf-button-secondary" (click)="load()">{{ t('common_retry', 'Try again') }}</button>
          </div>
        } @else if (result(); as r) {
          @if (r.items.length) {
            <div class="tf-table-wrap">
              <table class="tf-table" data-density="dense" data-phone="cards" data-testid="finance-payments">
                <thead><tr>
                  <th scope="col">{{ t('fin_col_when', 'When') }}</th>
                  <th scope="col">{{ t('fin_col_for', 'For') }}</th>
                  <th scope="col">{{ t('fin_col_student', 'Student') }}</th>
                  <th scope="col">{{ t('fin_col_teacher', 'Teacher') }}</th>
                  <th scope="col">{{ t('fin_col_amount', 'Amount') }}</th>
                  <th scope="col">{{ t('fin_col_status', 'Status') }}</th>
                </tr></thead>
                <tbody>
                  @for (p of r.items; track p.id) {
                    <tr data-testid="finance-payment-row">
                      <td [attr.data-label]="t('fin_col_when', 'When')">{{ when(p.createdAt) }}</td>
                      <td [attr.data-label]="t('fin_col_for', 'For')"><span><a [routerLink]="['/finance/payments', p.id]" data-testid="finance-payment-open">{{ p.purchaseTitle || purchase(p.purchaseKind) }}</a>
                        <br><small class="tf-fin-muted">{{ purchase(p.purchaseKind) }}</small></span></td>
                      <td [attr.data-label]="t('fin_col_student', 'Student')"><span>{{ p.studentName || '—' }}@if (p.studentEmail) { <br><small class="tf-fin-muted tf-fin-mono">{{ p.studentEmail }}</small> }</span></td>
                      <td [attr.data-label]="t('fin_col_teacher', 'Teacher')">{{ p.teacherName || '—' }}</td>
                      <td [attr.data-label]="t('fin_col_amount', 'Amount')"><tf-price [amount]="p.amount" [currency]="p.currency" /></td>
                      <td [attr.data-label]="t('fin_col_status', 'Status')"><span><span class="tf-badge" [attr.data-tone]="words(p).tone">{{ t(words(p).labelKey, words(p).fallback) }}</span>
                        @if (p.failedAttempts) { <br><small class="tf-fin-muted">{{ locale.format('fin_failed_attempts', { n: p.failedAttempts }, 'Failed attempts: {n}') }}</small> }</span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (pages() > 1) {
              <nav class="tf-fin-pager" [attr.aria-label]="t('common_pagination', 'Pages')">
                <button type="button" class="tf-button tf-button-ghost" (click)="go(page() - 1)" [disabled]="page() <= 1">{{ t('common_previous', 'Previous') }}</button>
                <span>{{ locale.format('common_page_of', { page: page(), pages: pages() }, 'Page {page} of {pages}') }}</span>
                <button type="button" class="tf-button tf-button-ghost" (click)="go(page() + 1)" [disabled]="page() >= pages()">{{ t('common_next', 'Next') }}</button>
              </nav>
            }
          } @else {
            <p class="tf-fin-empty" data-testid="finance-payments-empty">{{ t('fin_payments_empty', 'No payment matches this search.') }}</p>
          }
        }
      </div>
    </tf-workspace-shell>
  `,
  styles: [FINANCE_STYLES]
})
export class FinancePaymentsPageComponent {
  private readonly gateway = inject(FinanceGateway);
  private readonly session = inject(SESSION_STORE);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);
  readonly statuses = STATUSES;
  readonly shellRole = computed(() => financeShellRole(this.session.current()?.roles));
  readonly query = signal(this.route.snapshot.queryParamMap.get('query') ?? '');
  readonly status = signal(this.route.snapshot.queryParamMap.get('status') ?? '');
  readonly page = signal(Math.max(1, Number(this.route.snapshot.queryParamMap.get('page') ?? 1) || 1));
  readonly loading = signal(true);
  readonly error = signal('');
  readonly result = signal<Page<FinancePayment> | null>(null);
  readonly pages = computed(() => { const r = this.result(); return r ? Math.max(1, Math.ceil(r.total / r.pageSize)) : 1; });

  constructor() {
    inject(Title).setTitle(`${this.t('fin_payments_title', 'Payments')} — Tafseel`);
    void this.load();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  when(value: string): string { return this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }); }
  words(p: FinancePayment) { return FinanceWords.payment(p.status, p.stuck); }
  purchase(kind: string): string { const w = FinanceWords.purchase(kind); return this.t(w.labelKey, w.fallback); }

  search(): void { this.go(1); }

  go(page: number): void {
    this.page.set(Math.max(1, page));
    void this.router.navigate([], {
      relativeTo: this.route, replaceUrl: true,
      queryParams: { query: this.query() || null, status: this.status() || null, page: this.page() > 1 ? this.page() : null }
    });
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.result.set(await this.gateway.payments(this.query(), this.status(), this.page()));
    } catch (error) {
      this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
    }
  }
}
