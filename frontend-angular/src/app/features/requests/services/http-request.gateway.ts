import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BrowserPreferences } from '@core/storage/browser-preferences';
import {
  DRAFT_VERSION, REQUEST_FILE_LIMITS, RequestDraft, RequestableService, draftKey
} from '../models/learning-request';
import {
  AiCapabilities, BriefSuggestion, CreatedRequest, DraftStore, LearningPreferences, MarketplaceGateway,
  NewRequest, Offer, OfferTerms, OpenRequest, RequestGateway
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

  /**
   * `AiCapabilitiesDto` — whether the writing helper may be offered at all (UX-08). Read once per wizard
   * load and shared, so a page does not ask the same question from several components.
   */
  aiCapabilities(): Observable<AiCapabilities> {
    return this.http.get<{ requestAssistant?: boolean }>('/api/v1/ai/capabilities')
      .pipe(map(result => ({ requestAssistant: result?.requestAssistant === true })));
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

/** `RequestSourcingMode.OpenMarketplace` on LearningRequestDto. */
const OPEN_MARKETPLACE = 1;
/** Catalog prices are SAR (ServiceCatalogItem.CurrencyCode); LearningRequestDto carries no currency. */
const PLATFORM_CURRENCY = 'SAR';

/** LearningRequestDto, the student's view. */
export interface StudentRequestDto {
  id: string; title: string; description: string; preferredDeliveryAt: string; budget: number | null;
  status: number; createdAt: string; version: string; sourcingMode: number;
  serviceNameEnglish?: string | null; serviceNameArabic?: string | null;
  selectedOfferId?: string | null; paymentReservationExpiresAt?: string | null; offerCount?: number | null;
}

/** OpenRequestDto, the teacher's view. */
export interface OpportunityDto {
  id: string; title: string; requirements: string; deadline: string;
  budgetMin: number | null; budgetMax: number | null; currency: string; status: number; publishedAt: string;
  paymentReservationExpiresAt: string | null; selectedOfferId: string | null;
  subjectName: string; subjectNameArabic: string | null; version: string;
  offerCount?: number | null; myOffer?: { id: string } | null;
}

/** TeacherOfferDto. */
export interface OfferDto {
  id: string; teacherId: string; amount: number; currency: string; deliveryHours: number; message: string;
  status: number; version: string; teacherDisplayName?: string | null; teacherDisplayNameEnglish?: string | null;
  includedRevisions?: number; validUntil?: string | null;
}

export function fromStudentRequest(dto: StudentRequestDto): OpenRequest {
  return {
    id: dto.id, title: dto.title, description: dto.description,
    subjectName: dto.serviceNameEnglish ?? dto.serviceNameArabic ?? '',
    subjectNameArabic: dto.serviceNameArabic ?? dto.serviceNameEnglish ?? '',
    status: dto.status, deadline: dto.preferredDeliveryAt ?? null, budget: dto.budget ?? null,
    currency: PLATFORM_CURRENCY, offerCount: dto.offerCount ?? 0, createdAt: dto.createdAt,
    version: dto.version, selectedOfferId: dto.selectedOfferId ?? null,
    paymentReservationExpiresAt: dto.paymentReservationExpiresAt ?? null, myOfferId: null
  };
}

export function fromOpportunity(dto: OpportunityDto): OpenRequest {
  return {
    id: dto.id, title: dto.title, description: dto.requirements,
    subjectName: dto.subjectName, subjectNameArabic: dto.subjectNameArabic ?? dto.subjectName,
    status: dto.status, deadline: dto.deadline ?? null, budget: dto.budgetMax ?? dto.budgetMin ?? null,
    currency: dto.currency || PLATFORM_CURRENCY, offerCount: dto.offerCount ?? 0, createdAt: dto.publishedAt,
    version: dto.version, selectedOfferId: dto.selectedOfferId ?? null,
    paymentReservationExpiresAt: dto.paymentReservationExpiresAt ?? null, myOfferId: dto.myOffer?.id ?? null
  };
}

export function fromOffer(dto: OfferDto): Offer {
  return {
    id: dto.id, teacherId: dto.teacherId,
    teacherDisplayName: dto.teacherDisplayName ?? null, teacherDisplayNameEnglish: dto.teacherDisplayNameEnglish ?? null,
    price: dto.amount, currency: dto.currency, deliveryHours: dto.deliveryHours,
    includedRevisions: dto.includedRevisions ?? 0, validUntil: dto.validUntil ?? null,
    message: dto.message, status: dto.status, version: dto.version
  };
}

@Injectable()
export class HttpMarketplaceGateway implements MarketplaceGateway {
  private readonly http = inject(HttpClient);

  /**
   * There is no GET on /open-marketplace/requests (that path only publishes). A student's open
   * requests are their own learning requests whose sourcing mode is the open marketplace.
   */
  myRequests(): Observable<readonly OpenRequest[]> {
    return this.http
      .get<PageDto<StudentRequestDto>>('/api/v1/learning-requests/mine?pageSize=50')
      .pipe(map(page => (page.items ?? [])
        .filter(request => request.sourcingMode === OPEN_MARKETPLACE)
        .map(fromStudentRequest)));
  }

  opportunities(): Observable<readonly OpenRequest[]> {
    return this.http
      .get<PageDto<OpportunityDto>>('/api/v1/open-marketplace/opportunities?pageSize=50')
      .pipe(map(page => (page.items ?? []).map(fromOpportunity)));
  }

  /** The API answers a plain array here, not a page. */
  offers(requestId: string): Observable<readonly Offer[]> {
    return this.http
      .get<OfferDto[]>(`/api/v1/open-marketplace/requests/${encodeURIComponent(requestId)}/offers`)
      .pipe(map(list => (list ?? []).map(fromOffer)));
  }

  submitOffer(requestId: string, terms: OfferTerms): Observable<void> {
    return this.http.post<void>(
      `/api/v1/open-marketplace/opportunities/${encodeURIComponent(requestId)}/offers`,
      {
        amount: terms.amount,
        deliveryHours: terms.deliveryHours,
        includedRevisions: terms.includedRevisions,
        validityHours: terms.validityHours,
        message: terms.message
      });
  }

  selectOffer(
    request: Pick<OpenRequest, 'id' | 'version'>, offer: Pick<Offer, 'id' | 'version'>
  ): Observable<void> {
    return this.http.post<void>(
      `/api/v1/open-marketplace/requests/${encodeURIComponent(request.id)}/offers/${encodeURIComponent(offer.id)}/select`,
      null,
      { headers: new HttpHeaders({ 'If-Match': request.version, 'X-Offer-Version': offer.version }) });
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
