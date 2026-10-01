import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { FinancialAuditEntry, Page } from '../models/finance';
import { FinanceGateway } from '../services/finance.gateway';
import { FINANCE_STYLES, financeShellRole } from './finance-shared';

/** Who did what with money, read-only: refunds, payout checks, transfers, instruction views and case notes. */
@Component({
  selector: 'tf-finance-audit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, WorkspaceShellComponent],
  template: `
    <tf-workspace-shell [role]="shellRole()" section="finance">
      <div class="tf-fin">
        <header class="tf-fin-head">
          <div>
            <h1>{{ t('fin_audit_title', 'Financial audit') }}</h1>
            <p>{{ t('fin_audit_intro', 'Every money action and every view of full bank details, with who did it and when. It cannot be edited.') }}</p>
          </div>
        </header>
        <form class="tf-fin-toolbar" (ngSubmit)="go(1)" role="search" [attr.aria-label]="t('fin_audit_search', 'Search the financial audit')">
          <div class="tf-field">
            <label for="fin-audit-q">{{ t('fin_audit_query', 'Action, record id or person') }}</label>
            <input id="fin-audit-q" name="q" type="search" maxlength="200" [ngModel]="query()" (ngModelChange)="query.set($event)">
          </div>
          <button type="submit" class="tf-button">{{ t('common_search', 'Search') }}</button>
        </form>
        @if (loading()) {
          <div class="tf-state" data-state="loading" role="status">{{ t('common_loading', 'Loading…') }}</div>
        } @else if (error()) {
          <div class="tf-state" data-state="error" role="alert">
            <p class="tf-state-title">{{ t('fin_audit_error', 'We couldn’t load the financial audit.') }}</p>
            <p class="tf-state-body">{{ error() }}</p>
          </div>
        } @else if (result(); as r) {
          @if (r.items.length) {
            <div class="tf-table-wrap">
              <table class="tf-table" data-density="dense" data-phone="cards" data-testid="finance-audit">
                <thead><tr>
                  <th scope="col">{{ t('fin_col_when', 'When') }}</th>
                  <th scope="col">{{ t('fin_audit_action', 'Action') }}</th>
                  <th scope="col">{{ t('fin_audit_actor', 'Who') }}</th>
                  <th scope="col">{{ t('fin_audit_record', 'Record') }}</th>
                </tr></thead>
                <tbody>
                  @for (e of r.items; track e.id) {
                    <tr data-testid="finance-audit-row">
                      <td [attr.data-label]="t('fin_col_when', 'When')">{{ when(e.createdAt) }}</td>
                      <td [attr.data-label]="t('fin_audit_action', 'Action')">{{ action(e.action) }}</td>
                      <td [attr.data-label]="t('fin_audit_actor', 'Who')">{{ e.actorName || e.actorId }}</td>
                      <td [attr.data-label]="t('fin_audit_record', 'Record')"><span class="tf-fin-mono">{{ e.entityType }} · {{ e.entityId }}</span></td>
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
            <p class="tf-fin-empty">{{ t('fin_audit_empty', 'Nothing matches this search.') }}</p>
          }
        }
      </div>
    </tf-workspace-shell>
  `,
  styles: [FINANCE_STYLES]
})
export class FinanceAuditPageComponent {
  private readonly gateway = inject(FinanceGateway);
  private readonly session = inject(SESSION_STORE);
  readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);
  readonly shellRole = computed(() => financeShellRole(this.session.current()?.roles));
  readonly query = signal('');
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly result = signal<Page<FinancialAuditEntry> | null>(null);
  readonly pages = computed(() => { const r = this.result(); return r ? Math.max(1, Math.ceil(r.total / r.pageSize)) : 1; });

  constructor() {
    inject(Title).setTitle(`${this.t('fin_audit_title', 'Financial audit')} — Tafseel`);
    void this.load();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  when(value: string): string { return this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }); }
  /** Known actions read as words; an unknown one shows its code rather than nothing. */
  action(code: string): string { return this.t('fin_action_' + code, code); }

  go(page: number): void { this.page.set(Math.max(1, page)); void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.result.set(await this.gateway.audit(this.query(), this.page()));
    } catch (error) {
      this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
    }
  }
}
