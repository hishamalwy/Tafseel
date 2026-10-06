import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { injectUnsavedChanges } from '@shared/utils/unsaved-changes';
import { returnQuery } from '@shared/utils/list-context';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { ProtectedObjectUrl } from '@core/http/protected-file.service';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { ToastComponent } from '@shared/components/toast.component';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import { ReviewDecisionFormComponent } from '../components/review-decision-form.component';
import {
  ApplicationReview, REVIEW_PRIORITY, REVOCATION_REASON, Review, ReviewDecision, ReviewPriority
} from '../models/application-review';
import {
  LoadApplicationReview, OpenApplicationDemo, RevokeQualification, StartApplicationReview
} from '../services/quality-review.use-cases';

@Component({
  selector: 'tf-application-review-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, WorkspaceShellComponent, ToastComponent, ReviewDecisionFormComponent],
  templateUrl: './application-review-page.component.html',
  styles: `
    .tf-review-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 340px); gap: 18px; align-items: start; }
    .tf-review-column { display: grid; gap: 18px; min-width: 0; }
    .tf-review-facts { display: grid; gap: 10px; margin: 0; }
    .tf-review-facts div { display: flex; justify-content: space-between; gap: 12px; font-size: var(--type-label-size); }
    .tf-review-facts dt { color: var(--muted); }
    .tf-review-facts dd { margin: 0; font-weight: 650; text-align: end; overflow-wrap: anywhere; }
    .tf-review-timeline { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
    .tf-review-timeline li { display: grid; gap: 3px; padding-inline-start: 12px; border-inline-start: 2px solid var(--border); font-size: var(--type-label-size); }
    .tf-review-timeline small { color: var(--muted); font-size: var(--type-meta-size); }
    .tf-review-video { width: 100%; max-height: 70vh; border-radius: var(--r-md); background: #000; }
    .tf-review-instructions { margin: 0; white-space: pre-line; color: var(--text-2); font-size: var(--type-body-sm-size); line-height: 1.7; }
    .tf-review-back { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; margin-bottom: 4px; font-size: var(--type-label-size); font-weight: 650; }
    .tf-review-back svg { width: 16px; height: 16px; flex: none; }
    @media (max-width: 960px) { .tf-review-layout { grid-template-columns: minmax(0, 1fr); } }
  `
})
export class ApplicationReviewPageComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly load = inject(LoadApplicationReview);
  private readonly start = inject(StartApplicationReview);
  private readonly openDemo = inject(OpenApplicationDemo);
  private readonly revoke = inject(RevokeQualification);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly title = inject(Title);
  private readonly session = inject(SESSION_STORE);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  readonly Review = Review;
  readonly priorities = [REVIEW_PRIORITY.LOW, REVIEW_PRIORITY.MEDIUM, REVIEW_PRIORITY.HIGH] as const;

  applicationId = '';
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly review = signal<ApplicationReview | null>(null);
  readonly priority = signal<ReviewPriority>(REVIEW_PRIORITY.MEDIUM);
  readonly starting = signal(false);
  readonly actionError = signal('');
  readonly demo = signal<ProtectedObjectUrl | null>(null);
  readonly demoLoading = signal(false);
  readonly demoError = signal('');
  readonly revoking = signal(false);
  readonly revokeOpen = signal(false);
  readonly revokeReason = signal('');
  readonly revokeError = signal('');
  readonly reasonLimits = REVOCATION_REASON;
  private readonly decisionForm = viewChild(ReviewDecisionFormComponent);
  readonly unsavedChanges = injectUnsavedChanges(() => this.decisionForm()?.hasUnsavedChanges() === true ||
    (this.revokeOpen() && !!this.revokeReason().trim()));

  private readonly reviewerId = computed(() => this.session.current()?.userId ?? '');
  readonly canStart = computed(() => { const r = this.review(); return !!r && Review.canStartReview(r.application); });
  readonly canDecide = computed(() => { const r = this.review(); return !!r && Review.canDecide(r.application, this.reviewerId()); });
  readonly assignedElsewhere = computed(() => { const r = this.review(); return !!r && Review.assignedElsewhere(r.application, this.reviewerId()); });

  constructor() {
    this.title.setTitle(`${this.t('quality_review_title', 'Application review')} — Tafseel`);
    // Moving from one review to another keeps this component; everything shown belongs to the new id.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const id = params.get('applicationId') ?? '';
      if (id === this.applicationId) return;
      this.applicationId = id;
      this.demo()?.revoke();
      this.demo.set(null);
      this.demoError.set('');
      this.actionError.set('');
      this.review.set(null);
      void this.refresh();
    });
  }

  ngOnDestroy(): void { this.demo()?.revoke(); }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  queueReturnParams() { return returnQuery(this.route.snapshot.queryParamMap, ['scope', 'kind', 'status', 'sort', 'page', 'focus']); }
  date(value: string): string { return value ? this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
  status(value: number | null): string { return value === null ? '—' : this.t(Review.statusKey(value), ''); }
  duration(seconds: number | null): string {
    if (seconds === null) return '—';
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  setPriority(value: unknown): void {
    const priority = this.priorities.find(p => p === Number(value));
    if (priority !== undefined) this.priority.set(priority);
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const id = this.applicationId;
      const review = await this.load.execute(id);
      if (id !== this.applicationId) return;
      this.review.set(review);
      this.title.setTitle(`${review.application.teacherName || this.t('quality_review_title', 'Application review')} — Tafseel`);
    } catch (error) {
      this.loadError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
    }
  }

  async startReview(): Promise<void> {
    const review = this.review();
    if (!review || this.starting()) return;
    this.starting.set(true);
    this.actionError.set('');
    try {
      await this.start.execute(review, this.priority());
      await this.refresh();
      this.toasts.show(this.t('quality_review_started', 'Review started. The application is assigned to you.'));
    } catch (error) {
      this.actionError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.starting.set(false);
    }
  }

  async watchDemo(): Promise<void> {
    if (this.demoLoading() || this.demo()) return;
    this.demoLoading.set(true);
    this.demoError.set('');
    try {
      this.demo.set(await this.openDemo.execute(this.applicationId));
    } catch (error) {
      this.demoError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.demoLoading.set(false);
    }
  }

  async withdrawQualification(): Promise<void> {
    const q = this.review()?.qualification;
    if (!q?.isActive || this.revoking()) return;
    const reason = this.revokeReason().trim();
    if (reason.length < REVOCATION_REASON.min || reason.length > REVOCATION_REASON.max) {
      this.revokeError.set(this.t('quality_revoke_reason_invalid', 'Write the reason for the teacher in 10 to 2000 characters.'));
      return;
    }
    const confirmed = await this.dialogs.confirm({
      title: this.t('quality_revoke_confirm_title', 'Withdraw this qualification?'),
      body: this.locale.format('quality_revoke_confirm_body', { n: q.activeServices },
        'The teacher can no longer sell this subject: {n} active service(s) are paused and leave the marketplace. The teacher is told your reason. Orders already paid for are not changed.'),
      confirmLabel: this.t('quality_revoke', 'Withdraw qualification'), cancelLabel: this.t('common_cancel', 'Cancel'), destructive: true
    });
    if (!confirmed) return;
    this.revoking.set(true);
    this.revokeError.set('');
    try {
      await this.revoke.execute(q.id, reason);
      this.revokeOpen.set(false);
      this.revokeReason.set('');
      await this.refresh();
      this.toasts.show(this.t('quality_revoked', 'Qualification withdrawn. The teacher has been told why.'));
    } catch (error) {
      this.revokeError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.revoking.set(false);
    }
  }

  async onDecided(decision: ReviewDecision): Promise<void> {
    await this.refresh();
    this.toasts.show(this.locale.format('quality_decision_recorded', { decision: this.t(Review.decisionKey(decision), '') }, 'Decision recorded: {decision}.'));
  }
}
