/**
 * What stops students finding this teacher, in one card (UX-02, `docs/tickets/v1/UX-02.md`).
 *
 * The server decides readiness and publication (`GET /teachers/onboarding-status`): it returns the blocking
 * reasons, in its own order, and whether the teacher is ready to go visible. Nothing here re-decides any of
 * that — this file turns the server's first reason into a sentence, a verb and the screen that fixes it, and
 * counts what is left. The codes themselves are never shown.
 *
 * One blocker, one CTA: a teacher who is told five things at once does none of them, and the server
 * re-evaluates after each fix anyway.
 */
import { Label } from '@shared/vocabulary/status-vocabulary';
import { NOT_PUBLISHED, OnboardingState } from '@features/teacher-setup/models/readiness';

/** `TeacherOnboardingStatus`, as the API serializes it. */
export const ONBOARDING = {
  EmailUnconfirmed: 0, ApplicationRequired: 1, ApplicationDraft: 2, DemoRequired: 3, ReadyToSubmit: 4,
  PendingReview: 5, UnderReview: 6, ChangesRequested: 7, Rejected: 8, ApprovedButProfileIncomplete: 9,
  ApprovedButNotPublished: 10, Published: 11, Suspended: 12
} as const;

export interface SetupCard {
  readonly title: Label;
  /** The sentence under the title, when the approved copy has one. */
  readonly body: Label | null;
  /** The verb and where it goes; null when there is nothing the teacher can do (suspension). */
  readonly cta: { readonly label: Label; readonly link: string } | null;
  /** Blocking reasons still to clear, this one included; `profile_not_published` counts only when alone. */
  readonly stepsLeft: number;
  /** The teacher has cleared everything and only has to go visible. */
  readonly ready: boolean;
}

const L = (labelKey: string, fallback: string): Label => ({ labelKey, fallback });

const CARD = {
  email: { title: L('th_setup_email', 'Confirm your email'), body: L('th_setup_email_body', 'We sent you a confirmation link.'), cta: L('th_setup_email_cta', 'Confirm email'), link: '/auth/confirm-email' },
  suspended: { title: L('th_setup_suspended', 'Your account is suspended'), body: L('th_setup_suspended_body', 'Contact Tafseel support to find out why.'), cta: null, link: null },
  apply: { title: L('th_setup_apply', 'Apply to teach your subject'), body: L('th_setup_apply_body', 'Our quality team reviews your application and demo.'), cta: L('th_setup_apply_cta', 'Start application'), link: '/teach/apply' },
  applyContinue: { title: L('th_setup_apply_continue', 'Finish your application'), body: null, cta: L('th_setup_apply_continue_cta', 'Continue'), link: '/teach/apply' },
  applyReview: { title: L('th_setup_apply_review', 'Your application is being reviewed'), body: L('th_setup_apply_review_body', 'We’ll let you know when there’s a decision.'), cta: L('th_setup_apply_review_cta', 'View application'), link: '/teach/apply' },
  applyChanges: { title: L('th_setup_apply_changes', 'Your application needs changes'), body: L('th_setup_apply_changes_body', 'Read the reviewer’s notes and update it.'), cta: L('th_setup_apply_changes_cta', 'Update application'), link: '/teach/apply' },
  applyRejected: { title: L('th_setup_apply_rejected', 'Your application wasn’t approved'), body: L('th_setup_apply_rejected_body', 'You can apply again.'), cta: L('th_setup_apply_rejected_cta', 'Apply again'), link: '/teach/apply' },
  profile: { title: L('th_setup_profile', 'Complete your profile'), body: L('th_setup_profile_body', 'Add your headline, bio, country and city.'), cta: L('th_setup_profile_cta', 'Complete profile'), link: '/teacher/profile' },
  service: { title: L('th_setup_service', 'Turn on at least one service'), body: L('th_setup_service_body', 'Choose one of Tafseel’s services in a subject you’re approved for and set your price.'), cta: L('th_setup_service_cta', 'Go to my services'), link: '/teacher/services' },
  availability: { title: L('th_setup_availability', 'Set your weekly availability'), body: L('th_setup_availability_body', 'Students book live sessions in these times.'), cta: L('th_setup_availability_cta', 'Set availability'), link: '/teacher/availability' },
  ready: { title: L('th_setup_ready', 'Your profile is ready for students'), body: L('th_setup_ready_body', 'Review your profile, then make it visible.'), cta: L('th_setup_ready_cta', 'Review and go visible'), link: '/teacher/publication' },
  unknown: { title: L('th_setup_unknown', 'Finish setting up your profile'), body: null, cta: L('th_setup_unknown_cta', 'My teaching setup'), link: '/teacher/publication' }
} as const;

/** The application stage decides which sentence a missing qualification gets. */
function qualification(status: number): typeof CARD[keyof typeof CARD] {
  switch (status) {
    case ONBOARDING.ApplicationRequired: return CARD.apply;
    case ONBOARDING.ApplicationDraft:
    case ONBOARDING.DemoRequired:
    case ONBOARDING.ReadyToSubmit: return CARD.applyContinue;
    case ONBOARDING.PendingReview:
    case ONBOARDING.UnderReview: return CARD.applyReview;
    case ONBOARDING.ChangesRequested: return CARD.applyChanges;
    case ONBOARDING.Rejected: return CARD.applyRejected;
    default: return CARD.apply;
  }
}

function cardFor(code: string, status: number): typeof CARD[keyof typeof CARD] {
  switch (code) {
    case 'email_unconfirmed': return CARD.email;
    case 'account_suspended': return CARD.suspended;
    case 'qualification_required':
    case 'teacher_not_approved': return qualification(status);
    case 'profile_incomplete': return CARD.profile;
    case 'active_service_required':
    case 'eligible_active_service_required': return CARD.service;
    case 'availability_required': return CARD.availability;
    default: return CARD.unknown;
  }
}

/**
 * The one thing to fix, or null when the teacher is visible to students.
 *
 * The first blocking reason wins, in the server's order; being unpublished is not something to fix on
 * another screen, so it only becomes the card when nothing else is left.
 */
export function setupCard(state: OnboardingState): SetupCard | null {
  const reasons = state.blockingReasons ?? [];
  const blocking = reasons.filter(code => code !== NOT_PUBLISHED);
  if (blocking.length === 0) {
    if (!reasons.includes(NOT_PUBLISHED)) return null;
    const card = CARD.ready;
    return { title: card.title, body: card.body, cta: { label: card.cta, link: card.link }, stepsLeft: 1, ready: true };
  }
  const card = cardFor(String(blocking[0]), state.status);
  return {
    title: card.title,
    body: card.body,
    cta: card.cta && card.link ? { label: card.cta, link: card.link } : null,
    stepsLeft: blocking.length,
    ready: false
  };
}

/**
 * Whether the teacher is still waiting on a qualification decision. Nothing else is worth reading — and
 * nothing else is worth asking the server for — while that is true.
 */
export function awaitingQualification(state: OnboardingState): boolean {
  return (state.blockingReasons ?? []).some(code => code === 'qualification_required' || code === 'teacher_not_approved');
}
