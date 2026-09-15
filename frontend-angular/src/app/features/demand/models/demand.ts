/**
 * Demand: a student's learning request - direct to one teacher, or published to the open
 * marketplace - and the offers teachers send against an open one.
 *
 * The numbers are the API's enums (`LearningRequestStatus`, `RequestSourcingMode`,
 * `TeacherOfferStatus`), serialized as integers. What a participant may do is read from the
 * status the server returned, mirroring the domain's own guards; the server stays the
 * authority and refuses anything these rules would have allowed by mistake.
 */

export const REQUEST_STATUS = {
  PENDING_TEACHER_REVIEW: 0, CLARIFICATION_REQUESTED: 1, ACCEPTED: 2, DECLINED: 3, CANCELLED: 4,
  OPEN_FOR_OFFERS: 5, AWAITING_PAYMENT: 6, CONVERTED_TO_ORDER: 7, EXPIRED: 8
} as const;

export const SOURCING = { DIRECT: 0, OPEN: 1 } as const;

export const OFFER_STATUS = { SUBMITTED: 0, SELECTED: 1, ACCEPTED: 2, WITHDRAWN: 3, NOT_SELECTED: 4, EXPIRED: 5 } as const;

export const OPEN_REQUEST_LIMITS = { title: 200, requirements: 5000, budget: 1_000_000 } as const;
export const OFFER_LIMITS = { amountMin: 0.01, amountMax: 1_000_000, hoursMax: 8760, revisionsMax: 20, validityMax: 720, message: 2000 } as const;

export interface Attachment {
  readonly id: string;
  readonly name: string;
  readonly contentType: string;
  readonly size: number;
}

export interface Clarification {
  readonly id: string;
  readonly senderId: string;
  readonly message: string;
  readonly createdAt: string;
}

/** `GET /learning-requests/{id}`: the request as its student or assigned teacher sees it. */
export interface LearningRequest {
  readonly id: string;
  readonly studentId: string;
  readonly teacherId: string;
  readonly teacherServiceId: string;
  readonly title: string;
  readonly description: string;
  readonly preferredDeliveryAt: string;
  readonly budget: number | null;
  readonly status: number;
  readonly sourcing: number;
  readonly createdAt: string;
  readonly attachments: readonly Attachment[];
  readonly clarifications: readonly Clarification[];
  readonly version: string;
  readonly studentName: string;
  readonly teacherName: string;
  readonly serviceName: string;
  readonly serviceNameArabic: string;
  readonly selectedOfferId: string;
  readonly reservationExpiresAt: string;
  readonly offerCount: number | null;
  readonly resultOrderStatus: number | null;
}

export interface Offer {
  readonly id: string;
  readonly requestId: string;
  readonly teacherId: string;
  readonly teacherName: string;
  readonly teacherNameEnglish: string;
  readonly amount: number;
  readonly currency: string;
  readonly deliveryHours: number;
  readonly includedRevisions: number;
  readonly message: string;
  readonly status: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly validUntil: string;
  readonly version: string;
  readonly rating: number | null;
  readonly reviewCount: number;
  readonly profileUrl: string;
}

/** `OpenRequestDto`: an open request as its student, or an eligible teacher, sees it. */
export interface OpenRequest {
  readonly id: string;
  readonly subjectId: string;
  readonly serviceTypeId: string;
  readonly title: string;
  readonly requirements: string;
  readonly deadline: string;
  readonly budgetMin: number | null;
  readonly budgetMax: number | null;
  readonly currency: string;
  readonly status: number;
  readonly publishedAt: string;
  readonly reservationExpiresAt: string;
  readonly selectedOfferId: string;
  readonly subjectName: string;
  readonly subjectNameArabic: string;
  readonly serviceName: string;
  readonly serviceNameArabic: string;
  readonly attachments: readonly Attachment[];
  readonly version: string;
  readonly offerCount: number | null;
  readonly myOffer: Offer | null;
}

export interface CatalogOption {
  readonly id: string;
  readonly name: string;
  readonly nameArabic: string;
}

export interface OpenRequestDraft {
  readonly subjectId: string;
  readonly serviceTypeId: string;
  readonly title: string;
  readonly requirements: string;
  /** `YYYY-MM-DDTHH:mm` in the browser's zone. */
  readonly deadline: string;
  readonly budgetMin: number | null;
  readonly budgetMax: number | null;
}

/** The body of `POST /open-marketplace/requests` (`CreateOpenLearningRequest`). */
export interface OpenRequestInput {
  readonly subjectId: string;
  readonly serviceCatalogItemId: string;
  readonly title: string;
  readonly requirements: string;
  readonly deadline: string;
  readonly budgetMin: number | null;
  readonly budgetMax: number | null;
}

