/**
 * A teacher's qualification application, and the wizard that carries it.
 *
 * One application is one subject: approval is granted per subject, never to a
 * person in general. That is why "start another application" exists at all, and
 * why an already-qualified subject is still offered but disabled with a reason —
 * a missing option reads as a bug, a disabled one reads as an answer.
 */

export const APPLICATION_STATUS = {
  DRAFT: 0, SUBMITTED: 1, UNDER_REVIEW: 2, CHANGES_REQUESTED: 3,
  APPROVED: 4, REJECTED: 5, WITHDRAWN: 6
} as const;

export type WizardStep = 'details' | 'demo' | 'review';
export type StepState = 'current' | 'completed' | 'locked' | 'error';

export interface TeacherApplication {
  readonly id: string;
  readonly version: string;
  readonly status: number;
  readonly subjectId: string;
  readonly subjectName: string;
  readonly subjectNameArabic: string;
  readonly qualificationTopicId: string;
  readonly assignmentTitle: string;
  readonly assignmentTitleArabic: string;
  readonly city: string;
  readonly experienceYears: number;
  readonly degree: string;
  readonly demoUploaded: boolean;
  readonly publicFeedback: string;
  readonly submittedAt: string;
}

export interface CatalogSubject {
  readonly id: string;
  readonly name: string;
  readonly nameArabic: string;
}

export interface SelectableSubject extends CatalogSubject {
  readonly disabled: boolean;
  /** Translation key explaining why, when it is disabled. */
  readonly reason: string;
}

export interface TeachingLanguage {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface OnboardingLifecycle {
  readonly nextAction: string;
  readonly approvedSubjectIds: readonly string[];
}

export interface QualificationCard {
  readonly subjectId: string;
  readonly state: number;
}

/** Draft and changes-requested: the application is still the teacher's to edit. */
const OPEN_STATUSES: readonly number[] = [
  APPLICATION_STATUS.DRAFT, APPLICATION_STATUS.CHANGES_REQUESTED
];

/** Anything not yet decided: the subject is spoken for. */
const ACTIVE_STATUSES: readonly number[] = [
  APPLICATION_STATUS.DRAFT, APPLICATION_STATUS.SUBMITTED,
  APPLICATION_STATUS.UNDER_REVIEW, APPLICATION_STATUS.CHANGES_REQUESTED
];

/** Everything past the teacher's own desk. */
const REVIEW_STATUSES: readonly number[] = [
  APPLICATION_STATUS.SUBMITTED, APPLICATION_STATUS.UNDER_REVIEW,
  APPLICATION_STATUS.APPROVED, APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.WITHDRAWN
];

const STATUS_KEYS = [
  'apply_status_draft', 'apply_status_submitted', 'apply_status_under_review',
  'apply_status_changes', 'apply_status_approved', 'apply_status_rejected',
  'apply_status_withdrawn'
] as const;

export const Application = {
  isOpen(application: TeacherApplication | null): boolean {
    return !!application && OPEN_STATUSES.includes(application.status);
  },

  statusKey(status: number): string {
    return STATUS_KEYS[status] ?? 'apply_status_unknown';
  },

  /** The tone a status chip carries, which the stylesheet keys its colour off. */
  statusKind(status: number): string {
    switch (status) {
      case APPLICATION_STATUS.DRAFT: return 'draft';
      case APPLICATION_STATUS.SUBMITTED:
      case APPLICATION_STATUS.UNDER_REVIEW: return 'pending';
      case APPLICATION_STATUS.CHANGES_REQUESTED: return 'warning';
      case APPLICATION_STATUS.APPROVED: return 'success';
      case APPLICATION_STATUS.REJECTED:
      case APPLICATION_STATUS.WITHDRAWN: return 'error';
      default: return 'draft';
    }
  },

  /** Where the wizard opens for the application the teacher is looking at. */
  defaultStep(application: TeacherApplication | null): WizardStep {
    if (!application) return 'details';
    if (REVIEW_STATUSES.includes(application.status)) return 'review';
    if (OPEN_STATUSES.includes(application.status)) return 'demo';
    return 'details';
  },

  /**
   * Which steps the teacher may reach. An application under review is read-only,
   * so its details and demo steps close behind it; an unsubmitted one has no
   * review to look at.
   */
  canVisit(step: WizardStep, application: TeacherApplication | null): boolean {
    switch (step) {
      case 'details': return !application || OPEN_STATUSES.includes(application.status);
      case 'demo': return !!application && OPEN_STATUSES.includes(application.status);
      case 'review': return !!application && REVIEW_STATUSES.includes(application.status);
    }
  },

  /**
   * The state of each pip in the stepper. `error` rather than `current` when the
   * reviewer asked for changes: that step is both where the teacher is and the
   * thing needing attention, and the stepper is the only place that says so.
   */
  stepperStates(
    step: WizardStep, application: TeacherApplication | null
  ): Readonly<Record<WizardStep, StepState>> {
    const changesRequested = application?.status === APPLICATION_STATUS.CHANGES_REQUESTED;
    const reachable = (target: WizardStep) => Application.canVisit(target, application);

    if (step === 'details') {
      return {
        details: 'current',
        demo: reachable('demo') ? (changesRequested ? 'error' : 'completed') : 'locked',
        review: reachable('review') ? 'completed' : 'locked'
      };
    }
    if (step === 'demo') {
      return {
        details: reachable('details') ? 'completed' : 'locked',
        demo: changesRequested ? 'error' : 'current',
        review: reachable('review') ? 'completed' : 'locked'
      };
    }
    return {
      details: reachable('details') ? 'completed' : 'locked',
      demo: reachable('demo') ? 'completed' : 'locked',
      review: 'current'
    };
  },

  /**
   * Which application the page should open on: the one still being worked, else
   * the most recent, else none.
   */
  preferred(
    applications: readonly TeacherApplication[], preferredId?: string
  ): TeacherApplication | null {
    return (preferredId ? applications.find(a => a.id === preferredId) : undefined)
      ?? applications.find(a => OPEN_STATUSES.includes(a.status))
      ?? applications[0]
      ?? null;
  },

  /**
   * Every subject, each carrying whether it can be applied for and why not.
   * A subject is closed when it is already approved, or when an application for
   * it is still in flight.
   */
  selectableSubjects(
    subjects: readonly CatalogSubject[],
    applications: readonly TeacherApplication[],
    lifecycle: OnboardingLifecycle | null,
    qualifications: readonly QualificationCard[]
  ): readonly SelectableSubject[] {
    const approved = new Set<string>(lifecycle?.approvedSubjectIds ?? []);
    for (const card of qualifications) if (card.state === 0) approved.add(card.subjectId);

    const inFlight = new Set<string>(
      applications.filter(a => ACTIVE_STATUSES.includes(a.status)).map(a => a.subjectId));

    return subjects.map(subject => {
      const reason = approved.has(subject.id) ? 'apply_subject_already_qualified'
        : inFlight.has(subject.id) ? 'apply_subject_application_active'
        : '';
      return { ...subject, disabled: !!reason, reason };
    });
  },

  firstOpenSubjectId(subjects: readonly SelectableSubject[]): string {
    return subjects.find(s => !s.disabled)?.id ?? '';
  }
} as const;

/** The catalogue name in the reader's language, falling back to the other. */
export function subjectName(subject: CatalogSubject, isArabic: boolean): string {
  return isArabic ? (subject.nameArabic || subject.name) : (subject.name || subject.nameArabic);
}
