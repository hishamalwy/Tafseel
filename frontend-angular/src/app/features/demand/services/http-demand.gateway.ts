import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  Attachment, CatalogOption, Clarification, Demand, LearningRequest, Offer, OfferInput, OpenRequest, OpenRequestDraft, OpenRequestInput, MyOffer, OfferTerms, SavedOpenDraft } from '../models/demand';
import { DemandGateway, OrderRef } from './demand.ports';

type Json = Record<string, any>;

@Injectable()
export class HttpDemandGateway implements DemandGateway {
  private readonly http = inject(HttpClient);

  subjects(): Observable<readonly CatalogOption[]> {
    return this.http.get<Json[]>('/api/v1/subjects').pipe(map(rows => rows.map(option)));
  }

  openServiceTypes(): Observable<readonly CatalogOption[]> {
    return this.http.get<Json[]>('/api/v1/services').pipe(map(rows => rows
      .filter(x => x['orderType'] === 'async_request' && x['teacherSelectable'] !== false && x['isPublic'] !== false
        && x['requiresScheduling'] !== true && x['isActive'] !== false)
      .map(x => ({ id: text(x['id']), name: text(x['nameEn']) || text(x['name']), nameArabic: text(x['nameAr']),
        description: text(x['descriptionEn']) || text(x['description']), descriptionArabic: text(x['descriptionAr']) }))));
  }

  publish(input: OpenRequestInput): Observable<OpenRequest> {
    return this.http.post<Json>('/api/v1/open-marketplace/requests', {
      subjectId: input.subjectId, serviceCatalogItemId: input.serviceCatalogItemId, title: input.title,
      requirements: input.requirements, deadline: input.deadline, budgetMin: input.budgetMin, budgetMax: input.budgetMax,
      ...(input.draftId ? { draftId: input.draftId } : {})
    }).pipe(map(openRequest));
  }

  currentDraft(): Observable<SavedOpenDraft | null> {
    return this.http.get<Json>('/api/v1/open-marketplace/drafts/current', { observe: 'response' })
      .pipe(map(response => response.status === 204 || !response.body ? null : savedDraft(response.body)));
  }

  saveDraft(fields: OpenRequestDraft): Observable<SavedOpenDraft> {
    const deadline = fields.deadline ? Date.parse(fields.deadline) : NaN;
    return this.http.put<Json>('/api/v1/open-marketplace/drafts/current', {
      subjectId: fields.subjectId || null, serviceCatalogItemId: fields.serviceTypeId || null,
      title: fields.title, requirements: fields.requirements,
      deadline: Number.isNaN(deadline) ? null : new Date(deadline).toISOString(),
      budgetMin: fields.budgetMin, budgetMax: fields.budgetMax
    }).pipe(map(savedDraft));
  }

