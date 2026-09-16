import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Balance } from '@features/earnings/models/earnings';
import { OnboardingState } from '@features/teacher-setup/models/readiness';
import { Row } from '../models/teacher-home';
import { OpportunityPage, TeacherHomeGateway } from './teacher-home.ports';

type Json = Record<string, unknown>;
interface Page { readonly items?: readonly Row[]; readonly totalCount?: number }

/** The contract gate reads literal URLs, so each read spells its own out rather than sharing a helper. */
const items = (page: Page): readonly Row[] => page?.items ?? [];
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const money = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

@Injectable()
export class HttpTeacherHomeGateway implements TeacherHomeGateway {
  private readonly http = inject(HttpClient);

  onboarding(): Observable<OnboardingState> {
    return this.http.get<Json>('/api/v1/teachers/onboarding-status').pipe(map(x => ({
      status: Number(x['status'] ?? -1),
      emailConfirmed: !!x['emailConfirmed'],
      approvedSubjectIds: list(x['approvedSubjectIds']).map(String),
      profileComplete: !!x['profileComplete'],
      hasActiveService: !!x['hasActiveService'],
      hasAvailability: !!x['hasAvailability'],
      hasPublicSample: !!x['hasPublicSample'],
      isPublished: !!x['isPublished'],
      readyForPublication: !!x['readyForPublication'],
      blockingReasons: list(x['blockingReasons']).map(String),
      missingRequirements: list(x['missingRequirements']).map(String)
    })));
  }

  waitingRequests(): Observable<readonly Row[]> {
    return this.http.get<Page>('/api/v1/learning-requests/assigned?status=0&page=1&pageSize=50').pipe(map(items));
  }

  assignedOrders(): Observable<readonly Row[]> {
    return this.http.get<Page>('/api/v1/orders/assigned?page=1&pageSize=50').pipe(map(items));
  }

  sessions(): Observable<readonly Row[]> {
    return this.http.get<Page>('/api/v1/live-sessions/mine?page=1&pageSize=50').pipe(map(items));
  }

  opportunities(): Observable<OpportunityPage> {
    return this.http.get<Page>('/api/v1/open-marketplace/opportunities?page=1&pageSize=20').pipe(
      map(page => ({ items: page?.items ?? [], totalCount: Number(page?.totalCount ?? 0) })));
  }

  /** FIN-01's contract, read here for the summary; the full earnings screen owns the policy. */
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
}
