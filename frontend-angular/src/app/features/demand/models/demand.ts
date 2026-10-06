/**
 * Demand: a student's learning request - direct to one teacher, or published to the open
 * marketplace - and the offers teachers send against an open one.
 *
 * The numbers are the API's enums (`LearningRequestStatus`, `RequestSourcingMode`,
 * `TeacherOfferStatus`), serialized as integers. What a participant may do is read from the
 * status the server returned, mirroring the domain's own guards; the server stays the
 * authority and refuses anything these rules would have allowed by mistake.
 */

import { Tone, Viewer, offerStatus, requestStatus } from '@shared/vocabulary/status-vocabulary';

export const REQUEST_STATUS = {
  PENDING_TEACHER_REVIEW: 0, CLARIFICATION_REQUESTED: 1, ACCEPTED: 2, DECLINED: 3, CANCELLED: 4,
  OPEN_FOR_OFFERS: 5, AWAITING_PAYMENT: 6, CONVERTED_TO_ORDER: 7, EXPIRED: 8
} as const;

export const SOURCING = { DIRECT: 0, OPEN: 1 } as const;

export const OFFER_STATUS = { SUBMITTED: 0, SELECTED: 1, ACCEPTED: 2, WITHDRAWN: 3, NOT_SELECTED: 4, EXPIRED: 5 } as const;

export const OPEN_REQUEST_LIMITS = { title: 200, requirements: 5000, budget: 1_000_000 } as const;

/** What an open request may carry, checked here first and again (with a virus scan) by the server. */
export const OPEN_REQUEST_FILE_LIMITS = {
  maxFiles: 5,
  maxBytes: 25 * 1024 * 1024,
  extensions: ['.pdf', '.jpg', '.jpeg', '.png', '.txt', '.docx', '.pptx']
} as const;

export type FileRefusal = 'wrong-type' | 'too-large' | 'too-many';
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
  /** The listed price the student saw when sending a direct request (DEC-13); null otherwise. */
  readonly listedPriceAtRequest?: number | null;
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
  readonly description?: string;
  readonly descriptionArabic?: string;
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
  /** The upload-first draft whose clean files move onto the request. */
  readonly draftId?: string | null;
}

