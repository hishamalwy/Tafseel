import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
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
import { ToastService } from '@shared/services/toast.service';
import { ReviewDecisionFormComponent } from '../components/review-decision-form.component';
import {
  ApplicationReview, REVIEW_PRIORITY, Review, ReviewDecision, ReviewPriority
} from '../models/application-review';
import {
  LoadApplicationReview, OpenApplicationDemo, StartApplicationReview
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
    .tf-review-facts div { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
    .tf-review-facts dt { color: var(--muted); }
    .tf-review-facts dd { margin: 0; font-weight: 650; text-align: end; overflow-wrap: anywhere; }
    .tf-review-timeline { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
    .tf-review-timeline li { display: grid; gap: 3px; padding-inline-start: 12px; border-inline-start: 2px solid var(--border); font-size: 13px; }
    .tf-review-timeline small { color: var(--muted); }
    .tf-review-video { width: 100%; max-height: 70vh; border-radius: var(--r-md); background: #000; }
    .tf-review-instructions { margin: 0; white-space: pre-line; color: var(--text-2); font-size: 14px; line-height: 1.7; }
    .tf-review-back { display: inline-block; margin-bottom: 12px; font-size: 13px; font-weight: 650; }
    @media (max-width: 960px) { .tf-review-layout { grid-template-columns: minmax(0, 1fr); } }
  `
})
export class ApplicationReviewPageComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly load = inject(LoadApplicationReview);
  private readonly start = inject(StartApplicationReview);
  private readonly openDemo = inject(OpenApplicationDemo);
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

  async onDecided(decision: ReviewDecision): Promise<void> {
    await this.refresh();
    this.toasts.show(this.locale.format('quality_decision_recorded', { decision: this.t(Review.decisionKey(decision), '') }, 'Decision recorded: {decision}.'));
  }
}
