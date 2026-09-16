import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { PriceComponent } from '@shared/components/price.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { EarningsSummary, EarningsView } from '../models/earnings';
import { LoadEarnings } from '../services/earnings.use-cases';

/**
 * Teacher earnings (FIN-01, J12-01): what can be withdrawn now, what is still clearing and when it
 * becomes available, and what is on its way to the bank.
 *
 * The page is read-only on purpose. Requesting a withdrawal is `FIN-03` and payout details are `FIN-02`;
 * until they exist there is no button here, because a button that cannot do anything is worse than none.
 * Nothing on the screen names the ledger, the maturity worker or an escrow account.
 */
@Component({
  selector: 'tf-teacher-earnings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PriceComponent, WorkspaceShellComponent],
  templateUrl: './teacher-earnings-page.component.html',
  styles: `
    .tf-earnings { display: grid; gap: 16px; max-width: 640px; }
    .tf-earnings-card { display: grid; gap: 6px; padding: 18px 20px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); }
    .tf-earnings-card h2 { margin: 0; font-size: 14px; font-weight: 700; color: var(--text-2); }
    .tf-earnings-amount { margin: 0; font-size: 28px; font-weight: 800; line-height: 1.2; }
    .tf-earnings-help, .tf-earnings-next { margin: 0; font-size: 13px; color: var(--text-2); }
    .tf-earnings-next { font-weight: 700; color: var(--text); }
    .tf-earnings-why { padding: 14px 20px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface-2, var(--surface)); }
    .tf-earnings-why summary { cursor: pointer; font-size: 14px; font-weight: 700; min-height: 44px; display: flex; align-items: center; }
    .tf-earnings-why p { margin: 8px 0 0; font-size: 13px; line-height: 1.7; color: var(--text-2); }
    .tf-earnings [data-state="loading"] .tf-skeleton { height: 18px; }
  `
})
export class TeacherEarningsPageComponent {
  private readonly load = inject(LoadEarnings);
  private readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly summary = signal<EarningsSummary | null>(null);

  constructor() {
    inject(Title).setTitle(`${this.t('earn_title', 'Earnings')} — Tafseel`);
    void this.refresh();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  date(value: string): string { return this.fmt.dateOnly(value); }

  /**
   * What the minimum withdrawal means for this teacher right now, or nothing to say.
   *
   * With no withdrawable money there is no withdrawal to talk about, so the sentence is left out
   * rather than telling someone with 0 SAR that they "can request a withdrawal of this amount".
   * The sentence is split around its `{min}` so the amount is drawn by `tf-price`; interpolating it
   * as text would put the Latin currency code inside an Arabic sentence.
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
      this.summary.set(await this.load.execute());
    } catch (error) {
      this.summary.set(null);
      this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
    }
  }
}
