import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, map } from 'rxjs';
import { LiveSession, SessionAttachment } from '../models/live-session';

type Json = Record<string, any>;

/** Live-session bookings for their participants. Every change carries the version read (If-Match). */
@Injectable()
export class LiveSessionGateway {
  private readonly http = inject(HttpClient);

  /** There is no by-id read; the participant's own bookings are paged until it is found. */
  async find(id: string): Promise<LiveSession | null> {
    for (let page = 1; page <= 20; page++) {
      const result = await firstValueFrom(this.http.get<Json>(`/api/v1/live-sessions/mine?page=${page}&pageSize=50`));
      const items = (result['items'] ?? []) as Json[];
      const match = items.find(x => String(x['id']).toLowerCase() === id.toLowerCase());
      if (match) return session(match);
      if (items.length < 50) return null;
    }
    return null;
  }

  join(id: string): Observable<{ url: string; validFrom: string; validUntil: string }> {
    return this.http.get<Json>(`/api/v1/live-sessions/${encodeURIComponent(id)}/join`)
      .pipe(map(x => ({ url: text(x['url']), validFrom: text(x['validFrom']), validUntil: text(x['validUntil']) })));
  }

  complete(id: string, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/live-sessions/${encodeURIComponent(id)}/complete`, null, { headers: ifMatch(version) });
  }

  noShow(id: string, studentNoShow: boolean, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/live-sessions/${encodeURIComponent(id)}/no-show`, { studentNoShow }, { headers: ifMatch(version) });
  }

  confirmSettlement(id: string, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/live-sessions/${encodeURIComponent(id)}/settlement/confirm`, null, { headers: ifMatch(version) });
  }

  cancel(id: string, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/live-sessions/${encodeURIComponent(id)}/cancel`, null, { headers: ifMatch(version) });
  }

  reschedule(id: string, input: { localStart: string; timeZoneId: string }, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/live-sessions/${encodeURIComponent(id)}/reschedule`,
      { localStart: input.localStart, timeZoneId: input.timeZoneId }, { headers: ifMatch(version) });
  }

  respondToReschedule(id: string, accept: boolean, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/live-sessions/${encodeURIComponent(id)}/reschedule/respond`, { accept }, { headers: ifMatch(version) });
  }

  attach(id: string, file: File, version: string): Observable<void> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<void>(`/api/v1/live-sessions/${encodeURIComponent(id)}/attachments`, form, { headers: ifMatch(version) });
  }

  conversation(id: string, otherUserId: string): Observable<string> {
    return this.http.post<{ id: string }>('/api/v1/conversations', { otherUserId, scope: 3, resourceId: id })
      .pipe(map(conversation => conversation.id));
  }

  attachmentPath(attachmentId: string): string {
    return `/api/v1/live-sessions/attachments/${encodeURIComponent(attachmentId)}/content`;
  }
}

function ifMatch(version: string): HttpHeaders {
  return new HttpHeaders({ 'If-Match': version });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function session(x: Json): LiveSession {
  return {
    id: text(x['id']), studentId: text(x['studentId']), teacherId: text(x['teacherId']), title: text(x['title']), notes: text(x['notes']),
    startsAt: text(x['startsAt']), endsAt: text(x['endsAt']), studentTimeZoneId: text(x['studentTimeZoneId']),
    teacherTimeZoneId: text(x['teacherTimeZoneId']), totalPrice: Number(x['totalPrice'] ?? 0), currency: text(x['currency']),
    cancellationWindowHours: Number(x['cancellationWindowHours'] ?? 24), status: Number(x['status'] ?? -1),
    attachments: ((x['attachments'] ?? []) as Json[]).map((a): SessionAttachment => ({ id: text(a['id']), name: text(a['originalName']), contentType: text(a['contentType']) })),
    version: text(x['version']), studentName: text(x['studentDisplayName']), teacherName: text(x['teacherDisplayName']),
    serviceName: text(x['serviceNameEnglish']), serviceNameArabic: text(x['serviceNameArabic']),
    proposedStartsAt: text(x['proposedStartsAt']), rescheduleRequestedById: text(x['rescheduleRequestedById']),
    outcomeReviewDeadline: text(x['outcomeReviewDeadline']), rescheduleCount: Number(x['rescheduleCount'] ?? 0)
  };
}
