import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Balance, WithdrawalPolicy } from '../models/earnings';
import { EarningsGateway } from './earnings.ports';

type Json = Record<string, unknown>;

const money = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** `GET /withdrawals/balances` and `GET /withdrawals/policy`, both the teacher's own (server-authorized). */
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
}