  uploadDraftFile(file: File): Observable<SavedOpenDraft> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post<Json>('/api/v1/open-marketplace/drafts/current/attachments', body).pipe(map(savedDraft));
  }

  removeDraftFile(attachmentId: string): Observable<SavedOpenDraft> {
    return this.http.delete<Json>(`/api/v1/open-marketplace/drafts/current/attachments/${encodeURIComponent(attachmentId)}`)
      .pipe(map(savedDraft));
  }

  request(id: string): Observable<LearningRequest> {
    return this.http.get<Json>(`/api/v1/learning-requests/${encodeURIComponent(id)}`).pipe(map(learningRequest));
  }

  cancel(id: string, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/learning-requests/${encodeURIComponent(id)}/cancel`, null, { headers: ifMatch(version) });
  }

  replyToClarification(id: string, message: string, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/learning-requests/${encodeURIComponent(id)}/reply-clarification`, { message },
      { headers: ifMatch(version) });
  }

  attach(id: string, file: File, version: string): Observable<void> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<void>(`/api/v1/learning-requests/${encodeURIComponent(id)}/attachments`, form,
      { headers: ifMatch(version) });
  }

  requestClarification(id: string, message: string, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/learning-requests/${encodeURIComponent(id)}/request-clarification`, { message },
      { headers: ifMatch(version) });
  }

  decline(id: string, reason: string, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/learning-requests/${encodeURIComponent(id)}/decline`, { reason },
      { headers: ifMatch(version) });
  }

  orders(asTeacher: boolean): Observable<readonly OrderRef[]> {
    const source = asTeacher ? this.http.get<Json>('/api/v1/orders/assigned?page=1&pageSize=50')
      : this.http.get<Json>('/api/v1/orders/mine?page=1&pageSize=50');
    return source.pipe(map(page => ((page['items'] ?? []) as Json[])
      .map(x => ({
        id: text(x['id']), learningRequestId: text(x['learningRequestId']),
        price: Number(x['price']) || 0, currency: text(x['currency']) || 'SAR',
        studentFeePercent: Number(x['studentFeePercent']) || 0,
        studentFeeAmount: Number(x['studentFeeAmount']) || 0,
        studentTotal: Number(x['studentTotal']) || 0,
        paymentStatus: Number(x['paymentStatus']) || 0,
        listedPriceAtRequest: numberOrNull(x['listedPriceAtRequest']),
        listedCurrencyAtRequest: text(x['listedCurrencyAtRequest']) || null,
        priceChangeReason: text(x['priceChangeReason']) || null
      }))));
  }

  offerTerms(serviceTypeId: string): Observable<OfferTerms | null> {
    return this.http.get<Json[]>('/api/v1/teachers/me/marketplace-services').pipe(map(rows => {
      const x = (rows ?? []).find(row => text(row['id']) === serviceTypeId);
      if (!x) return null;
      const minDelivery = Math.max(1, Number(x['minimumDeliveryHours']) || 1);
      return {
        minPrice: Math.max(0.01, Number(x['minimumPrice']) || 0.01),
        maxPrice: Number(x['maximumPrice']) || 1_000_000,
        minDeliveryHours: minDelivery,
        maxDeliveryHours: Math.max(minDelivery, Number(x['maximumDeliveryHours']) || 8760),
        maxRevisions: Math.max(0, Number(x['maximumRevisions'] ?? 20))
      };
    }));
  }

  teacherReplyMinutes(teacherId: string): Observable<number | null> {
    return this.http.get<Json>(`/api/v1/teachers/${encodeURIComponent(teacherId)}`).pipe(
      map(x => { const n = Number(x['responseTimeMinutes']); return Number.isFinite(n) && n > 0 ? n : null; }));
  }

  myOffers(): Observable<readonly MyOffer[]> {
    return this.http.get<Json>('/api/v1/open-marketplace/offers/mine?page=1&pageSize=50').pipe(
      map(page => ((page['items'] ?? []) as Json[]).map(x => ({
        id: text(x['id']), requestId: text(x['learningRequestId']), requestTitle: text(x['requestTitle']),
        subjectName: text(x['subjectName']), subjectNameArabic: text(x['subjectNameArabic']) || null,
        serviceName: text(x['serviceName']), serviceNameArabic: text(x['serviceNameArabic']) || null,
        amount: Number(x['amount']) || 0, currency: text(x['currency']) || 'SAR',
        deliveryHours: Number(x['deliveryHours']) || 0, status: Number(x['status'] ?? -1),
        requestStatus: Number(x['requestStatus'] ?? -1), anotherTeacherChosen: x['anotherTeacherChosen'] === true,
        orderId: text(x['orderId']) || null, updatedAt: text(x['updatedAt'])
      }))));
  }

  openRequest(id: string): Observable<OpenRequest> {
    return this.http.get<Json>(`/api/v1/open-marketplace/requests/${encodeURIComponent(id)}`).pipe(map(openRequest));
  }

  offers(requestId: string): Observable<readonly Offer[]> {
    return this.http.get<Json[]>(`/api/v1/open-marketplace/requests/${encodeURIComponent(requestId)}/offers`)
      .pipe(map(rows => rows.map(offer)));
  }

  selectOffer(request: Pick<OpenRequest, 'id' | 'version'>, selected: Pick<Offer, 'id' | 'version'>): Observable<void> {
    return this.http.post<void>(
      `/api/v1/open-marketplace/requests/${encodeURIComponent(request.id)}/offers/${encodeURIComponent(selected.id)}/select`, null,
      { headers: new HttpHeaders({ 'If-Match': request.version, 'X-Offer-Version': selected.version }) });
  }

  cancelSelection(request: Pick<OpenRequest, 'id' | 'version'>): Observable<void> {
    return this.http.post<void>(`/api/v1/open-marketplace/requests/${encodeURIComponent(request.id)}/cancel-selection`, null,
      { headers: ifMatch(request.version) });
  }

  opportunity(id: string): Observable<OpenRequest> {
    return this.http.get<Json>(`/api/v1/open-marketplace/opportunities/${encodeURIComponent(id)}`).pipe(map(openRequest));
  }

  submitOffer(requestId: string, input: OfferInput): Observable<Offer> {
    return this.http.post<Json>(`/api/v1/open-marketplace/opportunities/${encodeURIComponent(requestId)}/offers`, {
      amount: input.amount, deliveryHours: input.deliveryHours, includedRevisions: input.includedRevisions,
      validityHours: input.validityHours, message: input.message
    }).pipe(map(offer));
  }

  updateOffer(current: Pick<Offer, 'id' | 'version'>, input: OfferInput): Observable<Offer> {
    return this.http.put<Json>(`/api/v1/open-marketplace/offers/${encodeURIComponent(current.id)}`, {
      amount: input.amount, deliveryHours: input.deliveryHours, includedRevisions: input.includedRevisions,
      validityHours: input.validityHours, message: input.message
    }, { headers: ifMatch(current.version) }).pipe(map(offer));
  }

  withdrawOffer(current: Pick<Offer, 'id' | 'version'>): Observable<void> {
    return this.http.post<void>(`/api/v1/open-marketplace/offers/${encodeURIComponent(current.id)}/withdraw`, null,
      { headers: ifMatch(current.version) });
  }
}

