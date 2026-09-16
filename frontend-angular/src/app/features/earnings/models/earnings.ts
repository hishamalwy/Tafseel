/**
 * What a teacher's money looks like to the teacher (FIN-01, `docs/tickets/v1/FIN-01.md`).
 *
 * The server keeps the truth in a double-entry ledger with maturity records; the teacher is owed three
 * sentences: what can be withdrawn now, what is still clearing and when it becomes available, and what is
 * on its way to their bank. This file turns `GET /withdrawals/balances` and `GET /withdrawals/policy` into
 * exactly that, and nothing else: no ledger, maturity, escrow or account words, and no invented history.
 *
 * It is pure so that the Teacher Home summary (`UX-02`) can later read the same model rather than
 * recomputing money in a second component.
 */

/** `BalanceDto` as the API serializes it, per currency. */
export interface Balance {
  readonly currency: string;
  readonly available: number;
  readonly pendingWithdrawal: number;
  readonly pendingClearance: number;
  /** When the earliest clearing amount becomes withdrawable, if the server knows. */
  readonly nextClearanceAt: string | null;
}

/** `WithdrawalPolicyDto`: the rules a teacher is told about, never hard-coded in the client. */
export interface WithdrawalPolicy {
  readonly minimumAmount: number;
  readonly currency: string;
  readonly expectedSettlementBusinessDays: number;
}

/** When the next clearing amount is expected: a date, "soon", or nothing to say. */
export type NextClearance =
  | { readonly kind: 'date'; readonly at: string }
  | { readonly kind: 'soon' }
  | { readonly kind: 'none' };

export interface EarningsView {
  readonly currency: string;
  readonly available: number;
  readonly clearing: number;
  readonly transferring: number;
  /** `pendingWithdrawal > 0`; an empty money card is not shown just because a value is zero. */
  readonly showTransferring: boolean;
  readonly nextClearance: NextClearance;
  /** True while the teacher has earned something they cannot withdraw yet. */
  readonly hasClearing: boolean;
  /** `0 < available < minimum`: the teacher is told what they still need. */
  readonly belowMinimum: boolean;
}

export interface EarningsSummary {
  /** One view per currency the teacher has money in; V1 is SAR only. */
  readonly balances: readonly EarningsView[];
  /** No balance rows at all, or every amount zero. */
  readonly empty: boolean;
  /** Null when the policy could not be read; the page then omits the minimum and settlement lines. */
  readonly policy: WithdrawalPolicy | null;
}

const money = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export const Earnings = {
  /**
   * `now` decides only whether a known clearance date is still in the future: the maturity scan runs on
   * its own schedule, so a date that has just passed is "soon" rather than a date in the past, which
   * would read as a contradiction.
   */
  view(balance: Balance, policy: WithdrawalPolicy | null, now = Date.now()): EarningsView {
    const available = money(balance.available);
    const clearing = money(balance.pendingClearance);
    const transferring = money(balance.pendingWithdrawal);
    const at = Date.parse(String(balance.nextClearanceAt ?? ''));
    const nextClearance: NextClearance = clearing <= 0 || Number.isNaN(at)
      ? { kind: 'none' }
      : at > now ? { kind: 'date', at: new Date(at).toISOString() } : { kind: 'soon' };
    const minimum = policy ? money(policy.minimumAmount) : 0;
    return {
      currency: balance.currency || 'SAR',
      available,
      clearing,
      transferring,
      showTransferring: transferring > 0,
      nextClearance,
      hasClearing: clearing > 0,
      belowMinimum: !!policy && available > 0 && available < minimum
    };
  },

  summary(balances: readonly Balance[], policy: WithdrawalPolicy | null, now = Date.now()): EarningsSummary {
    const views = balances.map(balance => Earnings.view(balance, policy, now));
    return {
      balances: views,
      empty: views.every(v => v.available <= 0 && v.clearing <= 0 && v.transferring <= 0),
      policy
    };
  }
} as const;
