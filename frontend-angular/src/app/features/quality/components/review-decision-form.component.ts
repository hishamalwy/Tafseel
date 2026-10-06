import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { problemMessage } from '@core/http/problem-message';
import { LocaleService } from '@core/i18n/locale.service';
import { DialogService } from '@shared/services/dialog.service';
import { injectFocusFirstInvalid } from '@shared/utils/form-focus';
import {
  ApplicationReview, COMMENT_MAX, DecisionDraft, EVALUATION_CRITERIA, NOTES_MAX, REVIEW_DECISION, Review,
  ReviewDecision, SCORE_RANGE
} from '../models/application-review';
import { DecideApplication } from '../services/quality-review.use-cases';

/**
 * The reviewer's decision: a score from 1 to 5 on each of the nine criteria, one of the
 * three decisions the domain has, a comment the teacher will read (required unless the
 * decision is an approval) and notes only reviewers see.
 *
 * The same rules the API validates are checked before anything is sent, the request goes
 * out once however often the button is pressed, and a refusal is shown as the server gave it.
 */
@Component({
  selector: 'tf-review-decision-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './review-decision-form.component.html',
  styles: `
    :host { display: block; }
    .tf-decision-criteria { display: grid; gap: 14px; margin: 0; padding: 0; border: 0; }
    .tf-decision-criterion { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 16px; }
    .tf-decision-criterion > span { font-size: var(--type-body-sm-size); font-weight: 600; }
    .tf-decision-choices { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 0; padding: 0; border: 0; }
    .tf-decision-choices legend, .tf-decision-criteria legend { margin-bottom: 8px; font-size: var(--type-label-size); font-weight: 700; color: var(--text-2); }
    .tf-decision-count { justify-self: end; font-size: var(--type-meta-size); color: var(--muted); }
    @media (max-width: 560px) { .tf-decision-criterion { grid-template-columns: minmax(0, 1fr); } }
  `
})
export class ReviewDecisionFormComponent {
  readonly review = input.required<ApplicationReview>();
  readonly decided = output<ReviewDecision>();
  private readonly decide = inject(DecideApplication);
  private readonly dialogs = inject(DialogService);
  private readonly locale = inject(LocaleService);

  readonly criteria = EVALUATION_CRITERIA;
  readonly points = Array.from({ length: SCORE_RANGE.max - SCORE_RANGE.min + 1 }, (_, i) => SCORE_RANGE.min + i);
  readonly decisions = [REVIEW_DECISION.APPROVE, REVIEW_DECISION.REQUEST_CHANGES, REVIEW_DECISION.REJECT] as const;
  readonly commentMax = COMMENT_MAX;
  readonly notesMax = NOTES_MAX;
  readonly Review = Review;

  readonly draft = signal<DecisionDraft>(Review.emptyDraft());
  readonly hasUnsavedChanges = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(Review.emptyDraft()));
  readonly attempted = signal(false);
  private readonly focusFirstInvalid = injectFocusFirstInvalid();
  readonly busy = signal(false);
  readonly error = signal('');
  readonly problems = computed(() => this.attempted() ? Review.problems(this.draft()) : []);
  readonly commentRequired = computed(() => {
    const decision = this.draft().decision;
    return decision !== null && decision !== REVIEW_DECISION.APPROVE;
  });

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  has(problem: string): boolean { return this.problems().includes(problem as never); }

  score(criterion: number, value: number): void {
    this.draft.update(d => ({ ...d, scores: d.scores.map((s, i) => i === criterion ? value : s) }));
  }

  choose(decision: ReviewDecision): void { this.draft.update(d => ({ ...d, decision })); }
  comment(value: string): void { this.draft.update(d => ({ ...d, comment: value })); }
  notes(value: string): void { this.draft.update(d => ({ ...d, internalNotes: value })); }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.attempted.set(true);
    this.error.set('');
    const draft = this.draft();
    if (Review.problems(draft).length || draft.decision === null) return this.focusFirstInvalid();
    const decision = draft.decision;
    const confirmed = await this.dialogs.confirm({
      title: this.t(Review.decisionKey(decision), ''),
      body: this.t(
        decision === REVIEW_DECISION.APPROVE ? 'quality_confirm_approve' : decision === REVIEW_DECISION.REJECT ? 'quality_confirm_reject' : 'quality_confirm_changes',
        ''),
      confirmLabel: this.t('quality_record_decision', 'Record decision'),
      cancelLabel: this.t('common_cancel', 'Cancel'),
      destructive: decision === REVIEW_DECISION.REJECT
    });
    if (!confirmed || this.busy()) return;
    this.busy.set(true);
    try {
      await this.decide.execute(this.review(), draft);
      this.draft.set(Review.emptyDraft());
      this.decided.emit(decision);
    } catch (error) {
      this.error.set(problemMessage(error, (key, fallback) => this.t(key, fallback)).text);
    } finally {
      this.busy.set(false);
    }
  }
}