function ifMatch(version: string): HttpHeaders {
  return new HttpHeaders({ 'If-Match': version });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function option(x: Json): CatalogOption {
  return { id: text(x['id']), name: text(x['name']), nameArabic: text(x['nameAr']) };
}

function attachment(x: Json): Attachment {
  return { id: text(x['id']), name: text(x['originalName']), contentType: text(x['contentType']), size: Number(x['size'] ?? 0) };
}

function savedDraft(x: Json): SavedOpenDraft {
  const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  return {
    id: text(x['id']),
    fields: {
      subjectId: text(x['subjectId']), serviceTypeId: text(x['serviceCatalogItemId']),
      title: text(x['title']), requirements: text(x['requirements']),
      deadline: Demand.localInputValue(text(x['deadline']) || null),
      budgetMin: amount(x['budgetMin']), budgetMax: amount(x['budgetMax'])
    },
    attachments: Array.isArray(x['attachments']) ? (x['attachments'] as Json[]).map(attachment) : [],
    maxAttachments: typeof x['maxAttachments'] === 'number' ? x['maxAttachments'] as number : 5
  };
}

function clarification(x: Json): Clarification {
  return { id: text(x['id']), senderId: text(x['senderId']), message: text(x['message']), createdAt: text(x['createdAt']) };
}

export function learningRequest(x: Json): LearningRequest {
  return {
    listedPriceAtRequest: numberOrNull(x['listedPriceAtRequest']),
    id: text(x['id']), studentId: text(x['studentId']), teacherId: text(x['teacherId']), teacherServiceId: text(x['teacherServiceId']),
    title: text(x['title']), description: text(x['description']), preferredDeliveryAt: text(x['preferredDeliveryAt']),
    budget: numberOrNull(x['budget']), status: Number(x['status'] ?? -1), sourcing: Number(x['sourcingMode'] ?? 0),
    createdAt: text(x['createdAt']), attachments: (x['attachments'] ?? []).map(attachment),
    // Oldest first, like any conversation: the server lists newest first, which put each answer above its question.
    clarifications: [...(x['clarifications'] ?? []).map(clarification)].sort((p, q) => p.createdAt.localeCompare(q.createdAt)), version: text(x['version']),
    studentName: text(x['studentDisplayName']), teacherName: text(x['teacherDisplayName']),
    serviceName: text(x['serviceNameEnglish']), serviceNameArabic: text(x['serviceNameArabic']),
    selectedOfferId: text(x['selectedOfferId']), reservationExpiresAt: text(x['paymentReservationExpiresAt']),
    offerCount: numberOrNull(x['offerCount']), resultOrderStatus: numberOrNull(x['resultOrderStatus'])
  };
}

export function offer(x: Json): Offer {
  return {
    id: text(x['id']), requestId: text(x['learningRequestId']), teacherId: text(x['teacherId']),
    teacherName: text(x['teacherDisplayName']), teacherNameEnglish: text(x['teacherDisplayNameEnglish']),
    amount: Number(x['amount'] ?? 0), currency: text(x['currency']), deliveryHours: Number(x['deliveryHours'] ?? 0),
    includedRevisions: Number(x['includedRevisions'] ?? 0), message: text(x['message']), status: Number(x['status'] ?? -1),
    createdAt: text(x['createdAt']), updatedAt: text(x['updatedAt']), validUntil: text(x['validUntil']),
    version: text(x['version']), rating: numberOrNull(x['rating']), reviewCount: Number(x['reviewCount'] ?? 0),
    profileUrl: text(x['profileUrl'])
  };
}

export function openRequest(x: Json): OpenRequest {
  return {
    id: text(x['id']), subjectId: text(x['subjectId']), serviceTypeId: text(x['serviceCatalogItemId']),
    title: text(x['title']), requirements: text(x['requirements']), deadline: text(x['deadline']),
    budgetMin: numberOrNull(x['budgetMin']), budgetMax: numberOrNull(x['budgetMax']), currency: text(x['currency']),
    status: Number(x['status'] ?? -1), publishedAt: text(x['publishedAt']),
    reservationExpiresAt: text(x['paymentReservationExpiresAt']), selectedOfferId: text(x['selectedOfferId']),
    subjectName: text(x['subjectName']), subjectNameArabic: text(x['subjectNameArabic']),
    serviceName: text(x['serviceName']), serviceNameArabic: text(x['serviceNameArabic']),
    attachments: (x['attachments'] ?? []).map(attachment), version: text(x['version']),
    offerCount: numberOrNull(x['offerCount']), myOffer: x['myOffer'] ? offer(x['myOffer']) : null
  };
}
