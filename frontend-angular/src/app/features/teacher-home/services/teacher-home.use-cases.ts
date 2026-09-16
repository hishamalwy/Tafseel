import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Balance } from '@features/earnings/models/earnings';
import { OnboardingState } from '@features/teacher-setup/models/readiness';
import { Row } from '../models/teacher-home';
import { awaitingQualification } from '../models/setup-card';
import { TEACHER_HOME_GATEWAY } from './teacher-home.ports';

/** Which sections could not be read; each says so where it would have been, and nothing else lies. */
export interface SectionErrors {
  readonly work: boolean;
  readonly opportunities: boolean;
  readonly earnings: boolean;
}

export interface TeacherHomeData {
  readonly onboarding: OnboardingState;
  readonly requests: readonly Row[];
  readonly orders: readonly Row[];
  readonly sessions: readonly Row[];
  readonly opportunities: readonly Row[];
  readonly opportunityCount: number;
  readonly balances: readonly Balance[];
  readonly failed: SectionErrors;
}

const settled = <T,>(result: PromiseSettledResult<T>, fallback: T): T =>
  result.status === 'fulfilled' ? result.value : fallback;

/**
 * The teacher's own state, read as the home needs it (UX-02).
 *
 * Readiness comes first and alone, because it decides the whole view: if it fails the home cannot honestly
 * claim the teacher is visible to students, so the failure is raised rather than guessed around. A teacher
 * still waiting on a qualification has nothing to read — no work, no opportunities, no money — so nothing
 * else is asked for. Everything after that is read in parallel and may fail on its own: a section that
 * failed says so where it would have been, and never becomes an empty list or a zero balance.
 */
@Injectable()
export class LoadTeacherHome {
  private readonly gateway = inject(TEACHER_HOME_GATEWAY);

  async execute(): Promise<TeacherHomeData> {
    const onboarding = await firstValueFrom(this.gateway.onboarding());
    const none: TeacherHomeData = {
      onboarding, requests: [], orders: [], sessions: [], opportunities: [], opportunityCount: 0, balances: [],
      failed: { work: false, opportunities: false, earnings: false }
    };
    if (awaitingQualification(onboarding)) return none;

    // Open requests are only offered to teachers students can already find.
    const visible = onboarding.isPublished;
    const [requests, orders, sessions, opportunities, balances] = await Promise.allSettled([
      firstValueFrom(this.gateway.waitingRequests()),
      firstValueFrom(this.gateway.assignedOrders()),
      firstValueFrom(this.gateway.sessions()),
      visible ? firstValueFrom(this.gateway.opportunities()) : Promise.resolve({ items: [], totalCount: 0 }),
      firstValueFrom(this.gateway.balances())
    ]);

    return {
      onboarding,
      requests: settled(requests, []),
      orders: settled(orders, []),
      sessions: settled(sessions, []),
      opportunities: settled(opportunities, { items: [], totalCount: 0 }).items,
      opportunityCount: settled(opportunities, { items: [], totalCount: 0 }).totalCount,
      balances: settled(balances, []),
      failed: {
        work: [requests, orders, sessions].some(result => result.status === 'rejected'),
        opportunities: opportunities.status === 'rejected',
        earnings: balances.status === 'rejected'
      }
    };
  }
}
