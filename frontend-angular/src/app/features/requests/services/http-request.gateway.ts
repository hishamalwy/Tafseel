import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BrowserPreferences } from '@core/storage/browser-preferences';
import {
  DRAFT_VERSION, REQUEST_FILE_LIMITS, RequestDraft, RequestableService, draftKey
} from '../models/learning-request';
import {
  BriefSuggestion, CreatedRequest, DraftStore, LearningPreferences, MarketplaceGateway,
  NewRequest, Offer, OpenRequest, RequestGateway
} from '../services/request.ports';

interface PageDto<T> { items?: T[] }

@Injectable()
export class HttpRequestGateway implements RequestGateway {
  private readonly http = inject(HttpClient);

  teacherServices(teacherId: string): Observable<readonly RequestableService[]> {
    return this.http
      .get<{ services?: RequestableService[] }>(`/api/v1/teachers/${encodeURIComponent(teacherId)}`)
      .pipe(map(profile => profile.services ?? []));
  }

  preferences(): Observable<LearningPreferences> {
    return this.http
      .get<Partial<LearningPreferences>>('/api/v1/students/me/learning-preferences')
      .pipe(map(prefs => ({
        explanationStyle: prefs?.explanationStyle ?? null,
        preferredTeachingLanguageId: prefs?.preferredTeachingLanguageId ?? null
      })));
  }

  /** CreateLearningRequest(TeacherServiceId, Title, Description, PreferredDeliveryAt, Budget) - nothing else. */
  create(request: NewRequest): Observable<CreatedRequest> {
    return this.http
      .post<{ id: string; version?: string }>('/api/v1/learning-requests', {
        teacherServiceId: request.teacherServiceId,
        title: request.title,
        description: request.description,
        preferredDeliveryAt: request.preferredDeliveryAt,
        budget: request.budget
      })
      .pipe(map(r => ({ id: r.id, version: r.version ?? '' })));
  }

  attach(requestId: string, file: File, version: string): Observable<void> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<void>(
      `/api/v1/learning-requests/${encodeURIComponent(requestId)}/attachments`, form,
      { headers: new HttpHeaders({ 'If-Match': version }) });
  }

  /** AiRequestAssistantInput(Notes) -> AiRequestAssistantResult(Status, Message, Draft). */
  assist(notes: string): Observable<BriefSuggestion> {
    return this.http
      .post<{ status?: string; message?: string; draft?: { suggestedDescription?: string } | null }>(
        '/api/v1/ai/request-assistant', { notes })
      .pipe(map(result => ({
        status: result.status ?? 'unavailable',
        message: result.message ?? '',
        suggestion: result.status === 'success' && result.draft?.suggestedDescription
          ? result.draft.suggestedDescription
          : null
      })));
  }
}

@Injectable()
export class HttpMarketplaceGateway implements MarketplaceGateway {
  private readonly http = inject(HttpClient);

  myRequests(): Observable<readonly OpenRequest[]> {
    return this.http
      .get<PageDto<OpenRequest>>('/api/v1/open-marketplace/requests?pageSize=50')
      .pipe(map(page => page.items ?? []));
  }

  opportunities(): Observable<readonly OpenRequest[]> {
    return this.http
      .get<PageDto<OpenRequest>>('/api/v1/open-marketplace/opportunities?pageSize=50')
      .pipe(map(page => page.items ?? []));
  }

  request(requestId: string): Observable<OpenRequest> {
    return this.http.get<OpenRequest>(
      `/api/v1/open-marketplace/requests/${encodeURIComponent(requestId)}`);
  }

  offers(requestId: string): Observable<readonly Offer[]> {
    return this.http
      .get<PageDto<Offer>>(
        `/api/v1/open-marketplace/requests/${encodeURIComponent(requestId)}/offers`)
      .pipe(map(page => page.items ?? []));
  }

  submitOffer(
    requestId: string, price: number, deliveryDays: number, message: string
  ): Observable<void> {
    return this.http.post<void>(
      `/api/v1/open-marketplace/requests/${encodeURIComponent(requestId)}/offers`,
      { price, deliveryDays, message });
  }

  acceptOffer(offerId: string): Observable<{ orderId: string }> {
    return this.http.post<{ orderId: string }>(
      `/api/v1/open-marketplace/offers/${encodeURIComponent(offerId)}/accept`, {});
  }

  publish(requestId: string): Observable<void> {
    return this.http.post<void>(
      `/api/v1/learning-requests/${encodeURIComponent(requestId)}/publish`, {});
  }
}

/**
 * Drafts in `localStorage`.
 *
 * A draft is a convenience, never a source of truth: anything unreadable or
 * from an older wizard is discarded rather than migrated, because a
 * half-understood draft restores the wizard into a state the user never left it
 * in. File *names* are kept so the review step can say which attachments were
 * lost; the files themselves cannot be persisted.
 */
@Injectable()
export class LocalDraftStore implements DraftStore {
  private readonly prefs = inject(BrowserPreferences);

  read(studentId: string, teacherId: string): RequestDraft | null {
    const raw = this.prefs.read(draftKey(studentId, teacherId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as RequestDraft;
      return parsed?.wizardVersion === DRAFT_VERSION ? parsed : null;
    } catch {
      return null;
    }
  }

  write(studentId: string, teacherId: string, draft: RequestDraft): void {
    const trimmed: RequestDraft = {
      ...draft,
      wizardVersion: DRAFT_VERSION,
      fileNames: draft.fileNames
        .map(name => String(name).slice(0, 255))
        .slice(0, REQUEST_FILE_LIMITS.maxFiles)
    };
    this.prefs.write(draftKey(studentId, teacherId), JSON.stringify(trimmed));
  }

  clear(studentId: string, teacherId: string): void {
    this.prefs.remove(draftKey(studentId, teacherId));
  }
}
