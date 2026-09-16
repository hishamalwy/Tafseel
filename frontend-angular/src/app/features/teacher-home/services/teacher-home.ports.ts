import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Balance } from '@features/earnings/models/earnings';
import { OnboardingState } from '@features/teacher-setup/models/readiness';
import { Row } from '../models/teacher-home';

/** One page of open requests, with how many there are in total. */
export interface OpportunityPage {
  readonly items: readonly Row[];
  readonly totalCount: number;
}

/**
 * The reads the teacher's home is composed from (UX-02). There is no home endpoint and this ticket does not
 * add one: these are the authoritative contracts the item screens already use. `onboarding` decides the
 * whole view, so it is asked first and alone.
 */
export interface TeacherHomeGateway {
  onboarding(): Observable<OnboardingState>;
  /** Assigned requests still waiting for this teacher (`status=0`, filtered server-side). */
  waitingRequests(): Observable<readonly Row[]>;
  assignedOrders(): Observable<readonly Row[]>;
  sessions(): Observable<readonly Row[]>;
  opportunities(): Observable<OpportunityPage>;
  balances(): Observable<readonly Balance[]>;
}

export const TEACHER_HOME_GATEWAY = new InjectionToken<TeacherHomeGateway>('TeacherHomeGateway');
