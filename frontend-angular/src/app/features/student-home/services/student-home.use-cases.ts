import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Row } from '../models/student-home';
import { STUDENT_HOME_GATEWAY } from './student-home.ports';

export interface HomeData {
  readonly requests: readonly Row[];
  readonly orders: readonly Row[];
  readonly sessions: readonly Row[];
  /** True when at least one list failed: the home says so instead of pretending nothing is waiting. */
  readonly partial: boolean;
}

/**
 * The student's own work, read from the three lists at once (UX-01).
 *
 * A list that fails is not the same as a list that is empty: if one fails the others still render and the
 * page shows an inline notice, because "nothing needs your attention" would be a lie. If all three fail
 * there is nothing honest to show and the failure is raised.
 */
@Injectable()
export class LoadStudentHome {
  private readonly gateway = inject(STUDENT_HOME_GATEWAY);

  async execute(): Promise<HomeData> {
    const [requests, orders, sessions] = await Promise.allSettled([
      firstValueFrom(this.gateway.requests()),
      firstValueFrom(this.gateway.orders()),
      firstValueFrom(this.gateway.sessions())
    ]);
    if (requests.status === 'rejected' && orders.status === 'rejected' && sessions.status === 'rejected')
      throw requests.reason;
    return {
      requests: requests.status === 'fulfilled' ? requests.value : [],
      orders: orders.status === 'fulfilled' ? orders.value : [],
      sessions: sessions.status === 'fulfilled' ? sessions.value : [],
      partial: [requests, orders, sessions].some(result => result.status === 'rejected')
    };
  }
}
