/**
 * What a teacher agrees to when accepting a direct request (J3-07), and the bounds the API
 * enforces (`AcceptLearningRequest`, `ServiceCatalogPolicyValidator.EnsureAcceptedTerms`):
 * the price inside the catalog's range, the service's own currency, a delivery time the
 * catalog allows from the moment of acceptance, and no more revisions than the catalog caps.
 */

/** The teacher's offering and its catalog policy, from GET /teachers/me/marketplace-services. */
export interface AcceptPolicy {
  readonly teacherServiceId: string;
  readonly currency: string;
  readonly minPrice: number;
  readonly maxPrice: number;
  readonly minDeliveryHours: number;
  readonly maxDeliveryHours: number;
  readonly maxRevisions: number;
  readonly defaultPrice: number;
  readonly defaultDeliveryHours: number;
  readonly defaultRevisions: number;
}

/** The form's values. `deliveryLocal` is a datetime-local input value in the teacher's zone. */
export interface AcceptForm {
  readonly price: string;
  readonly deliveryLocal: string;
  readonly revisions: string;
}

/** AcceptLearningRequest, as sent. */
export interface AcceptBody {
  readonly finalPrice: number;
  readonly currency: string;
  readonly agreedDeliveryAt: string;
  readonly revisionAllowance: number;
}

export type AcceptError = 'price' | 'delivery' | 'revisions';

/**
 * The API measures delivery from when it processes the acceptance, a little after the form is
 * checked; this margin keeps a value at the edge of the range from being refused on arrival.
 */
export const ACCEPT_DELIVERY_MARGIN_MINUTES = 10;

const HOUR = 3_600_000;

interface MarketplaceServiceDto {
  currencyCode?: string;
  minimumPrice?: number;
  maximumPrice?: number;
  minimumDeliveryHours?: number | null;
  maximumDeliveryHours?: number | null;
  maximumRevisions?: number;
  offerings?: { id?: string; price?: number; currency?: string; deliveryHours?: number; revisions?: number }[];
}

/** Finds the offering a request was made against, with its catalog's limits. */
export function acceptPolicyFor(
  services: readonly MarketplaceServiceDto[], teacherServiceId: string
): AcceptPolicy | null {
  for (const service of services ?? []) {
    const offering = (service.offerings ?? []).find(o => o.id === teacherServiceId);
    if (!offering) continue;
    const minDelivery = Math.max(1, service.minimumDeliveryHours ?? 1);
    const maxDelivery = Math.min(8760, service.maximumDeliveryHours ?? 8760);
    return {
      teacherServiceId,
      currency: offering.currency || service.currencyCode || 'SAR',
      minPrice: Math.max(0.01, service.minimumPrice ?? 0.01),
      maxPrice: Math.min(1_000_000, service.maximumPrice ?? 1_000_000),
      minDeliveryHours: minDelivery,
      maxDeliveryHours: maxDelivery,
      maxRevisions: Math.min(20, Math.max(0, service.maximumRevisions ?? 20)),
      defaultPrice: offering.price ?? service.minimumPrice ?? 0,
      defaultDeliveryHours: clamp(offering.deliveryHours ?? minDelivery, minDelivery, maxDelivery),
      defaultRevisions: clamp(offering.revisions ?? 0, 0, Math.min(20, service.maximumRevisions ?? 20))
    };
  }
  return null;
}

/** Starting values: the offering's own terms, or the student's date when the catalog allows it. */
export function acceptDefaults(policy: AcceptPolicy, preferredDeliveryAt: string | null, now: Date): AcceptForm {
  const preferred = preferredDeliveryAt ? new Date(preferredDeliveryAt) : null;
  const [earliest, latest] = deliveryWindow(policy, now);
  const delivery = preferred && preferred >= earliest && preferred <= latest
    ? preferred
    : new Date(now.getTime() + policy.defaultDeliveryHours * HOUR + ACCEPT_DELIVERY_MARGIN_MINUTES * 60_000);
  return {
    price: String(policy.defaultPrice),
    deliveryLocal: toLocalInput(clampDate(delivery, earliest, latest)),
    revisions: String(policy.defaultRevisions)
  };
}

/** The earliest and latest delivery the API will accept if the teacher accepts now. */
export function deliveryWindow(policy: AcceptPolicy, now: Date): [Date, Date] {
  const margin = ACCEPT_DELIVERY_MARGIN_MINUTES * 60_000;
  return [
    new Date(now.getTime() + policy.minDeliveryHours * HOUR + margin),
    new Date(now.getTime() + policy.maxDeliveryHours * HOUR - margin)
  ];
}

export function validateAccept(form: AcceptForm, policy: AcceptPolicy, now: Date): AcceptError[] {
  const errors: AcceptError[] = [];
  const price = Number(form.price);
  if (!form.price.trim() || !Number.isFinite(price) || price < policy.minPrice || price > policy.maxPrice
      || Math.round(price * 100) !== price * 100) {
    errors.push('price');
  }
  const delivery = fromLocalInput(form.deliveryLocal);
  const [earliest, latest] = deliveryWindow(policy, now);
  if (!delivery || delivery < earliest || delivery > latest) errors.push('delivery');
  const revisions = Number(form.revisions);
  if (!/^\d+$/.test(form.revisions) || revisions > policy.maxRevisions) errors.push('revisions');
  return errors;
}

/** The request body. Call only after validateAccept returned no errors. */
export function toAcceptBody(form: AcceptForm, policy: AcceptPolicy): AcceptBody {
  return {
    finalPrice: Number(form.price),
    currency: policy.currency,
    agreedDeliveryAt: fromLocalInput(form.deliveryLocal)!.toISOString(),
    revisionAllowance: Number(form.revisions)
  };
}

export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const date = new Date(y!, mo! - 1, d!, h!, mi!);
  return date.getMonth() === mo! - 1 && date.getDate() === d! ? date : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampDate(value: Date, min: Date, max: Date): Date {
  return value < min ? min : value > max ? max : value;
}
