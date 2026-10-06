import { SkeletonComponent } from '@shared/components/skeleton.component';
import { ActionFeedbackDirective } from '@shared/directives/action-feedback.directive';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { PriceComponent } from '@shared/components/price.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import { FinanceWithdrawal, FinanceWords, Page, TransferInstruction } from '../models/finance';
import { FinanceGateway } from '../services/finance.gateway';
import { FINANCE_STYLES, financeShellRole } from './finance-shared';

type Mode = '' | 'instruction' | 'evidence';

const FILTERS: readonly (readonly [number | null, string, string])[] = [
  [0, 'fin_withdrawal_to_send', 'To send'],
  [3, 'fin_withdrawal_started_short', 'Transfer started'],
  [1, 'fin_withdrawal_transferred', 'Transferred'],
  [2, 'fin_withdrawal_rejected_short', 'Rejected'],
  [null, 'fin_filter_all_withdrawals', 'All']
];

/**
 * DEC-04's audited manual payout, step by step. The operator reads the transfer details (recorded in the
 * financial audit every time), starts the transfer in Tafseel, sends it from the bank, then records the bank's
 * own reference as evidence. Only that evidence makes a withdrawal Transferred. Tafseel moves no money itself.
 */
@Component({
  selector: 'tf-finance-withdrawals-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SkeletonComponent, ActionFeedbackDirective, FormsModule, PriceComponent, WorkspaceShellComponent],
  template: `
    <tf-workspace-shell [role]="shellRole()" section="finance">
      <div class="tf-fin">
        <header class="tf-fin-head">
          <div>
            <h1>{{ t('fin_withdrawals_title', 'Withdrawals') }}</h1>
            <p>{{ t('fin_withdrawals_intro', 'Send each withdrawal from the bank yourself: open its transfer details, start the transfer here, send it, then record the bank’s reference. Tafseel does not move the money.') }}</p>
          </div>
        </header>
        <div class="tf-fin-segments" role="group" [attr.aria-label]="t('fin_withdrawals_filter', 'Show withdrawals')" data-testid="finance-withdrawal-filter">
          @for (f of filters; track $index) {
            <button type="button" [attr.aria-pressed]="filter() === f[0]" (click)="choose(f[0])">{{ t(f[1], f[2]) }}</button>
          }
        </div>

        @if (loading()) {
          <tf-skeleton kind="table" [label]="t('common_loading', 'Loading…')" />
        } @else if (error()) {
          <div class="tf-state" data-state="error" role="alert">
            <p class="tf-state-title">{{ t('fin_withdrawals_error', 'We couldn’t load withdrawals.') }}</p>
            <p class="tf-state-body">{{ error() }}</p>
            <button type="button" class="tf-button tf-button-secondary" (click)="load()">{{ t('common_retry', 'Try again') }}</button>
          </div>
        } @else if (result(); as r) {
          @if (r.items.length) {
            <div class="tf-table-wrap">
              <table class="tf-table" data-density="dense" data-phone="cards" data-testid="finance-withdrawals">
                <thead><tr>
                  <th scope="col">{{ t('fin_col_teacher', 'Teacher') }}</th>
                  <th scope="col">{{ t('fin_col_amount', 'Amount') }}</th>
                  <th scope="col">{{ t('fin_col_requested', 'Requested') }}</th>
                  <th scope="col">{{ t('fin_col_destination', 'Destination') }}</th>
                  <th scope="col">{{ t('fin_col_status', 'Status') }}</th>
                  <th scope="col" class="tf-table__actions"><span class="tf-sr-only">{{ t('fin_col_actions', 'Actions') }}</span></th>
                </tr></thead>
                <tbody>
                  @for (w of r.items; track w.id) {
                    <tr data-testid="finance-withdrawal-row" [attr.data-withdrawal-id]="w.id">
                      <td [attr.data-label]="t('fin_col_teacher', 'Teacher')">{{ w.teacherName || '—' }}</td>
                      <td [attr.data-label]="t('fin_col_amount', 'Amount')"><tf-price [amount]="w.amount" [currency]="w.currency" /></td>
                      <td [attr.data-label]="t('fin_col_requested', 'Requested')">{{ when(w.createdAt) }}</td>
                      <td [attr.data-label]="t('fin_col_destination', 'Destination')"><span class="tf-fin-mono">{{ w.destinationLabel || '—' }}</span></td>
                      <td [attr.data-label]="t('fin_col_status', 'Status')"><div>
                        <span class="tf-badge" [attr.data-tone]="words(w).tone">{{ t(words(w).labelKey, words(w).fallback) }}</span>
                        @if (w.providerReference) { <br><small class="tf-fin-muted tf-fin-mono">{{ w.providerReference }}</small> }
                        @if (w.rejectionReason) { <br><small class="tf-fin-muted">{{ w.rejectionReason }}</small> }
                      </div></td>
                      <td class="tf-table__actions">
                        <div class="tf-fin-row-actions">
                          @if ((w.status === 0 || w.status === 3) && w.hasDestinationSnapshot) {
                            <button type="button" class="tf-button" [class.tf-button-secondary]="w.status === 3" (click)="openInstruction(w)" [tfActionFeedback]="actionState('instruction:' + w.id)" [disabled]="busy()" data-testid="finance-transfer-details">{{ t('fin_transfer_details', 'Transfer details') }}</button>
                          }
                          @if (w.status === 3) {
                            <button type="button" class="tf-button" (click)="openEvidence(w)" [disabled]="busy()" data-testid="finance-record-evidence">{{ t('fin_record_evidence', 'Record bank evidence') }}</button>
                          }
                          @if (w.status === 0 || w.status === 3) {
                            <button type="button" class="tf-button tf-button-secondary is-danger" (click)="reject(w)" [tfActionFeedback]="actionState('reject:' + w.id)" [disabled]="busy()" data-testid="finance-withdrawal-reject">{{ w.status === 3 ? t('fin_cancel_transfer', 'Cancel — no money sent') : t('admin_reject', 'Reject') }}</button>
                          }
                        </div>
                        @if (w.status === 0 && !w.hasDestinationSnapshot) {
                          <small class="tf-fin-muted">{{ t('fin_withdrawal_no_destination', 'Requested before full bank details were collected. Reject it so the teacher enters their IBAN and requests again.') }}</small>
                        }
                      </td>
                    </tr>
                    @if (selected()?.id === w.id && mode()) {
                      <tr class="tf-fin-panel-row tf-table__detail-row"><td colspan="6">
                        @if (mode() === 'instruction' && instruction(); as i) {
                          <section class="tf-fin-panel" aria-labelledby="fin-instruction-title" data-testid="finance-instruction">
                            <h2 id="fin-instruction-title">{{ t('fin_instruction_title', 'Send this bank transfer') }}</h2>
                            <dl class="tf-fin-kv">
                              <dt>{{ t('fin_instruction_beneficiary', 'Account holder') }}</dt><dd>{{ i.beneficiaryName }}</dd>
                              <dt>{{ t('fin_instruction_bank', 'Bank') }}</dt><dd>{{ i.bankName }}</dd>
                              <dt>{{ t('payout_iban', 'IBAN') }}</dt><dd class="tf-fin-mono" data-testid="finance-instruction-iban">{{ i.iban }}</dd>
                              <dt>{{ t('fin_col_amount', 'Amount') }}</dt><dd><tf-price [amount]="i.amount" [currency]="i.currency" /></dd>
                              <dt>{{ t('fin_instruction_note', 'Transfer reference to write') }}</dt><dd class="tf-fin-mono" data-testid="finance-instruction-note">{{ i.transferNote }}</dd>
                            </dl>
                            <p class="tf-fin-muted">{{ t('fin_instruction_audit', 'Opening these details was recorded in the financial audit. They close when you leave this page.') }}</p>
                            <div class="tf-fin-actions">
                              @if (w.status === 0) {
                                <button type="button" class="tf-button" (click)="initiate(w)" [tfActionFeedback]="actionState('initiate:' + w.id)" [disabled]="busy()" data-testid="finance-start-transfer">{{ t('fin_start_transfer', 'I am sending it now — start the transfer') }}</button>
                              }
                              <button type="button" class="tf-button tf-button-ghost" (click)="close()">{{ t('common_close', 'Close') }}</button>
                            </div>
                          </section>
                        }
                        @if (mode() === 'evidence') {
                          <section class="tf-fin-panel" aria-labelledby="fin-evidence-title" data-testid="finance-evidence">
                            <h2 id="fin-evidence-title">{{ t('fin_evidence_title', 'Record the bank’s evidence') }}</h2>
                            <p class="tf-fin-muted">{{ locale.format('fin_evidence_intro', { note: w.initiationReference || '' }, 'Copy these from the bank’s own record of the transfer you sent with the reference {note}.') }}</p>
                            <form (ngSubmit)="confirm(w)" novalidate>
                              <div class="tf-field">
                                <label for="fin-ev-ref">{{ t('fin_evidence_reference', 'Bank’s transfer reference') }}</label>
                                <input id="fin-ev-ref" name="reference" maxlength="64" dir="ltr" autocomplete="off" required data-testid="finance-evidence-reference"
                                       [ngModel]="evidence().bankReference" (ngModelChange)="setEvidence('bankReference', $event)">
                              </div>
                              <div class="tf-field">
                                <label for="fin-ev-source">{{ t('fin_evidence_source', 'Sent from (bank account)') }}</label>
                                <input autocomplete="off" id="fin-ev-source" name="source" maxlength="100" required data-testid="finance-evidence-source"
                                       [ngModel]="evidence().sourceInstitution" (ngModelChange)="setEvidence('sourceInstitution', $event)">
                              </div>
                              <div class="tf-field">
                                <label for="fin-ev-when">{{ t('fin_evidence_when', 'When the bank sent it') }}</label>
                                <input autocomplete="off" id="fin-ev-when" name="when" type="datetime-local" required data-testid="finance-evidence-when"
                                       [ngModel]="evidence().transferredAt" (ngModelChange)="setEvidence('transferredAt', $event)">
                              </div>
                              <div class="tf-field">
                                <label for="fin-ev-amount">{{ locale.format('fin_evidence_amount', { currency: fmt.currencyLabel(w.currency) }, 'Amount sent ({currency})') }}</label>
                                <input autocomplete="off" id="fin-ev-amount" name="amount" type="number" inputmode="decimal" step="0.01" required data-testid="finance-evidence-amount"
                                       [ngModel]="evidence().amount" (ngModelChange)="setEvidence('amount', $event)">
                              </div>
                              <label class="tf-fin-check">
                                <input type="checkbox" name="attest" data-testid="finance-evidence-attest"
                                       [ngModel]="evidence().attested" (ngModelChange)="setEvidence('attested', $event)">
                                <span>{{ t('fin_evidence_attest', 'I checked the bank’s own record: this transfer was sent to this teacher’s account, for this amount, with this reference.') }}</span>
                              </label>
                              @if (formError()) { <p class="tf-field-error" role="alert">{{ formError() }}</p> }
                              <div class="tf-fin-actions">
                                <button type="submit" class="tf-button" [disabled]="busy()" data-testid="finance-evidence-submit" [tfActionFeedback]="actionState('confirm:' + w.id)">{{ t('fin_evidence_submit', 'Mark as transferred') }}</button>
                                <button type="button" class="tf-button tf-button-ghost" (click)="close()">{{ t('common_cancel', 'Cancel') }}</button>
                              </div>
                            </form>
                          </section>
                        }
                      </td></tr>
                    }
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
            <p class="tf-fin-empty" data-testid="finance-withdrawals-empty">{{ t('fin_withdrawals_empty', 'No withdrawal is in this list.') }}</p>
          }
        }
      </div>
    </tf-workspace-shell>
  `,
  styles: [FINANCE_STYLES, `
    .tf-fin-panel-row td { padding: 0 12px 16px; background: var(--surface); }
    .tf-table td small { display: inline-block; margin-block-start: 4px; }
  `]
})
export class FinanceWithdrawalsPageComponent {
  private readonly gateway = inject(FinanceGateway);
  private readonly session = inject(SESSION_STORE);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);
  readonly filters = FILTERS;
  readonly shellRole = computed(() => financeShellRole(this.session.current()?.roles));
  readonly filter = signal<number | null>(this.initialFilter());
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly activeAction = signal('');
  actionState(key: string): 'busy' | 'idle' { return this.busy() && this.activeAction() === key ? 'busy' : 'idle'; }
  readonly error = signal('');
  readonly formError = signal('');
  readonly result = signal<Page<FinanceWithdrawal> | null>(null);
  readonly pages = computed(() => { const r = this.result(); return r ? Math.max(1, Math.ceil(r.total / r.pageSize)) : 1; });
  readonly selected = signal<FinanceWithdrawal | null>(null);
  readonly mode = signal<Mode>('');
  readonly instruction = signal<TransferInstruction | null>(null);
  readonly evidence = signal({ bankReference: '', sourceInstitution: '', transferredAt: '', amount: '', attested: false });
  /** One key per attempt of each step, kept across retries of that attempt. */
  private keys: Record<string, string> = {};

  constructor() {
    inject(Title).setTitle(`${this.t('fin_withdrawals_title', 'Withdrawals')} — Tafseel`);
    void this.load();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  when(value: string): string { return value ? this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
  words(w: FinanceWithdrawal) { return FinanceWords.withdrawal(w.status); }

  private initialFilter(): number | null {
    const raw = this.route.snapshot.queryParamMap.get('status');
    if (raw === 'all') return null;
    const value = Number(raw);
    return raw !== null && [0, 1, 2, 3].includes(value) ? value : 0;
  }

  choose(filter: number | null): void {
    this.filter.set(filter);
    this.close();
    void this.router.navigate([], { relativeTo: this.route, replaceUrl: true,
      queryParams: { status: filter === null ? 'all' : filter === 0 ? null : filter } });
    this.go(1);
  }

  go(page: number): void { this.page.set(Math.max(1, page)); void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.result.set(await this.gateway.withdrawals(this.filter(), this.page()));
    } catch (error) {
      this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
    }
  }

  close(): void {
    this.mode.set('');
    this.selected.set(null);
    this.instruction.set(null);
    this.formError.set('');
  }

  async openInstruction(w: FinanceWithdrawal): Promise<void> {
    this.close();
    await this.run('instruction:' + w.id, async () => {
      this.instruction.set(await this.gateway.instruction(w.id));
      this.selected.set(w);
      this.mode.set('instruction');
    });
  }

  openEvidence(w: FinanceWithdrawal): void {
    this.close();
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    this.evidence.set({ bankReference: '', sourceInstitution: '', transferredAt: local, amount: String(w.amount), attested: false });
    this.selected.set(w);
    this.mode.set('evidence');
  }

  setEvidence(field: 'bankReference' | 'sourceInstitution' | 'transferredAt' | 'amount' | 'attested', value: unknown): void {
    this.evidence.update(e => ({ ...e, [field]: field === 'attested' ? value === true : String(value ?? '') }));
  }

  async initiate(w: FinanceWithdrawal): Promise<void> {
    const amount = this.fmt.money(w.amount, w.currency);
    if (!await this.dialogs.confirm({
      body: this.locale.format('fin_start_confirm', { amount, name: w.teacherName || '' },
        'Start the transfer of {amount} to {name}? Send it from the bank now; the teacher is told it has started.'),
      confirmLabel: this.t('fin_start_transfer_ok', 'Start the transfer'), cancelLabel: this.t('common_cancel', 'Cancel')
    })) return;
    const key = this.keys[`initiate:${w.id}`] ||= crypto.randomUUID();
    await this.run('initiate:' + w.id, async () => {
      await this.gateway.initiate(w.id, w.version, key);
      delete this.keys[`initiate:${w.id}`];
      this.toasts.show(this.t('fin_transfer_started', 'Transfer started. Record the bank’s evidence once it is sent.'));
      this.close();
      this.filter.set(3);
      await this.load();
    });
  }

  async confirm(w: FinanceWithdrawal): Promise<void> {
    const e = this.evidence();
    this.formError.set('');
    const amount = Number(e.amount);
    if (!e.bankReference.trim() || !e.sourceInstitution.trim() || !e.transferredAt || !Number.isFinite(amount) || amount <= 0) {
      this.formError.set(this.t('fin_evidence_incomplete', 'Fill in every field from the bank’s record.'));
      return;
    }
    if (!e.attested) {
      this.formError.set(this.t('err_transfer_attestation_required', 'Confirm that the bank’s own record shows this transfer.'));
      return;
    }
    const key = this.keys[`confirm:${w.id}`] ||= crypto.randomUUID();
    await this.run('confirm:' + w.id, async () => {
      await this.gateway.confirmTransfer(w.id, {
        bankReference: e.bankReference.trim(), sourceInstitution: e.sourceInstitution.trim(),
        transferredAt: new Date(e.transferredAt).toISOString(), amount, currency: w.currency, confirmedAgainstBankRecord: true
      }, w.version, key);
      delete this.keys[`confirm:${w.id}`];
      this.toasts.show(this.t('fin_transfer_confirmed', 'Marked as transferred. The teacher has been told.'));
      this.close();
      await this.load();
    }, true);
  }

  async reject(w: FinanceWithdrawal): Promise<void> {
    const started = w.status === 3;
    const reason = await this.dialogs.prompt({
      message: started
        ? this.t('fin_cancel_reason', 'Why is this transfer cancelled? The amount returns to the teacher’s balance and they see your reason.')
        : this.t('admin_withdrawal_reject_prompt', 'Why is this withdrawal rejected? The amount returns to the teacher’s balance.'),
      confirmLabel: this.t('common_continue', 'Continue'), cancelLabel: this.t('common_cancel', 'Cancel')
    });
    if (reason === null) return;
    if (!reason.trim()) { this.toasts.show(this.t('admin_reason_required', 'A reason is required.')); return; }
    const amount = this.fmt.money(w.amount, w.currency);
    if (!await this.dialogs.confirm({
      body: started
        ? this.locale.format('fin_cancel_confirm', { amount }, 'Only cancel if the bank confirms that no money was sent. {amount} goes back to the teacher’s available balance. Did the bank confirm nothing was sent?')
        : this.locale.format('admin_withdrawal_reject_confirm', { amount }, 'Reject this withdrawal? {amount} goes back to the teacher’s available balance and they see your reason.'),
      confirmLabel: started ? this.t('fin_cancel_confirm_ok', 'Yes, nothing was sent — cancel it') : this.t('admin_withdrawal_reject_ok', 'Reject withdrawal'),
      cancelLabel: this.t('common_cancel', 'Cancel'), destructive: true
    })) return;
    const key = this.keys[`reject:${w.id}`] ||= crypto.randomUUID();
    await this.run('reject:' + w.id, async () => {
      await this.gateway.reject(w.id, reason.trim(), started, w.version, key);
      delete this.keys[`reject:${w.id}`];
      this.toasts.show(this.t('admin_withdrawal_rejected_done', 'Withdrawal rejected.'));
      this.close();
      await this.load();
    });
  }

  private async run(key: string, action: () => Promise<void>, inForm = false): Promise<void> {
    if (this.busy()) return;
    this.activeAction.set(key);
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      const message = problemMessage(error, (k, f) => this.t(k, f)).text || this.t('admin_action_failed', 'This could not be done.');
      if (inForm) this.formError.set(message); else this.toasts.show(message);
    } finally {
      this.busy.set(false);
    }
  }
}
