/**
 * A teacher and the services they offer.
 *
 * Shared by browse and the profile page. The rules that live here are the ones
 * both screens got slightly differently in the legacy pages: which service is
 * the one to offer first, whether a service can be booked live, and how a
 * teacher's headline numbers are read.
 */

export interface TeacherService {
  readonly id: string;
  readonly subjectId: string | null;
  readonly serviceCatalogItemId: string | null;
  readonly serviceCatalogCode: string;
  readonly serviceNameEnglish: string;
  readonly serviceNameArabic: string;
  readonly descriptionEnglish: string;
  readonly descriptionArabic: string;
  readonly price: number | null;
  readonly currency: string;
  readonly deliveryDays: number | null;
  /** The wire unit; a delivery under a day reads in hours, not as "1 days". */
  readonly deliveryHours: number | null;
  readonly revisionAllowance: number | null;
  readonly canRequest: boolean;
  readonly canBook: boolean;
  readonly requiresScheduling: boolean;
  readonly allowedDurations: readonly number[];
}

export interface TrustBadge {
  readonly code: string;
}

export interface TeacherSample {
  readonly id: string;
  readonly title: string;
  readonly mediaUrl: string | null;
  readonly description: string;
  readonly durationSeconds: number | null;
  readonly trustCode: string;
  readonly contentType: string;
  readonly subjectId: string | null;
}

/** A qualification or a job, as the profile's detail column lists them. */
export interface Credential {
  readonly title: string;
  readonly meta: string;
  readonly years: string;
}

export interface TeacherReview {
  readonly id: string;
  readonly rating: number;
  readonly body: string;
  readonly createdAt: string;
  readonly studentDisplayName: string | null;
  readonly studentDisplayNameEnglish: string | null;
}

export interface Teacher {
  readonly id: string;
  readonly fullName: string;
  readonly fullNameEnglish: string;
  readonly hasAvatar: boolean;
  readonly headline: string;
  readonly headlineEnglish: string;
  readonly bio: string;
  readonly bioEnglish: string;
  readonly rating: number | null;
  readonly reviewCount: number;
  readonly completedOrders: number;
  readonly languages: readonly string[];
  /** Names, not ids: both the list and the profile send them ready to show. */
  readonly subjects: readonly string[];
  readonly topics: readonly string[];
  readonly educationLevels: readonly string[];
  readonly certifications: readonly Credential[];
  readonly experience: readonly Credential[];
  readonly country: string;
  readonly city: string;
  readonly responseTimeMinutes: number | null;
  /**
   * The list endpoint sends a starting price instead of the services that
   * produce it, so the card has a price to show without a second request.
   */
  readonly startingPrice: number | null;
  readonly currency: string;
  /** Available on the comparison endpoint, which does not return completed-order counts. */
  readonly sampleCount?: number;
  readonly services: readonly TeacherService[];
  readonly trustBadges: readonly TrustBadge[];
  readonly samples: readonly TeacherSample[];
  readonly isVerified: boolean;
}

/** What the discovery flow carried over from browse, when it did. */
export interface DiscoveryContext {
  readonly subjectId: string | null;
  readonly serviceId: string | null;
  readonly teacherServiceId: string | null;
}

export const EMPTY_DISCOVERY: DiscoveryContext = {
  subjectId: null, serviceId: null, teacherServiceId: null
};

export const Teacher = {
  /** The label and delivery wording follow the service type the server returned, not whether it can be booked right now. */
  isScheduled(service: TeacherService): boolean {
    return service.requiresScheduling || String(service.serviceCatalogCode ?? '').toLowerCase() === 'live_session';
  },

  /**
   * What a service card says about delivery. A scheduled (live) service has no delivery window:
   * its wire value is a placeholder hour, which used to read as "1 days". Under a day reads in hours.
   */
  deliveryWording(service: Pick<TeacherService, 'requiresScheduling' | 'serviceCatalogCode' | 'deliveryHours' | 'deliveryDays' | 'allowedDurations'>):
    { kind: 'duration'; minutes: readonly number[] } | { kind: 'hours'; value: number } | { kind: 'days'; value: number } | { kind: 'flexible' } {
    if (Teacher.isScheduled(service as TeacherService)) return { kind: 'duration', minutes: service.allowedDurations };
    if (service.deliveryHours !== null && service.deliveryHours < 24) return { kind: 'hours', value: service.deliveryHours };
    if (service.deliveryDays) return { kind: 'days', value: service.deliveryDays };
    return { kind: 'flexible' };
  },

  /** A live session that can be booked now, as opposed to an asynchronous deliverable. */
  isLiveService(service: TeacherService): boolean {
    return service.canBook
      && String(service.serviceCatalogCode ?? '').toLowerCase() === 'live_session';
  },

  hasBadge(teacher: Teacher | null, code: string): boolean {
    return !!teacher?.trustBadges.some(b => b.code === code);
  },

  /**
   * Which service the profile should open on.
   *
   * Preference order, carried over from the legacy page: the exact service the
   * visitor came from, then one matching the subject and service they searched,
   * then anything requestable, then anything bookable live. Getting this wrong
   * means a student lands on a profile with the wrong price highlighted.
   */
  preferredService(
    services: readonly TeacherService[], discovery: DiscoveryContext = EMPTY_DISCOVERY
  ): TeacherService | null {
    return services.find(s => s.id === discovery.teacherServiceId)
      ?? services.find(s =>
           s.serviceCatalogItemId === discovery.serviceId
           && (!discovery.subjectId || s.subjectId === discovery.subjectId))
      ?? services.find(s => s.canRequest)
      ?? services.find(s => Teacher.isLiveService(s))
      ?? null;
  },

  /** Availability is only meaningful for a service that is actually scheduled. */
  availabilityServiceId(service: TeacherService | null): string | undefined {
    if (!service) return undefined;
    return service.requiresScheduling || Teacher.isLiveService(service) ? service.id : undefined;
  },

  /** The lowest advertised price, which is what a browse card shows. */
  fromPrice(teacher: Teacher): { amount: number; currency: string } | null {
    // Browse sends `startingPrice` and no services at all; the profile sends the
    // services. Reading only the services is what left every browse card without
    // a price.
    const priced = teacher.services.filter(s => Number.isFinite(Number(s.price)));
    if (!priced.length) {
      return Number.isFinite(Number(teacher.startingPrice))
        ? { amount: Number(teacher.startingPrice), currency: teacher.currency || 'SAR' }
        : null;
    }
    const cheapest = priced.reduce((low, s) => (Number(s.price) < Number(low.price) ? s : low));
    return { amount: Number(cheapest.price), currency: cheapest.currency || 'SAR' };
  }
} as const;