/** The student's saved upload-first draft (`OpenRequestDraftDto`): what they typed and the files already checked. */
export interface SavedOpenDraft {
  readonly id: string;
  readonly fields: OpenRequestDraft;
  readonly attachments: readonly Attachment[];
  readonly maxAttachments: number;
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

export type DraftProblem = 'required' | 'too_long' | 'out_of_range' | 'in_past' | 'budget_pair' | 'budget_order' | 'price_range';

/**
 * What Tafseel allows for the request's kind of service (the catalog's policy, as the teacher's own services
 * endpoint reports it). The server checks the same rules; knowing them here lets the form say
 * "Enter a price between 50 and 400" instead of a bare "out of range" after sending.
 */
export interface OfferTerms {
  readonly minPrice: number;
  readonly maxPrice: number;
  readonly minDeliveryHours: number;
  readonly maxDeliveryHours: number;
  readonly maxRevisions: number;
}

export const Demand = {
  // Words and tones come from the shared UX-04 vocabulary, so a list and this screen agree.
  statusKey(status: number, viewer: Viewer = 'student'): string {
    const view = requestStatus(status, viewer);
    return view.labelKey === 'status_unknown' ? 'demand_status_unknown' : view.labelKey;
  },
  offerStatusKey(status: number, viewer: Viewer = 'student'): string {
    const view = offerStatus(status, viewer);
    return view.labelKey === 'status_unknown' ? 'demand_status_unknown' : view.labelKey;
  },
  offerStatusTone(status: number, viewer: Viewer = 'student'): Tone { return offerStatus(status, viewer).tone; },

  statusTone(status: number, viewer: Viewer = 'student', offerCount: number | null = null): Tone {
    return requestStatus(status, viewer, offerCount).tone;
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

  openInput(draft: OpenRequestDraft, draftId: string | null = null): OpenRequestInput {
    return {
      subjectId: draft.subjectId, serviceCatalogItemId: draft.serviceTypeId,
      title: draft.title.trim(), requirements: draft.requirements.trim(),
      deadline: new Date(draft.deadline).toISOString(), budgetMin: draft.budgetMin, budgetMax: draft.budgetMax,
      ...(draftId ? { draftId } : {})
    };
  },

  /** Why a chosen file cannot be attached before it is even sent, or null. */
  fileRefusal(file: Pick<File, 'name' | 'size'>, attachedCount: number): FileRefusal | null {
    if (attachedCount >= OPEN_REQUEST_FILE_LIMITS.maxFiles) return 'too-many';
    const dot = file.name.lastIndexOf('.');
    const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
    if (!(OPEN_REQUEST_FILE_LIMITS.extensions as readonly string[]).includes(extension)) return 'wrong-type';
    if (file.size <= 0 || file.size > OPEN_REQUEST_FILE_LIMITS.maxBytes) return 'too-large';
    return null;
  },

  /** An ISO instant as the `datetime-local` value it is in this browser's zone; '' when absent. */
  localInputValue(iso: string | null | undefined): string {
    const time = iso ? Date.parse(iso) : NaN;
    if (Number.isNaN(time)) return '';
    const local = new Date(time - new Date(time).getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  },

  /** True when nothing worth keeping has been typed. */
  isBlank(draft: OpenRequestDraft): boolean {
    return !draft.subjectId && !draft.serviceTypeId && !draft.title.trim() && !draft.requirements.trim()
      && !draft.deadline && draft.budgetMin === null && draft.budgetMax === null;
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
  offerProblems(draft: OfferDraft, terms: OfferTerms | null = null): Partial<Record<keyof OfferDraft, DraftProblem>> {
    const problems: Partial<Record<keyof OfferDraft, DraftProblem>> = {};
    const range = (value: number | null, min: number, max: number, integer: boolean): DraftProblem | null =>
      value === null || !Number.isFinite(value) ? 'required'
        : value < min || value > max || (integer && !Number.isInteger(value)) ? 'out_of_range' : null;
    const amount = range(draft.amount, OFFER_LIMITS.amountMin, OFFER_LIMITS.amountMax, false)
      ?? (!/^\d+(\.\d{1,2})?$/.test(String(draft.amount)) ? 'out_of_range' : null);
    if (amount) problems.amount = amount;
    else if (terms && (draft.amount! < terms.minPrice || draft.amount! > terms.maxPrice)) problems.amount = 'price_range';
    const hours = range(draft.deliveryHours, terms?.minDeliveryHours ?? 1, terms?.maxDeliveryHours ?? OFFER_LIMITS.hoursMax, true);
    if (hours) problems.deliveryHours = hours;
    const revisions = range(draft.includedRevisions, 0, terms?.maxRevisions ?? OFFER_LIMITS.revisionsMax, true);
    if (revisions) problems.includedRevisions = revisions;
    const validity = range(draft.validityHours, 1, OFFER_LIMITS.validityMax, true);
    if (validity) problems.validityHours = validity;
    if (!draft.message.trim()) problems.message = 'required';
    else if (draft.message.trim().length > OFFER_LIMITS.message) problems.message = 'too_long';
    return problems;
  },

  /** A new offer's starting values, moved inside what the service allows. */
  fitOffer(draft: OfferDraft, terms: OfferTerms): OfferDraft {
    const clamp = (v: number | null, min: number, max: number) => v === null ? v : Math.min(max, Math.max(min, v));
    return { ...draft, deliveryHours: clamp(draft.deliveryHours, terms.minDeliveryHours, terms.maxDeliveryHours),
      includedRevisions: clamp(draft.includedRevisions, 0, terms.maxRevisions) };
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

/**
 * The files a student may add while a request is still being discussed (UX-24). The server's upload rules
 * are the same as when the request was written; the list is kept here because features do not import each
 * other's models.
 */
export const REPLY_FILE_LIMITS = {
  maxFiles: 5,
  maxBytes: 25 * 1024 * 1024,
  acceptedTypes: [
    'image/jpeg', 'image/png', 'application/pdf', 'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ] as readonly string[]
} as const;

export function replyFileProblem(file: { size: number; type: string }, existingCount: number): 'too-large' | 'wrong-type' | 'too-many' | null {
  if (existingCount >= REPLY_FILE_LIMITS.maxFiles) return 'too-many';
  if (file.size > REPLY_FILE_LIMITS.maxBytes) return 'too-large';
  return REPLY_FILE_LIMITS.acceptedTypes.includes(file.type) ? null : 'wrong-type';
}

/** One of the teacher's own offers and what became of its request (DEC-UX-05, UX-82). */
export interface MyOffer {
  readonly id: string;
  readonly requestId: string;
  readonly requestTitle: string;
  readonly subjectName: string;
  readonly subjectNameArabic: string | null;
  readonly serviceName: string;
  readonly serviceNameArabic: string | null;
  readonly amount: number;
  readonly currency: string;
  readonly deliveryHours: number;
  readonly status: number;
  readonly requestStatus: number;
  readonly anotherTeacherChosen: boolean;
  readonly orderId: string | null;
  readonly updatedAt: string;
}

export interface MyOfferOutcome {
  readonly key: string;
  readonly fallback: string;
  readonly tone: Tone;
  /** Where the teacher goes next from this offer, if anywhere. */
  readonly link: { readonly path: string; readonly key: string; readonly fallback: string } | null;
}

/**
 * What happened to an offer, in the words a teacher would use. "Not chosen" alone reads like a verdict on
 * the teacher; the plain fact is that the student picked someone else, and that is what the list says.
 */
export function myOfferOutcome(offer: MyOffer): MyOfferOutcome {
  const open = { path: `/teacher/opportunities/${offer.requestId}`, key: 'my_offers_open', fallback: 'Open request' };
  if (offer.orderId) {
    return { key: 'my_offers_became_order', fallback: 'You were chosen. It is now an order.', tone: 'success',
      link: { path: `/orders/${offer.orderId}`, key: 'my_offers_open_order', fallback: 'Open the order' } };
  }
  if (offer.anotherTeacherChosen) {
    return { key: 'my_offers_other_teacher', fallback: 'Another teacher was selected for this request.', tone: 'neutral', link: null };
  }
  if (offer.status === OFFER_STATUS.SELECTED) {
    return { key: 'my_offers_selected', fallback: 'The student chose you and is paying.', tone: 'warning', link: open };
  }
  if (offer.status === OFFER_STATUS.WITHDRAWN) {
    return offer.requestStatus === REQUEST_STATUS.OPEN_FOR_OFFERS
      ? { key: 'my_offers_withdrawn_open', fallback: 'You withdrew this offer. The request is still open.', tone: 'neutral',
          link: { ...open, key: 'my_offers_send_again', fallback: 'Send an offer again' } }
      : { key: 'my_offers_withdrawn', fallback: 'You withdrew this offer.', tone: 'neutral', link: null };
  }
  if (offer.requestStatus === REQUEST_STATUS.CANCELLED) {
    return { key: 'my_offers_request_closed', fallback: 'The student closed this request.', tone: 'neutral', link: null };
  }
  if (offer.status === OFFER_STATUS.EXPIRED || offer.requestStatus === REQUEST_STATUS.EXPIRED) {
    return { key: 'my_offers_expired', fallback: 'This offer ran out of time.', tone: 'neutral', link: null };
  }
  if (offer.requestStatus === REQUEST_STATUS.AWAITING_PAYMENT) {
    return { key: 'my_offers_other_paying', fallback: 'The student chose another offer and is paying. If that payment does not go through, your offer is still in.', tone: 'neutral', link: null };
  }
  return { key: 'my_offers_waiting', fallback: 'Waiting for the student to choose.', tone: 'info',
    link: { ...open, key: 'my_offers_change', fallback: 'See or change my offer' } };
}
