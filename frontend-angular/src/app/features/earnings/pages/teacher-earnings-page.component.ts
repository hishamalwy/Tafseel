import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { PriceComponent } from '@shared/components/price.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import { withdrawalStatus } from '@shared/vocabulary/status-vocabulary';
import { EarningItem, EarningsStatement, EarningsSummary, EarningsTotals, EarningsView, Statement } from '../models/earnings';
import { AmountProblem, PAYOUT_COUNTRIES, PayoutDraft, PayoutProblem, PayoutProfile, Payouts, Withdrawal } from '../models/payouts';
import { LoadEarnings, LoadPayouts, LoadStatement, RequestWithdrawal, SavePayoutDetails } from '../services/earnings.use-cases';

type Panel = '' | 'payout' | 'withdraw';

/**
 * Teacher earnings (FIN-01..03, J12-01..03): what can be withdrawn now, what is still clearing and when it
 * becomes available, where the money is sent, and what happened to each withdrawal.
 *
 * Every rule about money is the server's: the balances, the minimum, whether the payout details are verified
 * and each withdrawal's status. Tafseel's finance team verifies payout details, starts the bank transfer and
 * records the bank's evidence (DEC-04's audited manual route); the page says so, so a teacher is never left
 * wondering where the money is. Nothing on the screen names the ledger, maturity or an escrow account.
 */
