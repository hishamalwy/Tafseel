import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Row } from '../models/student-home';

/**
 * The three lists the student's home is composed from (UX-01). There is no home endpoint and this
 * ticket does not add one: these are the authoritative contracts the item screens already use.
 */
export interface StudentHomeGateway {
  requests(): Observable<readonly Row[]>;
  orders(): Observable<readonly Row[]>;
  sessions(): Observable<readonly Row[]>;
}

export const STUDENT_HOME_GATEWAY = new InjectionToken<StudentHomeGateway>('StudentHomeGateway');
