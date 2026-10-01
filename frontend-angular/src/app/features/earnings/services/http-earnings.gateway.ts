import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Balance, EarningItem, EarningsStatement, EarningsTotals, WithdrawalPolicy } from '../models/earnings';
import { PayoutProfile, PayoutProfileInput, Payouts, Withdrawal } from '../models/payouts';
import { EarningsGateway } from './earnings.ports';

type Json = Record<string, unknown>;

const money = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The teacher's own balances, policy, statement, payout details and withdrawals (server-authorized). */
@Injectable()
export class HttpEarningsGateway implements EarningsGateway {
  private readonly http = inject(HttpClient);

  balances(): Observable<readonly Balance[]> {
    return this.http.get<Json[]>('/api/v1/withdrawals/balances').pipe(
      map(rows => (rows ?? []).map(row => ({
        currency: text(row['currency']) || 'SAR',
        available: money(row['available']),
        pendingWithdrawal: money(row['pendingWithdrawal']),
        pendingClearance: money(row['pendingClearance']),
        nextClearanceAt: text(row['nextClearanceAt']) || null
      }))));
  }

  policy(): Observable<WithdrawalPolicy> {
    return this.http.get<Json>('/api/v1/withdrawals/policy').pipe(
      map(row => ({
        minimumAmount: money(row['minimumAmount']),
        currency: text(row['currency']) || 'SAR',
        expectedSettlementBusinessDays: money(row['expectedSettlementBusinessDays'])
      })));
  }

  statement(): Observable<EarningsStatement> {
    return this.http.get<Json>('/api/v1/withdrawals/earnings?take=50').pipe(
      map(row => ({
        totals: ((row?.['totals'] as Json[] | undefined) ?? []).map(totals),
        items: ((row?.['items'] as Json[] | undefined) ?? []).map(earning),
        totalItems: money(row?.['totalItems'])
      })));
  }

  payoutProfile(): Observable<PayoutProfile | null> {
    return this.http.get<Json | null>('/api/v1/withdrawals/profile').pipe(map(row => (row ? profile(row) : null)));
  }

  savePayoutProfile(input: PayoutProfileInput): Observable<PayoutProfile> {
    return this.http.put<Json>('/api/v1/withdrawals/profile', input).pipe(map(profile));
  }

  withdrawals(): Observable<readonly Withdrawal[]> {
    return this.http.get<{ items?: Json[] }>('/api/v1/withdrawals/mine?page=1&pageSize=50')
      .pipe(map(page => (page?.items ?? []).map(withdrawal)));
  }

  requestWithdrawal(amount: number, currency: string, idempotencyKey: string): Observable<Withdrawal> {
    return this.http.post<Json>('/api/v1/withdrawals', { amount, currency },
      { headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }) }).pipe(map(withdrawal));
  }
}

function profile(row: Json): PayoutProfile {
  return {
    legalName: text(row['legalName']), countryCode: text(row['countryCode']), payoutMethod: text(row['payoutMethod']),
    destinationLabel: text(row['destinationLabel']), identityLast4: text(row['identityLast4']),
    state: Payouts.payoutState(row['status']), rejectionReason: text(row['rejectionReason']) || null,
    submittedAt: text(row['submittedAt']), reenrollmentRequired: row['reenrollmentRequired'] === true
  };
}

function withdrawal(row: Json): Withdrawal {
  return {
    id: text(row['id']), amount: money(row['amount']), currency: text(row['currency']) || 'SAR',
    state: Payouts.withdrawalState(row['status']), status: Number(row['status'] ?? 0),
    destinationLabel: text(row['destinationLabel']), rejectionReason: text(row['rejectionReason']) || null,
    createdAt: text(row['createdAt']), updatedAt: text(row['updatedAt']) || null,
    transferInitiatedAt: text(row['transferInitiatedAt']) || null, transferredAt: text(row['transferredAt']) || null,
    bankReference: Payouts.withdrawalState(row['status']) === 'transferred' ? text(row['providerReference']) || null : null
  };
}

function totals(row: Json): EarningsTotals {
  return {
    currency: text(row['currency']) || 'SAR', earned: money(row['earned']), available: money(row['available']),
    clearing: money(row['clearing']), inTransfer: money(row['inTransfer']), transferred: money(row['transferred']),
    transferredCount: money(row['transferredCount']), addsUp: row['addsUp'] === true
  };
}

function earning(row: Json): EarningItem {
  const state = text(row['state']);
  return {
    kind: text(row['kind']) === 'live_session' ? 'live_session' : 'order', referenceId: text(row['referenceId']),
    title: text(row['title']), earnedAt: text(row['earnedAt']),
    price: money(row['price']), commissionPercent: money(row['commissionPercent']), commission: money(row['commission']),
    adjustment: money(row['adjustment']), net: money(row['net']), currency: text(row['currency']) || 'SAR',
    state: state === 'clearing' || state === 'refunded' ? state : 'available',
    availableAt: text(row['availableAt']) || null
  };
}