export interface OfferDraft {
  readonly amount: number | null;
  readonly deliveryHours: number | null;
  readonly includedRevisions: number | null;
  readonly validityHours: number | null;
  readonly message: string;
}

/** The body of `POST …/offers` and `PUT /open-marketplace/offers/{id}` (`SubmitTeacherOffer`). */
export interface OfferInput {
  readonly amount: number;
  readonly deliveryHours: number;
  readonly includedRevisions: number;
  readonly validityHours: number;
  readonly message: string;
}

export type DraftProblem = 'required' | 'too_long' | 'out_of_range' | 'in_past' | 'budget_pair' | 'budget_order';

const STATUS_KEYS = [
  'demand_status_pending', 'demand_status_clarification', 'demand_status_accepted', 'demand_status_declined',
  'demand_status_cancelled', 'demand_status_open', 'demand_status_reserved', 'demand_status_converted', 'demand_status_expired'
] as const;

const OFFER_STATUS_KEYS = [
  'offer_status_submitted', 'offer_status_selected', 'offer_status_accepted', 'offer_status_withdrawn',
  'offer_status_not_selected', 'offer_status_expired'
] as const;

export const Demand = {
  statusKey(status: number): string { return STATUS_KEYS[status] ?? 'demand_status_unknown'; },
  offerStatusKey(status: number): string { return OFFER_STATUS_KEYS[status] ?? 'demand_status_unknown'; },

  statusTone(status: number): 'neutral' | 'info' | 'warning' | 'success' | 'danger' {
    switch (status) {
      case REQUEST_STATUS.PENDING_TEACHER_REVIEW: case REQUEST_STATUS.OPEN_FOR_OFFERS: return 'info';
      case REQUEST_STATUS.CLARIFICATION_REQUESTED: case REQUEST_STATUS.AWAITING_PAYMENT: return 'warning';
      case REQUEST_STATUS.ACCEPTED: case REQUEST_STATUS.CONVERTED_TO_ORDER: return 'success';
      case REQUEST_STATUS.DECLINED: case REQUEST_STATUS.EXPIRED: return 'danger';
      default: return 'neutral';
    }
  },

  // ---- what the student may do (LearningRequest guards) ----
  canCancel(status: number): boolean {
    return ([REQUEST_STATUS.PENDING_TEACHER_REVIEW, REQUEST_STATUS.CLARIFICATION_REQUESTED,
      REQUEST_STATUS.OPEN_FOR_OFFERS, REQUEST_STATUS.AWAITING_PAYMENT] as number[]).includes(status);
  },
  canReplyToClarification(status: number): boolean { return status === REQUEST_STATUS.CLARIFICATION_REQUESTED; },
  hasOrder(status: number): boolean {
    return status === REQUEST_STATUS.ACCEPTED || status === REQUEST_STATUS.CONVERTED_TO_ORDER;
  },

  // ---- what the assigned teacher may do ----
  canAccept(status: number): boolean { return status === REQUEST_STATUS.PENDING_TEACHER_REVIEW; },
  canRequestClarification(status: number): boolean { return status === REQUEST_STATUS.PENDING_TEACHER_REVIEW; },
  canDecline(status: number): boolean {
    return status === REQUEST_STATUS.PENDING_TEACHER_REVIEW || status === REQUEST_STATUS.CLARIFICATION_REQUESTED;
  },

  // ---- open marketplace ----
  canSelectOffers(request: Pick<OpenRequest, 'status'>): boolean { return request.status === REQUEST_STATUS.OPEN_FOR_OFFERS; },
  isReserved(request: Pick<OpenRequest, 'status' | 'reservationExpiresAt'>): boolean {
    return request.status === REQUEST_STATUS.AWAITING_PAYMENT && !!request.reservationExpiresAt;
  },
  /** Seconds left on the reservation, for display only; payment is still decided by the server. */
  reservationSecondsLeft(expiresAt: string, now: number): number {
    const end = Date.parse(expiresAt);
    return Number.isNaN(end) ? 0 : Math.max(0, Math.floor((end - now) / 1000));
  },
  /** A teacher's offer can be changed or withdrawn only while it is merely submitted (`TeacherOffer`). */
  canEditOffer(offer: Pick<Offer, 'status'> | null): boolean { return offer?.status === OFFER_STATUS.SUBMITTED; },
  canResubmitOffer(offer: Pick<Offer, 'status'> | null): boolean { return offer?.status === OFFER_STATUS.WITHDRAWN; },
  liveOffers(offers: readonly Offer[]): readonly Offer[] {
    return offers.filter(offer => offer.status === OFFER_STATUS.SUBMITTED || offer.status === OFFER_STATUS.SELECTED);
  },

  countdown(seconds: number): string {
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
    return `${h > 0 ? `${h}:` : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
  },

  // ---- forms ----
  emptyOpenDraft(): OpenRequestDraft {
    return { subjectId: '', serviceTypeId: '', title: '', requirements: '', deadline: '', budgetMin: null, budgetMax: null };
  },

  /** `CreateOpenLearningRequest` and `LearningRequest.PublishOpen`, checked before sending. */
  openProblems(draft: OpenRequestDraft, now: number): Partial<Record<keyof OpenRequestDraft, DraftProblem>> {
    const problems: Partial<Record<keyof OpenRequestDraft, DraftProblem>> = {};
    if (!draft.subjectId) problems.subjectId = 'required';
    if (!draft.serviceTypeId) problems.serviceTypeId = 'required';
    if (!draft.title.trim()) problems.title = 'required';
    else if (draft.title.trim().length > OPEN_REQUEST_LIMITS.title) problems.title = 'too_long';
    if (!draft.requirements.trim()) problems.requirements = 'required';
    else if (draft.requirements.trim().length > OPEN_REQUEST_LIMITS.requirements) problems.requirements = 'too_long';
    const deadline = Date.parse(draft.deadline);
    if (!draft.deadline || Number.isNaN(deadline)) problems.deadline = 'required';
    else if (deadline <= now) problems.deadline = 'in_past';
    const { budgetMin: min, budgetMax: max } = draft;
    if ((min === null) !== (max === null)) problems.budgetMax = 'budget_pair';
    else if (min !== null && max !== null) {
      if (min < 0 || max < 0 || min > OPEN_REQUEST_LIMITS.budget || max > OPEN_REQUEST_LIMITS.budget) problems.budgetMax = 'out_of_range';
      else if (max < min) problems.budgetMax = 'budget_order';
    }
    return problems;
  },

  openInput(draft: OpenRequestDraft): OpenRequestInput {
    return {
      subjectId: draft.subjectId, serviceCatalogItemId: draft.serviceTypeId,
      title: draft.title.trim(), requirements: draft.requirements.trim(),
      deadline: new Date(draft.deadline).toISOString(), budgetMin: draft.budgetMin, budgetMax: draft.budgetMax
    };
  },

  emptyOffer(): OfferDraft {
    return { amount: null, deliveryHours: 48, includedRevisions: 2, validityHours: 168, message: '' };
  },

  offerDraft(offer: Offer, now: number): OfferDraft {
    const hoursLeft = Math.ceil((Date.parse(offer.validUntil) - now) / 3_600_000);
    return {
      amount: offer.amount, deliveryHours: offer.deliveryHours, includedRevisions: offer.includedRevisions,
      validityHours: Number.isFinite(hoursLeft) ? Math.min(OFFER_LIMITS.validityMax, Math.max(1, hoursLeft)) : 168,
      message: offer.message
    };
  },

  /** `SubmitTeacherOffer`, checked before sending. */
  offerProblems(draft: OfferDraft): Partial<Record<keyof OfferDraft, DraftProblem>> {
    const problems: Partial<Record<keyof OfferDraft, DraftProblem>> = {};
    const range = (value: number | null, min: number, max: number, integer: boolean): DraftProblem | null =>
      value === null || !Number.isFinite(value) ? 'required'
        : value < min || value > max || (integer && !Number.isInteger(value)) ? 'out_of_range' : null;
    const amount = range(draft.amount, OFFER_LIMITS.amountMin, OFFER_LIMITS.amountMax, false)
      ?? (!/^\d+(\.\d{1,2})?$/.test(String(draft.amount)) ? 'out_of_range' : null);
    if (amount) problems.amount = amount;
    const hours = range(draft.deliveryHours, 1, OFFER_LIMITS.hoursMax, true);
    if (hours) problems.deliveryHours = hours;
    const revisions = range(draft.includedRevisions, 0, OFFER_LIMITS.revisionsMax, true);
    if (revisions) problems.includedRevisions = revisions;
    const validity = range(draft.validityHours, 1, OFFER_LIMITS.validityMax, true);
    if (validity) problems.validityHours = validity;
    if (!draft.message.trim()) problems.message = 'required';
    else if (draft.message.trim().length > OFFER_LIMITS.message) problems.message = 'too_long';
    return problems;
  },

  offerInput(draft: OfferDraft): OfferInput {
    return {
      amount: draft.amount ?? 0, deliveryHours: draft.deliveryHours ?? 0, includedRevisions: draft.includedRevisions ?? 0,
      validityHours: draft.validityHours ?? 0, message: draft.message.trim()
    };
  },

  localName(item: { name: string; nameArabic: string }, rtl: boolean): string {
    return (rtl ? item.nameArabic : '') || item.name || item.nameArabic;
  }
} as const;
