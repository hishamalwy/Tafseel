/**
 * Publication readiness, as the server reports it (`GET /teachers/onboarding-status`).
 *
 * Nothing here decides whether a teacher may publish: `readyForPublication` does, and
 * the publish call is refused by the API whatever this page shows. This file only turns
 * the server's codes into sentences and says which screen fixes each one.
 */

export interface OnboardingState {
  readonly status: number;
  readonly emailConfirmed: boolean;
  readonly approvedSubjectIds: readonly string[];
  readonly profileComplete: boolean;
  readonly hasActiveService: boolean;
  readonly hasAvailability: boolean;
  readonly hasPublicSample: boolean;
  readonly isPublished: boolean;
  readonly readyForPublication: boolean;
  readonly blockingReasons: readonly string[];
  readonly missingRequirements: readonly string[];
  /** The teacher's latest application, whose demo the teacher may preview before choosing to show it. */
  readonly applicationId?: string | undefined;
}

/** A video recorded for an approved application. Private review material until the teacher consents to show it. */
export interface ApplicationVideo {
  readonly sampleId: string;
  readonly subjectName: string;
  readonly subjectNameAr: string | null;
  readonly title: string;
  /** The assignment's Arabic title; empty when the catalogue has none (the English title is then not shown in Arabic). */
  readonly titleAr: string;
  readonly durationSeconds: number | null;
  readonly inUse: boolean;
}

/**
 * The one public introduction video (PRODUCT-P1). The profile shows no video, or exactly this one while it is shown.
 * `source` is null when the teacher has none.
 */
export interface IntroVideo {
  readonly source: 'upload' | 'application' | null;
  readonly isPublic: boolean;
  readonly fileName: string | null;
  readonly consentedAt: string | null;
  readonly version: string | null;
  readonly applicationVideos: readonly ApplicationVideo[];
  /** The exact sentence the teacher agrees to before an application video is shown. */
  readonly consentStatement: string;
}

export const NO_INTRO_VIDEO: IntroVideo = {
  source: null, isPublic: false, fileName: null, consentedAt: null, version: null, applicationVideos: [], consentStatement: ''
};

export interface Blocker {
  readonly code: string;
  readonly labelKey: string;
  readonly fallback: string;
  /** The screen that fixes it, or null when there is none for the teacher. */
  readonly link: string | null;
}

/** Not being published yet is what the publish button fixes, not something to fix on another screen. */
export const NOT_PUBLISHED = 'profile_not_published';

const KNOWN: Readonly<Record<string, { readonly fallback: string; readonly link: string | null }>> = {
  email_unconfirmed: { fallback: 'Confirm your email address.', link: '/auth/confirm-email' },
  account_suspended: { fallback: 'Your account is suspended. Contact Tafseel support.', link: null },
  qualification_required: { fallback: 'Get an approved qualification in at least one subject.', link: '/teach/apply' },
  teacher_not_approved: { fallback: 'Get an approved qualification in at least one subject.', link: '/teach/apply' },
  profile_incomplete: { fallback: 'Complete your headline, bio, country and city.', link: '/teacher/profile' },
  active_service_required: { fallback: 'Offer at least one active service in a subject you are approved for.', link: '/teacher/services' },
  eligible_active_service_required: { fallback: 'Offer at least one active service in a subject you are approved for.', link: '/teacher/services' },
  availability_required: { fallback: 'Your live service needs weekly availability.', link: '/teacher/availability' }
};

export const Readiness = {
  /** Every reason the server gave, in its order; an unknown code is shown, never dropped. */
  blockers(state: OnboardingState): readonly Blocker[] {
    return state.blockingReasons.filter(code => code !== NOT_PUBLISHED).map(code => Readiness.blocker(code));
  },

  blocker(code: string): Blocker {
    const known = KNOWN[code];
    return {
      code,
      labelKey: `readiness_${code}`,
      fallback: known?.fallback ?? code,
      link: known?.link ?? null
    };
  },

  canPublish(state: OnboardingState): boolean {
    return state.readyForPublication && !state.isPublished;
  },

  /**
   * Whether the teacher has switched publication on. `isPublished` is stricter (switched on
   * and still eligible); a published profile that lost its only active service is switched on
   * but hidden, and the teacher can still switch it off.
   */
  switchedOn(state: OnboardingState): boolean {
    return !state.blockingReasons.includes(NOT_PUBLISHED);
  },

  /**
   * The steps, each marked done from the server's own flags. Availability and a public
   * sample are listed as done or not, but only a blocker the server returned stops publishing.
   */
  steps(state: OnboardingState): readonly { key: string; done: boolean; link: string; query?: Record<string, string> }[] {
    return [
      { key: 'email', done: state.emailConfirmed, link: '/auth/confirm-email' },
      { key: 'qualification', done: state.approvedSubjectIds.length > 0, link: '/teach/apply' },
      { key: 'profile', done: state.profileComplete, link: '/teacher/profile' },
      { key: 'service', done: !state.blockingReasons.includes('active_service_required'), link: '/teacher/services' },
      { key: 'availability', done: state.hasAvailability, link: '/teacher/availability' },
      { key: 'sample', done: state.hasPublicSample, link: '/teacher/publication' }
    ];
  }
} as const;
