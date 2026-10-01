import { HttpClient, HttpHeaders } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  Dispute, DISPUTE_STATUS_BY_CODE, DisputeResolution, EligiblePurchase, RESOLUTION_CODE
} from '@features/disputes/models/dispute';
import {
  DisputeAdminGateway, DisputeGateway, OpenDisputeCommand, Page
} from '@features/disputes/services/dispute.ports';

interface DisputeDto {
  openedById?: string | null;
  id: string; status: number; reason: string; createdAt: string;
  orderId?: string | null; liveSessionBookingId?: string | null;
  studentId?: string; teacherId?: string; version?: string; actionDueAt?: string | null;
  messages?: { id: string; senderId: string; body: string; createdAt: string }[];
  evidence?: { id: string; fileName: string }[];
  history?: { nextStatus: number; createdAt: string }[];
  decisions?: { rationale: string }[];
}

function toDispute(dto: DisputeDto): Dispute {
  return {
    id: dto.id,
    status: DISPUTE_STATUS_BY_CODE[Number(dto.status)] ?? 'open',
    reason: dto.reason,
    createdAt: dto.createdAt,
    orderId: dto.orderId ?? null,
    liveSessionBookingId: dto.liveSessionBookingId ?? null,
    studentId: dto.studentId ?? '',
    teacherId: dto.teacherId ?? '',
    openedById: dto.openedById ?? null,
    version: dto.version ?? '',
    actionDueAt: dto.actionDueAt ?? null,
    messages: dto.messages ?? [],
    evidence: dto.evidence ?? [],
    history: (dto.history ?? []).map(h => ({
      nextStatus: DISPUTE_STATUS_BY_CODE[Number(h.nextStatus)] ?? 'open',
      createdAt: h.createdAt
    })),
    decisions: dto.decisions ?? []
  };
}

function toPage(result: { items?: DisputeDto[]; page?: number; totalCount?: number }): Page<Dispute> {
  return {
    items: (result.items ?? []).map(toDispute),
    page: Number(result.page ?? 1),
    totalCount: Number(result.totalCount ?? 0)
  };
}

/** `If-Match` carries the case version so a stale write is rejected, not merged. */
function concurrency(version: string, idempotencyKey?: string): HttpHeaders {
  let headers = new HttpHeaders({ 'If-Match': version });
  if (idempotencyKey) headers = headers.set('Idempotency-Key', idempotencyKey);
  return headers;
}

@Injectable()
export class HttpDisputeGateway implements DisputeGateway {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  list(page: number, pageSize: number): Observable<Page<Dispute>> {
    return this.http
      .get<{ items?: DisputeDto[]; page?: number; totalCount?: number }>(
        `/api/v1/disputes/mine?page=${page}&pageSize=${pageSize}`)
      .pipe(map(toPage));
  }

  byId(id: string): Observable<Dispute> {
    return this.http
      .get<DisputeDto>(`/api/v1/disputes/${encodeURIComponent(id)}`)
      .pipe(map(toDispute));
  }

  eligiblePurchases(): Observable<readonly EligiblePurchase[]> {
    return this.http
      .get<EligiblePurchase[]>('/api/v1/disputes/eligible')
      .pipe(map(list => list ?? []));
  }

  open(command: OpenDisputeCommand): Observable<Dispute> {
    const body = command.target.type === 'order'
      ? { reason: command.reason, orderId: command.target.id }
      : { reason: command.reason, liveSessionBookingId: command.target.id };
    return this.http.post<DisputeDto>('/api/v1/disputes', body).pipe(map(toDispute));
  }

  postMessage(id: string, body: string, version: string): Observable<void> {
    return this.http.post<void>(
      `/api/v1/disputes/${encodeURIComponent(id)}/messages`, { body },
      { headers: concurrency(version) });
  }

  postReviewerMessage(id: string, body: string, version: string): Observable<void> {
    return this.http.post<void>(
      `/api/v1/admin/disputes/${encodeURIComponent(id)}/messages`, { body },
      { headers: concurrency(version) });
  }

  uploadEvidence(id: string, file: File, version: string): Observable<void> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<void>(
      `/api/v1/disputes/${encodeURIComponent(id)}/evidence`, form,
      { headers: concurrency(version) });
  }

  /**
   * Evidence is behind the bearer token, so it cannot be a plain link. Fetch it,
   * hand the browser an object URL, and release it once the tab has taken it.
   */
  downloadEvidence(evidenceId: string, fileName: string): Observable<void> {
    return this.http
      .get(`/api/v1/dispute-evidence/${encodeURIComponent(evidenceId)}/content`,
           { responseType: 'blob' })
      .pipe(map(blob => {
        const url = URL.createObjectURL(blob);
        const anchor = this.document.createElement('a');
        anchor.href = url;
        anchor.download = fileName || 'evidence';
        this.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        // Revoked on the next tick: revoking synchronously can cancel the fetch
        // the click just started.
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }));
  }
}

@Injectable()
export class HttpDisputeAdminGateway implements DisputeAdminGateway {
  private readonly http = inject(HttpClient);

  list(page: number, pageSize: number): Observable<Page<Dispute>> {
    return this.http
      .get<{ items?: DisputeDto[]; page?: number; totalCount?: number }>(
        `/api/v1/admin/disputes?page=${page}&pageSize=${pageSize}`)
      .pipe(map(toPage));
  }

  byId(id: string): Observable<Dispute> {
    return this.http
      .get<DisputeDto>(`/api/v1/admin/disputes/${encodeURIComponent(id)}`)
      .pipe(map(toDispute));
  }

  startReview(id: string, version: string): Observable<void> {
    return this.http.post<void>(
      `/api/v1/admin/disputes/${encodeURIComponent(id)}/start-review`, {},
      { headers: concurrency(version) });
  }

  resolve(
    id: string, resolution: DisputeResolution, rationale: string,
    version: string, idempotencyKey: string
  ): Observable<void> {
    return this.http.post<void>(
      `/api/v1/admin/disputes/${encodeURIComponent(id)}/resolve`,
      { resolution: RESOLUTION_CODE[resolution], rationale },
      { headers: concurrency(version, idempotencyKey) });
  }
}
