import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Earnings, EarningsSummary } from '../models/earnings';
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
