import { APPLICATION_STATUS } from '@features/teach/models/application';

/**
 * A teacher's qualification application as the Quality Reviewer works it.
 *
 * The numbers are the API's enums (`TeacherApplicationStatus`, `ApplicationPriority`,
 * `ReviewDecision`, `EvaluationCriterion`), which serialize as integers. Nothing here
 * invents a state: a decision is one of the three the domain has, and what a reviewer
 * may do is read from the application's status and assignment.
 */

export { APPLICATION_STATUS };

export const REVIEW_DECISION = { APPROVE: 0, REQUEST_CHANGES: 1, REJECT: 2 } as const;
export type ReviewDecision = typeof REVIEW_DECISION[keyof typeof REVIEW_DECISION];

export const REVIEW_PRIORITY = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
export type ReviewPriority = typeof REVIEW_PRIORITY[keyof typeof REVIEW_PRIORITY];

/** `EvaluationCriterion`, in enum order: the index is the value the API expects. */
export const EVALUATION_CRITERIA = [
  'subject_knowledge', 'information_accuracy', 'explanation_clarity', 'communication_skills',
  'teaching_structure', 'voice_quality', 'video_quality', 'student_engagement', 'professionalism'
] as const;

export const SCORE_RANGE = { min: 1, max: 5 } as const;
export const COMMENT_MAX = 2000;
export const NOTES_MAX = 4000;

export type QueueScope = 'Actionable' | 'All';
export type QueueKind = 'All' | 'Initial' | 'Additional';
export type QueueSort = 'OldestFirst' | 'NewestFirst';

export interface QueueFilter {
  readonly scope: QueueScope;
  readonly kind: QueueKind;
  /** An application status, or null for every status the scope allows. */
  readonly status: number | null;
  readonly sort: QueueSort;
  readonly page: number;
  readonly pageSize: number;
}

export interface QualifiedSubject {
  readonly subjectId: string;
  readonly subjectName: string;
  readonly subjectNameArabic: string;
}

export interface ReviewApplication {
  readonly id: string;
  readonly teacherId: string;
  readonly teacherName: string;
  readonly subjectId: string;
  readonly subjectName: string;
  readonly subjectNameArabic: string;
  readonly status: number;
  readonly priority: number;
  readonly assignedReviewerId: string;
  readonly submittedAt: string;
  readonly version: string;
  readonly assignmentTitle: string;
  readonly assignmentTitleArabic: string;
  readonly assignmentInstructions: string;
  readonly demoUploaded: boolean;
  readonly demoDurationSeconds: number | null;
  readonly submissionVersion: number;
  readonly publicFeedback: string;
  readonly city: string;
  readonly experienceYears: number;
  readonly degree: string;
  readonly isAdditionalSubject: boolean;
  readonly activeQualifications: readonly QualifiedSubject[];
  readonly hasPreviousFeedback: boolean;
}

