import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Earnings, EarningsStatement, EarningsSummary } from '../models/earnings';
import { PayoutDraft, PayoutProfile, Payouts, Withdrawal } from '../models/payouts';
import { EARNINGS_GATEWAY } from './earnings.ports';

/**
 * The teacher's money, as one authoritative model (FIN-01).
 *
 * The balances are the page: if they cannot be read there is nothing honest to show, so the failure is
 * raised. The policy only adds two sentences (minimum withdrawal, how long a transfer takes), so a policy
 * failure leaves the amounts on screen without them — a teacher is never shown 0 SAR because a call failed.
 *
 * `UX-02`'s home summary will read this same use case rather than recomputing money of its own.
 */
@Injectable()
export class LoadEarnings {
  private readonly gateway = inject(EARNINGS_GATEWAY);

  async execute(now = Date.now()): Promise<EarningsSummary> {
    const [balances, policy] = await Promise.allSettled([
      firstValueFrom(this.gateway.balances()),
      firstValueFrom(this.gateway.policy())
    ]);
    if (balances.status === 'rejected') throw balances.reason;
    return Earnings.summary(balances.value, policy.status === 'fulfilled' ? policy.value : null, now);
  }
}

/** Payout details and the withdrawal history; a failure in the history never hides the balances. */
@Injectable()
export class LoadPayouts {
  private readonly gateway = inject(EARNINGS_GATEWAY);

  async execute(): Promise<{ profile: PayoutProfile | null; withdrawals: readonly Withdrawal[]; partial: boolean }> {
    const [profile, withdrawals] = await Promise.allSettled([
      firstValueFrom(this.gateway.payoutProfile()),
      firstValueFrom(this.gateway.withdrawals())
    ]);
    return {
      profile: profile.status === 'fulfilled' ? profile.value : null,
      withdrawals: withdrawals.status === 'fulfilled' ? withdrawals.value : [],
      partial: profile.status === 'rejected' || withdrawals.status === 'rejected'
    };
  }
}

/**
 * Where the balance came from. It only explains the balances above it, so a failure leaves the balances on
 * screen and simply omits the explanation — it never stands in for a balance.
 */
@Injectable()
export class LoadStatement {
  private readonly gateway = inject(EARNINGS_GATEWAY);

  async execute(): Promise<EarningsStatement | null> {
    try { return await firstValueFrom(this.gateway.statement()); } catch { return null; }
  }
}

@Injectable()
export class SavePayoutDetails {
  private readonly gateway = inject(EARNINGS_GATEWAY);

  execute(draft: PayoutDraft): Promise<PayoutProfile> {
    return firstValueFrom(this.gateway.savePayoutProfile(Payouts.input(draft)));
  }
}

@Injectable()
export class RequestWithdrawal {
  private readonly gateway = inject(EARNINGS_GATEWAY);

  execute(amount: number, currency: string, idempotencyKey: string): Promise<Withdrawal> {
    return firstValueFrom(this.gateway.requestWithdrawal(amount, currency, idempotencyKey));
  }
}
