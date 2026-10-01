import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Balance, EarningsStatement, WithdrawalPolicy } from '../models/earnings';
import { PayoutProfile, PayoutProfileInput, Withdrawal } from '../models/payouts';

/**
 * The teacher's own money reads. The statement explains the balance; the CSV statement and the business
 * analytics remain `B11-09`.
 */
export interface EarningsGateway {
  balances(): Observable<readonly Balance[]>;
  policy(): Observable<WithdrawalPolicy>;
  /** Each earning's price, commission and net, and what was transferred (`GET /withdrawals/earnings`). */
  statement(): Observable<EarningsStatement>;
  /** Null when the teacher has not added payout details yet (the API answers 204). */
  payoutProfile(): Observable<PayoutProfile | null>;
  savePayoutProfile(input: PayoutProfileInput): Observable<PayoutProfile>;
  withdrawals(): Observable<readonly Withdrawal[]>;
  /** `Idempotency-Key` makes a repeated click or a retry join the same request. */
  requestWithdrawal(amount: number, currency: string, idempotencyKey: string): Observable<Withdrawal>;
}

export const EARNINGS_GATEWAY = new InjectionToken<EarningsGateway>('EarningsGateway');
