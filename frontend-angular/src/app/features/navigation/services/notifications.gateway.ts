import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

/** A notification as the bell needs it; the copy itself comes from the UX-04 vocabulary, by type. */
export interface Notification {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly link: string | null;
  readonly createdAt: string;
  readonly read: boolean;
}

interface Page { readonly items?: readonly Record<string, unknown>[] }

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * The bell's reads and writes (UX-03). One page of twenty: the dot says there is something unread on it,
 * and never claims an exact total the server was not asked for.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsGateway {
  private readonly http = inject(HttpClient);

  latest(): Observable<readonly Notification[]> {
    return this.http.get<Page>('/api/v1/notifications?page=1&pageSize=20').pipe(
      map(page => (page?.items ?? []).map(row => ({
        id: text(row['id']),
        type: text(row['type']),
        title: text(row['title']),
        body: text(row['body']),
        link: text(row['link']) || null,
        createdAt: text(row['createdAt']),
        read: !!row['readAt']
      }))));
  }

  markRead(id: string): Observable<void> {
    return this.http.post<void>(`/api/v1/notifications/read?id=${encodeURIComponent(id)}`, {});
  }

  markAllRead(): Observable<void> {
    return this.http.post<void>('/api/v1/notifications/read', {});
  }
}
