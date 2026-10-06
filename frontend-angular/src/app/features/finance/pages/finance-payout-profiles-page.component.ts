import { SkeletonComponent } from '@shared/components/skeleton.component';
import { ActionFeedbackDirective } from '@shared/directives/action-feedback.directive';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import { FinanceWords, Page, PayoutProfileRow } from '../models/finance';
import { FinanceGateway } from '../services/finance.gateway';
import { FINANCE_STYLES, financeShellRole } from './finance-shared';

const FILTERS: readonly (readonly [number | null, string, string])[] = [
  [0, 'fin_payout_pending', 'Awaiting verification'],
  [1, 'fin_payout_verified', 'Verified'],
  [2, 'fin_payout_rejected_short', 'Returned'],
  [null, 'fin_filter_all_withdrawals', 'All']
];

/**
 * Payout details to verify. The operator compares the account holder's name with the teacher's identity; the
 * IBAN's format and checksum were already checked when it was saved, and it is only ever shown in a transfer
 * instruction. Nobody verifies their own details (the server refuses).
 */
@Component({
  selector: 'tf-finance-payout-profiles-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SkeletonComponent, ActionFeedbackDirective, WorkspaceShellComponent],
  template: `
    <tf-workspace-shell [role]="shellRole()" section="finance">
      <div class="tf-fin">
        <header class="tf-fin-head">
          <div>
            <h1>{{ t('fin_payouts_title', 'Payout details') }}</h1>
            <p>{{ t('fin_payouts_intro', 'Check that the account holder is the teacher before verifying. A teacher can withdraw only to verified details; any change to them needs verifying again.') }}</p>
          </div>
        </header>
        <div class="tf-fin-segments" role="group" [attr.aria-label]="t('fin_payouts_filter', 'Show payout details')">
          @for (f of filters; track $index) {
            <button type="button" [attr.aria-pressed]="filter() === f[0]" (click)="choose(f[0])">{{ t(f[1], f[2]) }}</button>
          }
        </div>
        @if (loading()) {
          <tf-skeleton kind="table" [label]="t('common_loading', 'Loading…')" />
        } @else if (error()) {
          <div class="tf-state" data-state="error" role="alert">
            <p class="tf-state-title">{{ t('fin_payouts_error', 'We couldn’t load payout details.') }}</p>
            <p class="tf-state-body">{{ error() }}</p>
            <button type="button" class="tf-button tf-button-secondary" (click)="load()">{{ t('common_retry', 'Try again') }}</button>
          </div>
        } @else if (result(); as r) {
          @if (r.items.length) {
            <div class="tf-table-wrap">
              <table class="tf-table" data-density="dense" data-phone="cards" data-testid="finance-payout-profiles">
                <thead><tr>
                  <th scope="col">{{ t('fin_payout_holder', 'Account holder') }}</th>
                  <th scope="col">{{ t('fin_col_destination', 'Destination') }}</th>
                  <th scope="col">{{ t('fin_payout_identity', 'ID (last 4)') }}</th>
                  <th scope="col">{{ t('fin_payout_submitted', 'Submitted') }}</th>
                  <th scope="col">{{ t('fin_col_status', 'Status') }}</th>
                  <th scope="col" class="tf-table__actions"><span class="tf-sr-only">{{ t('fin_col_actions', 'Actions') }}</span></th>
                </tr></thead>
                <tbody>
                  @for (p of r.items; track p.teacherId) {
                    <tr data-testid="finance-payout-row">
                      <td [attr.data-label]="t('fin_payout_holder', 'Account holder')"><span>{{ p.legalName }} <small class="tf-fin-muted">{{ country(p.countryCode) }}</small></span></td>
                      <td [attr.data-label]="t('fin_col_destination', 'Destination')"><span class="tf-fin-mono">{{ p.destinationLabel }}</span></td>
                      <td [attr.data-label]="t('fin_payout_identity', 'ID (last 4)')"><span class="tf-fin-mono">{{ p.identityLast4 }}</span></td>
                      <td [attr.data-label]="t('fin_payout_submitted', 'Submitted')">{{ when(p.submittedAt) }}</td>
                      <td [attr.data-label]="t('fin_col_status', 'Status')"><div><span class="tf-badge" [attr.data-tone]="words(p).tone">{{ t(words(p).labelKey, words(p).fallback) }}</span>
                        @if (p.reenrollmentRequired) { <br><small class="tf-fin-muted">{{ t('fin_payout_reenroll', 'Saved before full bank details were collected; the teacher must enter them again.') }}</small> }
                        @if (p.rejectionReason) { <br><small class="tf-fin-muted">{{ p.rejectionReason }}</small> }</div></td>
                      <td class="tf-table__actions">
                        @if (p.status === 0) {
                          <div class="tf-fin-row-actions">
                            <button type="button" class="tf-button" (click)="review(p, true)" [tfActionFeedback]="actionState('approve:' + p.teacherId)" [disabled]="busy() || p.reenrollmentRequired" data-testid="finance-payout-verify">{{ t('admin_payout_verify', 'Verify') }}</button>
                            <button type="button" class="tf-button tf-button-secondary is-danger" (click)="review(p, false)" [tfActionFeedback]="actionState('reject:' + p.teacherId)" [disabled]="busy()" data-testid="finance-payout-reject">{{ t('fin_payout_return', 'Return for changes') }}</button>
                          </div>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="tf-fin-empty">{{ t('fin_payouts_empty', 'No payout details are in this list.') }}</p>
          }
        }
      </div>
    </tf-workspace-shell>
  `,
  styles: [FINANCE_STYLES]
})
export class FinancePayoutProfilesPageComponent {
  private readonly gateway = inject(FinanceGateway);
  private readonly session = inject(SESSION_STORE);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);
  readonly filters = FILTERS;
  readonly shellRole = computed(() => financeShellRole(this.session.current()?.roles));
  readonly filter = signal<number | null>(0);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly activeAction = signal('');
  actionState(key: string): 'busy' | 'idle' { return this.busy() && this.activeAction() === key ? 'busy' : 'idle'; }
  readonly error = signal('');
  readonly result = signal<Page<PayoutProfileRow> | null>(null);

  constructor() {
    inject(Title).setTitle(`${this.t('fin_payouts_title', 'Payout details')} — Tafseel`);
    void this.load();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  when(value: string): string { return value ? this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
  words(p: PayoutProfileRow) { return FinanceWords.payoutProfile(p.status); }
  country(code: string): string {
    try { return new Intl.DisplayNames([this.locale.lang()], { type: 'region' }).of(code) ?? code; } catch { return code; }
  }

  choose(filter: number | null): void { this.filter.set(filter); void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.result.set(await this.gateway.payoutProfiles(this.filter(), 1));
    } catch (error) {
      this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
    }
  }

  async review(p: PayoutProfileRow, approve: boolean): Promise<void> {
    let reason: string | null = null;
    if (approve) {
      if (!await this.dialogs.confirm({
        body: this.locale.format('fin_payout_verify_confirm', { name: p.legalName },
          'Verify the payout details of {name}? Only verify when the account holder is this teacher. They can then request withdrawals to this account.'),
        confirmLabel: this.t('admin_payout_verify', 'Verify'), cancelLabel: this.t('common_cancel', 'Cancel')
      })) return;
    } else {
      reason = await this.dialogs.prompt({ message: this.t('admin_payout_reject_prompt', 'What should the teacher correct?'),
        confirmLabel: this.t('common_continue', 'Continue'), cancelLabel: this.t('common_cancel', 'Cancel') });
      if (reason === null) return;
      if (!reason.trim()) { this.toasts.show(this.t('admin_reason_required', 'A reason is required.')); return; }
    }
    this.activeAction.set((approve ? 'approve:' : 'reject:') + p.teacherId);
    this.busy.set(true);
    try {
      await this.gateway.reviewPayoutProfile(p.teacherId, approve, reason?.trim() ?? null, p.version);
      this.toasts.show(approve ? this.t('admin_payout_verified_done', 'Payout details verified.') : this.t('admin_payout_rejected_done', 'Payout details rejected.'));
      await this.load();
    } catch (error) {
      this.toasts.show(problemMessage(error, (k, f) => this.t(k, f)).text || this.t('admin_action_failed', 'This could not be done.'));
    } finally {
      this.busy.set(false);
    }
  }
}
