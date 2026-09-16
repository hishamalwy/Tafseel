import { describe, expect, it } from 'vitest';
import { Balance, Earnings, WithdrawalPolicy } from './earnings';

const NOW = Date.parse('2026-09-16T12:00:00Z');
const policy: WithdrawalPolicy = { minimumAmount: 50, currency: 'SAR', expectedSettlementBusinessDays: 3 };
const balance = (over: Partial<Balance> = {}): Balance =>
  ({ currency: 'SAR', available: 0, pendingWithdrawal: 0, pendingClearance: 0, nextClearanceAt: null, ...over });

describe('FIN-01 earnings model', () => {
  it('separates what can be withdrawn, what is clearing and what is on its way', () => {
    const view = Earnings.view(balance({ available: 200, pendingClearance: 127.5, pendingWithdrawal: 60 }), policy, NOW);
    expect(view).toMatchObject({ available: 200, clearing: 127.5, transferring: 60, showTransferring: true, hasClearing: true });
    expect(view.belowMinimum).toBe(false);
  });

  it('does not offer a "being transferred" card when nothing is being transferred', () => {
    expect(Earnings.view(balance({ available: 200 }), policy, NOW).showTransferring).toBe(false);
    expect(Earnings.view(balance({ available: 200, pendingWithdrawal: 0.5 }), policy, NOW).showTransferring).toBe(true);
  });

  it('names the next clearance date, says "soon" once it has passed, and stays quiet with nothing clearing', () => {
    const future = Earnings.view(balance({ pendingClearance: 100, nextClearanceAt: '2026-09-23T10:00:00Z' }), policy, NOW);
    expect(future.nextClearance).toEqual({ kind: 'date', at: '2026-09-23T10:00:00.000Z' });
    // The maturity scan runs on its own schedule; a date that has just passed must not read as the past.
    const passed = Earnings.view(balance({ pendingClearance: 100, nextClearanceAt: '2026-09-16T11:00:00Z' }), policy, NOW);
    expect(passed.nextClearance).toEqual({ kind: 'soon' });
    expect(Earnings.view(balance({ pendingClearance: 100 }), policy, NOW).nextClearance).toEqual({ kind: 'none' });
    expect(Earnings.view(balance({ available: 100, nextClearanceAt: '2026-09-23T10:00:00Z' }), policy, NOW).nextClearance).toEqual({ kind: 'none' });
  });

  it('tells a teacher they are under the minimum, using the policy rather than a constant', () => {
    expect(Earnings.view(balance({ available: 20 }), policy, NOW).belowMinimum).toBe(true);
    expect(Earnings.view(balance({ available: 20 }), { ...policy, minimumAmount: 10 }, NOW).belowMinimum).toBe(false);
    expect(Earnings.view(balance({ available: 0 }), policy, NOW).belowMinimum).toBe(false);
    // Without the policy there is no minimum to quote, so nothing is claimed.
    expect(Earnings.view(balance({ available: 20 }), null, NOW).belowMinimum).toBe(false);
  });

  it('calls no balances and all-zero balances empty, and anything else not empty', () => {
    expect(Earnings.summary([], policy, NOW).empty).toBe(true);
    expect(Earnings.summary([balance()], policy, NOW).empty).toBe(true);
    expect(Earnings.summary([balance({ pendingClearance: 1 })], policy, NOW).empty).toBe(false);
    expect(Earnings.summary([balance({ pendingWithdrawal: 1 })], policy, NOW).empty).toBe(false);
  });

  it('treats a missing or unusable amount as zero rather than showing nothing at all', () => {
    const view = Earnings.view({ currency: '', available: Number.NaN, pendingWithdrawal: undefined as never,
      pendingClearance: null as never, nextClearanceAt: 'not-a-date' }, policy, NOW);
    expect(view).toMatchObject({ currency: 'SAR', available: 0, clearing: 0, transferring: 0 });
    expect(view.nextClearance).toEqual({ kind: 'none' });
  });
});
