import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Row } from '../models/student-home';
import { StudentHomeGateway } from './student-home.ports';

interface Page { readonly items?: readonly Row[] }

/** The contract gate reads literal URLs, so each list spells its own out rather than sharing a helper. */
const items = (page: Page): readonly Row[] => page?.items ?? [];

/**
 * One page of each list, newest first, as the item screens read them. Fifty is the server's own page
 * size; anything older than that is reachable from the full list, never from the home.
 */
@Injectable()
export class HttpStudentHomeGateway implements StudentHomeGateway {
  private readonly http = inject(HttpClient);

  requests(): Observable<readonly Row[]> {
    return this.http.get<Page>('/api/v1/learning-requests/mine?page=1&pageSize=50').pipe(map(items));
  }

  orders(): Observable<readonly Row[]> {
    return this.http.get<Page>('/api/v1/orders/mine?page=1&pageSize=50').pipe(map(items));
  }

  sessions(): Observable<readonly Row[]> {
    return this.http.get<Page>('/api/v1/live-sessions/mine?page=1&pageSize=50').pipe(map(items));
  }
}