@Component({
  selector: 'tf-teacher-earnings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, PriceComponent, WorkspaceShellComponent],
  templateUrl: './teacher-earnings-page.component.html',
  styles: `
    .tf-earnings { display: grid; gap: var(--space-4); max-width: 760px; }
    .tf-earnings-card { display: grid; gap: var(--space-2); align-content: start; padding: var(--space-5); border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); }
    .tf-earnings-card h2 { margin: 0; font-size: 14px; font-weight: 700; color: var(--text-2); }
    .tf-earnings-card h3 { margin: 0; font-size: 16px; font-weight: 800; }
    /* The one amount a teacher can act on reads first and largest; history reads quieter. */
    .tf-earnings-card--now { border-color: color-mix(in oklab, var(--primary) 35%, var(--border)); }
    .tf-earnings-card--now h2 { color: var(--text); }
    .tf-earnings-card--past { background: var(--surface-2); }
    .tf-earnings-card--past .tf-earnings-amount { color: var(--text-2); }
    .tf-earnings-split { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .tf-earnings-amount { margin: 0; font-size: 28px; font-weight: 800; line-height: 1.2; white-space: nowrap; }
    .tf-earnings-amount--sm { font-size: 22px; }
    .tf-earnings-help, .tf-earnings-next { margin: 0; font-size: 14px; line-height: 1.6; color: var(--text-2); }
    .tf-earnings-next { font-weight: 700; color: var(--text); }
    .tf-earnings-lead { margin: 0; font-size: 15px; line-height: 1.7; color: var(--text); }
    .tf-earnings-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-block-start: var(--space-1); }
    .tf-earnings-why { padding: var(--space-3) var(--space-5); border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface-2, var(--surface)); }
    .tf-earnings-why summary { cursor: pointer; font-size: 14px; font-weight: 700; min-height: 44px; display: flex; align-items: center; }
    .tf-earnings-why p { margin: var(--space-2) 0 0; font-size: 13px; line-height: 1.7; color: var(--text-2); }
    .tf-earnings [data-state="loading"] .tf-skeleton { height: 18px; }
    .tf-earnings-form { display: grid; gap: var(--space-3); }
    .tf-earnings-form .tf-field { display: grid; gap: 6px; }
    .tf-earnings-form small { color: var(--text-2); font-size: 13px; line-height: 1.5; }
    .tf-earnings-state { margin: 0; padding: 10px var(--space-3); border-radius: var(--r-sm); font-size: 14px; line-height: 1.6; }
    .tf-earnings-state[data-kind="info"] { background: var(--surface-2); color: var(--text); }
    .tf-earnings-state[data-kind="success"] { background: var(--success-soft); color: var(--success); font-weight: 600; }
    .tf-earnings-state[data-kind="danger"] { background: var(--error-soft); color: var(--error); }

    /* A sum the eye can check: label at the start, amount at the end, total under a rule. */
    .tf-earnings-sum { display: grid; gap: 0; margin: var(--space-1) 0 0; font-size: 14px; }
    .tf-earnings-sum > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); padding-block: 6px; }
    .tf-earnings-sum dt { color: var(--text-2); min-width: 0; }
    .tf-earnings-sum dd { margin: 0; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .tf-earnings-sum > .is-total { margin-block-start: var(--space-1); padding-block-start: var(--space-2); border-block-start: 1px solid var(--border-strong); }
    .tf-earnings-sum > .is-total dt { color: var(--text); font-weight: 700; }
    .tf-earnings-sum > .is-total dd { font-weight: 800; font-size: 16px; }
    .tf-earnings-signed { display: inline-flex; align-items: baseline; gap: 2px; unicode-bidi: isolate; white-space: nowrap; }

    .tf-earnings-list, .tf-earnings-history { display: grid; gap: var(--space-3); margin: var(--space-1) 0 0; padding: 0; list-style: none; }
    .tf-earnings-item { display: grid; gap: var(--space-2); padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-radius: var(--r-sm); }
    .tf-earnings-item[data-state="refunded"] .tf-earnings-sum { opacity: .65; }
    .tf-earnings-item[data-state="refunded"] .is-total dd { text-decoration: line-through; }
    .tf-earnings-item__head, .tf-earnings-history__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
    .tf-earnings-item__title { display: grid; gap: 2px; min-width: 0; }
    .tf-earnings-item__title strong { font-size: 15px; overflow-wrap: anywhere; }
    .tf-earnings-item__title small, .tf-earnings-item__note { color: var(--text-2); font-size: 13px; line-height: 1.5; }
    .tf-earnings-sum--item { margin: 0; }
    .tf-earnings-sum--item > div { padding-block: 3px; }
    .tf-badge { flex: none; white-space: nowrap; }

    .tf-earnings-history li { display: grid; gap: var(--space-2); padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface); }
    .tf-earnings-history__amount { font-size: 17px; white-space: nowrap; }
    /* Transferred and rejected withdrawals are history: quieter, and visibly not part of the balance above. */
    .tf-earnings-history li[data-state="transferred"], .tf-earnings-history li[data-state="rejected"] { background: var(--surface-2); }
    .tf-earnings-history li[data-state="transferred"] .tf-earnings-history__amount,
    .tf-earnings-history li[data-state="rejected"] .tf-earnings-history__amount { color: var(--text-2); font-weight: 700; }
    .tf-earnings-history small { color: var(--text-2); font-size: 13px; line-height: 1.5; }
    .tf-earnings-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-2) var(--space-4); margin: 0; font-size: 13px; }
    .tf-earnings-facts dt { color: var(--text-2); }
    .tf-earnings-facts dd { margin: 2px 0 0; font-weight: 600; overflow-wrap: anywhere; }
    .tf-earnings-mono { font-family: var(--font-mono); }
    @media (max-width: 480px) {
      .tf-earnings-card, .tf-earnings-why { padding-inline: var(--space-4); }
      .tf-earnings-item, .tf-earnings-history li { padding-inline: var(--space-3); }
      .tf-earnings-facts { grid-template-columns: 1fr 1fr; }
    }
  `
})
export class TeacherEarningsPageComponent {
  private readonly load = inject(LoadEarnings);
  private readonly loadPayouts = inject(LoadPayouts);
  private readonly loadStatement = inject(LoadStatement);
  private readonly savePayout = inject(SavePayoutDetails);
  private readonly requestWithdrawal = inject(RequestWithdrawal);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);
  readonly countries = PAYOUT_COUNTRIES;

  readonly loading = signal(true);
  readonly error = signal('');
  readonly summary = signal<EarningsSummary | null>(null);
  readonly profile = signal<PayoutProfile | null>(null);
  readonly withdrawals = signal<readonly Withdrawal[]>([]);
  readonly statement = signal<EarningsStatement | null>(null);
  readonly panel = signal<Panel>('');
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly actionError = signal('');

  readonly draft = signal<PayoutDraft>(Payouts.emptyDraft());
  readonly draftAttempted = signal(false);
  readonly payoutProblems = computed<readonly PayoutProblem[]>(() => this.draftAttempted() ? Payouts.problems(this.draft()) : []);

  readonly amount = signal('');
  readonly amountAttempted = signal(false);
  /** One key per withdrawal attempt: a second click or a retry after a network error joins the same request. */
  private withdrawalKey = '';

  readonly balance = computed<EarningsView | null>(() => this.summary()?.balances[0] ?? null);
  readonly minimum = computed(() => this.summary()?.policy?.minimumAmount ?? 0);
  readonly amountProblem = computed<AmountProblem | null>(() => {
    const balance = this.balance();
    return this.amountAttempted() && balance ? Payouts.amountProblem(this.amount(), balance.available, this.minimum()) : null;
  });

  constructor() {
    inject(Title).setTitle(`${this.t('earn_title', 'Earnings')} — Tafseel`);
    void this.refresh();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  date(value: string): string { return this.fmt.dateOnly(value); }
  when(value: string): string { return this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }); }
  statusLabel(item: Withdrawal): string { const s = withdrawalStatus(item.status); return this.t(s.labelKey, s.fallback); }
  statusTone(item: Withdrawal): string { return withdrawalStatus(item.status).tone; }
  country(code: string): string {
    try { return new Intl.DisplayNames([this.locale.lang()], { type: 'region' }).of(code) ?? code; } catch { return code; }
  }
  method(_value: string): string {
    return this.t('payout_method_bank', 'Bank transfer');
  }

  totals(currency: string): EarningsTotals | null { return Statement.totalsFor(this.statement(), currency); }
  explains(totals: EarningsTotals | null): totals is EarningsTotals { return Statement.explains(totals); }
  items(currency: string): readonly EarningItem[] { return this.statement()?.items.filter(i => i.currency === currency) ?? []; }
  money(value: number, currency: string): string { return this.fmt.money(value, currency); }
  percent(value: number): string { return this.fmt.number(value, { maximumFractionDigits: 2 }); }

  /** "You earned X. Y is in your bank. Z is left to withdraw." — only the parts that are not zero. */
  sumSentence(totals: EarningsTotals): string {
    const c = totals.currency;
    const parts = [this.locale.format('earn_sum_earned_sentence', { earned: this.money(totals.earned, c) }, 'You have earned {earned} in total from your completed work.')];
    if (totals.transferred > 0) parts.push(this.locale.format('earn_sum_transferred_sentence', { amount: this.money(totals.transferred, c) }, '{amount} of it is already in your bank.'));
    if (totals.inTransfer > 0) parts.push(this.locale.format('earn_sum_in_transfer_sentence', { amount: this.money(totals.inTransfer, c) }, '{amount} is being sent to your bank now.'));
    if (totals.clearing > 0) parts.push(this.locale.format('earn_sum_becoming_sentence', { amount: this.money(totals.clearing, c) }, '{amount} becomes available after the 7-day period.'));
    parts.push(this.locale.format('earn_sum_available_sentence', { amount: this.money(totals.available, c) }, 'That leaves {amount} to withdraw now.'));
    return parts.join(' ');
  }

  itemState(item: EarningItem): { label: string; tone: string } {
    switch (item.state) {
      case 'clearing': return { label: this.t('earn_item_state_clearing', 'Becoming available'), tone: 'info' };
      case 'refunded': return { label: this.t('earn_item_state_refunded', 'Refunded to the student'), tone: 'neutral' };
      default: return { label: this.t('earn_item_state_available', 'In your balance'), tone: 'success' };
    }
  }

  itemKind(item: EarningItem): string {
    return item.kind === 'live_session' ? this.t('earn_item_session', 'Live session') : this.t('earn_item_order', 'Order');
  }

  /**
   * What the minimum withdrawal means for this teacher right now, or nothing to say. The sentence is split
   * around its `{min}` so the amount is drawn by `tf-price`.
   */
  minimumNote(summary: EarningsSummary, balance: EarningsView):
    { readonly before: string; readonly after: string; readonly amount: number; readonly currency: string } | null {
    const policy = summary.policy;
    if (!policy || balance.available <= 0) return null;
    const sentence = balance.belowMinimum
      ? this.t('earn_available_below_min', 'You need at least {min} to request a withdrawal.')
      : this.t('earn_available_help', 'You can request a withdrawal of this amount. The minimum withdrawal is {min}.');
    const [before = '', after = ''] = sentence.split('{min}');
    return { before, after, amount: policy.minimumAmount, currency: policy.currency };
  }

  /** A failed read is said out loud; it never becomes a balance of zero. */
  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [summary, payouts, statement] = await Promise.all([
        this.load.execute(), this.loadPayouts.execute(), this.loadStatement.execute()]);
      this.summary.set(summary);
      this.statement.set(statement);
      this.profile.set(payouts.profile);
      this.withdrawals.set(payouts.withdrawals);
      if (payouts.partial) this.toasts.show(this.t('earn_payouts_partial', 'Some payout information could not be loaded. Try again in a moment.'));
    } catch (error) {
      this.summary.set(null);
      this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
    }
  }

  open(panel: Panel): void {
    this.actionError.set('');
    this.notice.set('');
    if (panel === 'payout') {
      const profile = this.profile();
      this.draft.set(profile ? Payouts.draftFrom(profile) : Payouts.emptyDraft());
      this.draftAttempted.set(false);
    }
    if (panel === 'withdraw') {
      this.amount.set(String(this.balance()?.available ?? ''));
      this.amountAttempted.set(false);
      this.withdrawalKey = crypto.randomUUID();
    }
    this.panel.set(panel);
  }

  setDraft(field: keyof PayoutDraft, value: string): void {
    this.draft.update(d => ({ ...d, [field]: value }) as PayoutDraft);
  }

  payoutProblem(problem: PayoutProblem): string {
    switch (problem) {
      case 'legalName': return this.t('payout_problem_name', 'Write your full name exactly as it appears on the account.');
      case 'bankName': return this.t('payout_problem_bank', 'Write the name of your bank.');
      case 'iban': return this.t('payout_problem_iban', 'This is not a valid IBAN. Copy it again from your bank app.');
      case 'ibanCountry': return this.t('payout_problem_iban_country', 'This IBAN belongs to a different country than the one you chose.');
      default: return this.t('payout_problem_identity', 'Write the last 4 characters of your national ID or residence permit.');
    }
  }

  amountMessage(problem: AmountProblem): string {
    switch (problem) {
      case 'required': return this.t('withdraw_problem_required', 'Enter the amount you want to withdraw.');
      case 'invalid': return this.t('withdraw_problem_invalid', 'Enter an amount like 150 or 150.50.');
      case 'above_available': return this.t('withdraw_problem_above', 'This is more than you can withdraw now.');
      default: return this.t('withdraw_problem_minimum', 'This is below the minimum withdrawal.');
    }
  }

  async submitPayout(): Promise<void> {
    this.draftAttempted.set(true);
    if (Payouts.problems(this.draft()).length || this.busy()) return;
    this.busy.set(true);
    this.actionError.set('');
    try {
      this.profile.set(await this.savePayout.execute(this.draft()));
      this.panel.set('');
      this.notice.set(this.t('payout_saved', 'Your payout details were saved. Tafseel’s finance team checks them before your first withdrawal; we will e-mail you when they are approved.'));
    } catch (error) {
      this.actionError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.busy.set(false);
    }
  }

  async submitWithdrawal(): Promise<void> {
    this.amountAttempted.set(true);
    const balance = this.balance(), profile = this.profile();
    if (!balance || !profile || this.amountProblem() || this.busy()) return;
    const amount = Number(this.amount());
    const days = this.summary()?.policy?.expectedSettlementBusinessDays ?? 0;
    const confirmed = await this.dialogs.confirm({
      title: this.t('withdraw_confirm_title', 'Withdraw your earnings?'),
      body: this.locale.format('withdraw_confirm_body',
        { amount: this.fmt.money(amount, balance.currency), destination: profile.destinationLabel, days },
        'We will send {amount} to {destination}. The amount is set aside now and Tafseel’s finance team transfers it, usually within {days} business days. A request cannot be cancelled once it is sent.'),
      confirmLabel: this.t('withdraw_confirm_ok', 'Request withdrawal'),
      cancelLabel: this.t('common_cancel', 'Cancel')
    });
    if (!confirmed) return;
    this.busy.set(true);
    this.actionError.set('');
    try {
      await this.requestWithdrawal.execute(amount, balance.currency, this.withdrawalKey);
      this.panel.set('');
      await this.refresh();
      this.notice.set(this.locale.format('withdraw_requested', { days },
        'Your withdrawal was requested. Tafseel’s finance team is transferring it, usually within {days} business days. You can follow it below; you do not need to do anything else.'));
    } catch (error) {
      this.actionError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.busy.set(false);
    }
  }
}