export interface ReviewQueuePage {
  readonly items: readonly ReviewApplication[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
}

export interface ReviewQueueSummary {
  readonly actionable: number;
  readonly submitted: number;
  readonly underReview: number;
  readonly changesRequested: number;
  readonly additionalActionable: number;
}

export interface ReviewHistoryItem {
  readonly previousStatus: number | null;
  readonly nextStatus: number;
  readonly createdAt: string;
  readonly actorName: string;
  readonly note: string;
}

export interface ReviewRecord {
  readonly createdAt: string;
  readonly decision: number;
  readonly publicFeedback: string;
  readonly reviewerName: string;
  readonly internalNotes: string;
}

export interface ApplicationReview {
  readonly application: ReviewApplication;
  readonly history: readonly ReviewHistoryItem[];
  readonly reviews: readonly ReviewRecord[];
}

/** The decision form as the reviewer fills it in. A score of null is not given yet. */
export interface DecisionDraft {
  readonly decision: ReviewDecision | null;
  readonly scores: readonly (number | null)[];
  readonly comment: string;
  readonly internalNotes: string;
}

/** The request body of `POST /teacher-applications/{id}/decision`. */
export interface DecisionRequest {
  readonly decision: ReviewDecision;
  readonly scores: readonly { readonly criterion: number; readonly score: number }[];
  readonly comment: string | null;
  readonly internalNotes: string | null;
}

export type DecisionProblem =
  | 'decision_required' | 'scores_incomplete' | 'comment_required' | 'comment_too_long' | 'notes_too_long';

const STATUS_KEYS = [
  'apply_status_draft', 'apply_status_submitted', 'apply_status_under_review', 'apply_status_changes',
  'apply_status_approved', 'apply_status_rejected', 'apply_status_withdrawn'
] as const;

export const Review = {
  emptyDraft(): DecisionDraft {
    return { decision: null, scores: EVALUATION_CRITERIA.map(() => null), comment: '', internalNotes: '' };
  },

  /** `TeacherApplication.StartReview` accepts a submitted application only. */
  canStartReview(application: ReviewApplication): boolean {
    return application.status === APPLICATION_STATUS.SUBMITTED;
  },

  /** `TeacherApplication.Decide`: under review, and only by the reviewer it is assigned to. */
  canDecide(application: ReviewApplication, reviewerId: string): boolean {
    return application.status === APPLICATION_STATUS.UNDER_REVIEW
      && !!reviewerId && application.assignedReviewerId === reviewerId;
  },

  assignedElsewhere(application: ReviewApplication, reviewerId: string): boolean {
    return application.status === APPLICATION_STATUS.UNDER_REVIEW
      && !!application.assignedReviewerId && application.assignedReviewerId !== reviewerId;
  },

  isDecided(status: number): boolean {
    return status === APPLICATION_STATUS.APPROVED || status === APPLICATION_STATUS.REJECTED
      || status === APPLICATION_STATUS.CHANGES_REQUESTED || status === APPLICATION_STATUS.WITHDRAWN;
  },

  /** The same rules `DecideTeacherApplication` validates, checked before sending. */
  problems(draft: DecisionDraft): readonly DecisionProblem[] {
    const problems: DecisionProblem[] = [];
    if (draft.decision === null) problems.push('decision_required');
    if (draft.scores.length !== EVALUATION_CRITERIA.length
      || draft.scores.some(score => score === null || !Number.isInteger(score) || score < SCORE_RANGE.min || score > SCORE_RANGE.max))
      problems.push('scores_incomplete');
    if (draft.decision !== null && draft.decision !== REVIEW_DECISION.APPROVE && !draft.comment.trim())
      problems.push('comment_required');
    if (draft.comment.length > COMMENT_MAX) problems.push('comment_too_long');
    if (draft.internalNotes.length > NOTES_MAX) problems.push('notes_too_long');
    return problems;
  },

  request(draft: DecisionDraft): DecisionRequest {
    if (Review.problems(draft).length || draft.decision === null) throw new Error('The decision is incomplete.');
    return {
      decision: draft.decision,
      scores: draft.scores.map((score, criterion) => ({ criterion, score: score as number })),
      comment: draft.comment.trim() || null,
      internalNotes: draft.internalNotes.trim() || null
    };
  },

  statusKey(status: number): string {
    return STATUS_KEYS[status] ?? 'apply_status_unknown';
  },

  statusTone(status: number): 'neutral' | 'info' | 'warning' | 'success' | 'danger' {
    switch (status) {
      case APPLICATION_STATUS.SUBMITTED: return 'info';
      case APPLICATION_STATUS.UNDER_REVIEW: case APPLICATION_STATUS.CHANGES_REQUESTED: return 'warning';
      case APPLICATION_STATUS.APPROVED: return 'success';
      case APPLICATION_STATUS.REJECTED: return 'danger';
      default: return 'neutral';
    }
  },

  decisionKey(decision: number): string {
    return ['quality_decision_approve', 'quality_decision_request_changes', 'quality_decision_reject'][decision]
      ?? 'apply_status_unknown';
  },

  priorityKey(priority: number): string {
    return ['quality_priority_low', 'quality_priority_medium', 'quality_priority_high'][priority] ?? 'apply_status_unknown';
  },

  subjectName(application: { subjectName: string; subjectNameArabic: string }, rtl: boolean): string {
    return (rtl ? application.subjectNameArabic : '') || application.subjectName || application.subjectNameArabic;
  },

  assignmentTitle(application: ReviewApplication, rtl: boolean): string {
    return (rtl ? application.assignmentTitleArabic : '') || application.assignmentTitle || application.assignmentTitleArabic;
  }
} as const;
