import { FieldProblem } from './teacher-profile';

/**
 * What a teacher can sell and on what terms.
 *
 * A service is one catalogue service type offered in one subject. The catalogue sets the
 * terms a teacher may choose within (currency, price range, delivery window, revisions); the
 * subject must be one the teacher holds an approved qualification in. Which subjects those
 * are is the server's answer (`GET /teachers/me/eligible-subjects`) — this file never
 * decides a teacher is qualified, it only refuses to offer what the server did not list.
 */

export const ORDER_TYPE = { ASYNC_REQUEST: 'async_request', LIVE_SESSION: 'live_session' } as const;

export interface ServiceSubject {
  readonly id: string;
  readonly name: string;
  readonly nameArabic: string;
  readonly isSubjectActive: boolean;
  readonly isQualificationActive: boolean;
}

export interface Offering {
  readonly id: string;
  readonly subjectId: string;
  readonly serviceTypeId: string;
  readonly price: number;
  readonly currency: string;
  readonly deliveryHours: number;
  readonly revisions: number;
  readonly isActive: boolean;
  readonly requiresScheduling: boolean;
  readonly approachEn: string;
  readonly approachAr: string;
  readonly version: string;
  /** `configured`, `disabled`, `qualification_required`, `policy_correction_required`, `superseded`, `catalog_*`. */
  readonly configurationState: string;
  readonly isSuperseded: boolean;
  readonly canRequest: boolean;
  readonly canBook: boolean;
}

export interface ServiceType {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly nameArabic: string;
  readonly description: string;
  readonly descriptionArabic: string;
  readonly orderType: string;
  readonly currency: string;
  readonly minPrice: number;
  readonly defaultPrice: number;
  readonly maxPrice: number;
  readonly minDeliveryHours: number | null;
  readonly defaultDeliveryHours: number | null;
  readonly maxDeliveryHours: number | null;
  readonly defaultRevisions: number;
  readonly maxRevisions: number;
  readonly canEnable: boolean;
  /** `available`, `qualification_required`, `policy_incomplete`, `catalog_*`, `account_suspended`. */
  readonly availabilityState: string;
  readonly subjects: readonly ServiceSubject[];
  readonly offerings: readonly Offering[];
}

export interface OfferTerms {
  readonly price: number | null;
  readonly deliveryHours: number | null;
  readonly revisions: number | null;
  readonly approachEn: string;
  readonly approachAr: string;
}

export type TermsField = keyof OfferTerms;

/** The body of `POST /teachers/me/services` and `PUT /teachers/me/services/{id}`. */
export interface ServiceInput {
  readonly subjectId: string;
  readonly serviceCatalogItemId: string;
  readonly price: number;
  readonly currency: string;
  readonly deliveryHours: number;
  readonly revisions: number;
  readonly approachEn: string;
  readonly approachAr: string;
  readonly isAvailable: boolean | null;
}

export const APPROACH_MAX = 1000;
/** A live session's delivery window is not the teacher's to set; the API still binds one. */
const LIVE_DELIVERY_HOURS = 1;

export const ServiceOffer = {
  isAsync(type: ServiceType): boolean {
    return type.orderType === ORDER_TYPE.ASYNC_REQUEST;
  },

  /** Offerings still in force; a superseded one was replaced by a newer configuration. */
  current(type: ServiceType): readonly Offering[] {
    return type.offerings.filter(offering => !offering.isSuperseded);
  },

  /**
   * Subjects this type can be offered in now: listed by the server as eligible for the
   * teacher, shown by the service list as active, and not already offered in this type.
   */
  sellableSubjects(type: ServiceType, eligibleSubjectIds: ReadonlySet<string>): readonly ServiceSubject[] {
    const offered = new Set(ServiceOffer.current(type).map(offering => offering.subjectId));
    return type.subjects.filter(subject => eligibleSubjectIds.has(subject.id)
      && subject.isSubjectActive && subject.isQualificationActive && !offered.has(subject.id));
  },

  defaultTerms(type: ServiceType): OfferTerms {
    return {
      price: type.defaultPrice || type.minPrice || null,
      deliveryHours: ServiceOffer.isAsync(type) ? type.defaultDeliveryHours : null,
      revisions: ServiceOffer.isAsync(type) ? type.defaultRevisions : 0,
      approachEn: '', approachAr: ''
    };
  },

  termsOf(offering: Offering): OfferTerms {
    return {
      price: offering.price, deliveryHours: offering.deliveryHours, revisions: offering.revisions,
      approachEn: offering.approachEn, approachAr: offering.approachAr
    };
  },

  /** `ServiceCatalogPolicyValidator.EnsureOfferingTerms`, checked before sending. */
  problems(type: ServiceType, terms: OfferTerms): Partial<Record<TermsField, FieldProblem>> {
    const problems: Partial<Record<TermsField, FieldProblem>> = {};
    if (terms.price === null || !Number.isFinite(terms.price)) problems.price = 'required';
    else if (terms.price < type.minPrice || terms.price > type.maxPrice || !/^\d+(\.\d{1,2})?$/.test(String(terms.price)))
      problems.price = 'out_of_range';
    if (ServiceOffer.isAsync(type)) {
      const hours = terms.deliveryHours;
      if (hours === null || !Number.isInteger(hours)) problems.deliveryHours = 'required';
      else if (hours < (type.minDeliveryHours ?? 1) || hours > (type.maxDeliveryHours ?? 8760)) problems.deliveryHours = 'out_of_range';
    }
    const revisions = terms.revisions;
    if (revisions === null || !Number.isInteger(revisions)) problems.revisions = 'required';
    else if (revisions < 0 || revisions > type.maxRevisions) problems.revisions = 'out_of_range';
    if (terms.approachEn.length > APPROACH_MAX) problems.approachEn = 'too_long';
    if (terms.approachAr.length > APPROACH_MAX) problems.approachAr = 'too_long';
    return problems;
  },

  input(type: ServiceType, subjectId: string, terms: OfferTerms, isAvailable: boolean | null): ServiceInput {
    return {
      subjectId,
      serviceCatalogItemId: type.id,
      price: terms.price ?? 0,
      currency: type.currency,
      deliveryHours: ServiceOffer.isAsync(type) ? terms.deliveryHours ?? 0 : terms.deliveryHours ?? LIVE_DELIVERY_HOURS,
      revisions: terms.revisions ?? 0,
      // An empty string clears the text on update; null would keep the old one.
      approachEn: terms.approachEn.trim(),
      approachAr: terms.approachAr.trim(),
      isAvailable
    };
  }
} as const;
