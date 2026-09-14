import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleService } from '@core/i18n/locale.service';
import { DialogService } from '@shared/services/dialog.service';
import {
  APPLICATION_STATUS, ApplicationReview, DecisionDraft, EVALUATION_CRITERIA, REVIEW_DECISION, Review, ReviewApplication
} from './models/application-review';
import { ReviewDecisionFormComponent } from './components/review-decision-form.component';
import { HttpQualityReviewGateway, application } from './services/http-quality-review.gateway';
import { QUALITY_REVIEW_GATEWAY } from './services/quality-review.ports';
import { DecideApplication, DecisionIncomplete, StartApplicationReview } from './services/quality-review.use-cases';

const ID = '3f1c6a52-4b8e-4d7a-9c3e-2a1b0c9d8e7f';
const app = (change: Partial<ReviewApplication> = {}): ReviewApplication => ({
  ...application({ id: ID, teacherId: 't1', status: APPLICATION_STATUS.UNDER_REVIEW, assignedReviewerId: 'rev-1', version: 'AAAAAAAAB9E=' }),
  ...change
});
const review = (change: Partial<ReviewApplication> = {}): ApplicationReview => ({ application: app(change), history: [], reviews: [] });
const complete = (change: Partial<DecisionDraft> = {}): DecisionDraft =>
  ({ ...Review.emptyDraft(), decision: REVIEW_DECISION.APPROVE, scores: EVALUATION_CRITERIA.map(() => 4), ...change });

describe('application review rules (J11-05)', () => {
  it('lets a reviewer start only a submitted application', () => {
    for (const status of Object.values(APPLICATION_STATUS))
      expect(Review.canStartReview(app({ status }))).toBe(status === APPLICATION_STATUS.SUBMITTED);
  });

  it('lets only the assigned reviewer decide, and only while under review', () => {
    expect(Review.canDecide(app(), 'rev-1')).toBe(true);
    expect(Review.canDecide(app(), 'rev-2')).toBe(false);
    expect(Review.canDecide(app(), '')).toBe(false);
    expect(Review.canDecide(app({ status: APPLICATION_STATUS.SUBMITTED }), 'rev-1')).toBe(false);
    expect(Review.assignedElsewhere(app(), 'rev-2')).toBe(true);
    expect(Review.assignedElsewhere(app(), 'rev-1')).toBe(false);
  });

  it('has exactly the nine criteria and three decisions of the domain', () => {
    expect(EVALUATION_CRITERIA).toHaveLength(9);
    expect(Object.values(REVIEW_DECISION)).toEqual([0, 1, 2]);
  });

  it.each([
    [{ decision: null }, 'decision_required'],
    [{ scores: EVALUATION_CRITERIA.map((_, i) => (i === 4 ? null : 3)) }, 'scores_incomplete'],
    [{ scores: EVALUATION_CRITERIA.map(() => 6) }, 'scores_incomplete'],
    [{ scores: [3, 3, 3] }, 'scores_incomplete'],
    [{ decision: REVIEW_DECISION.REJECT, comment: '  ' }, 'comment_required'],
    [{ decision: REVIEW_DECISION.REQUEST_CHANGES, comment: '' }, 'comment_required'],
    [{ comment: 'x'.repeat(2001) }, 'comment_too_long'],
    [{ internalNotes: 'x'.repeat(4001) }, 'notes_too_long']
  ])('refuses %o as %s', (change, problem) => {
    expect(Review.problems(complete(change as Partial<DecisionDraft>))).toContain(problem);
  });

  it('accepts an approval without a comment and builds the API body', () => {
    expect(Review.problems(complete())).toEqual([]);
    expect(Review.request(complete({ internalNotes: ' strong ' }))).toEqual({
      decision: 0, scores: EVALUATION_CRITERIA.map((_, criterion) => ({ criterion, score: 4 })), comment: null, internalNotes: 'strong'
    });
  });

  it('refuses to build a request for an incomplete decision', () => {
    expect(() => Review.request(Review.emptyDraft())).toThrow();
  });
});

describe('HttpQualityReviewGateway', () => {
  let gateway: HttpQualityReviewGateway;
  let backend: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [HttpQualityReviewGateway, provideHttpClient(), provideHttpClientTesting()] });
    gateway = TestBed.inject(HttpQualityReviewGateway);
    backend = TestBed.inject(HttpTestingController);
  });

  it('reads the queue with the API enum names and maps the page', async () => {
    const page = firstValueFrom(gateway.queue({ scope: 'All', kind: 'Additional', status: 1, sort: 'NewestFirst', page: 2, pageSize: 20 }));
    const request = backend.expectOne(r => r.url === '/api/v1/teacher-applications/queue');
    expect(request.request.params.toString()).toBe('scope=All&kind=Additional&sort=NewestFirst&page=2&pageSize=20&status=1');
    request.flush({ items: [{ id: ID, teacherDisplayName: 'Huda', subjectNameAr: 'فيزياء', status: 1, isAdditionalSubject: true }], page: 2, pageSize: 20, totalCount: 21 });
    const result = await page;
    expect(result.totalCount).toBe(21);
    expect(result.items[0]).toMatchObject({ id: ID, teacherName: 'Huda', subjectNameArabic: 'فيزياء', status: 1, isAdditionalSubject: true });
  });

  it('reads the detail with history and reviews', async () => {
    const detail = firstValueFrom(gateway.review(ID));
    backend.expectOne(`/api/v1/teacher-applications/${ID}`).flush({
      application: { id: ID, status: 2, version: 'v1' },
      history: [{ previousStatus: null, nextStatus: 0, createdAt: '2030-01-01T00:00:00Z', actorDisplayName: 'Huda', note: null }],
      reviews: [{ createdAt: '2030-01-02T00:00:00Z', decision: 1, publicFeedback: 'More', reviewerDisplayName: 'R', internalNotes: 'n' }]
    });
    const result = await detail;
    expect(result.history[0]).toEqual({ previousStatus: null, nextStatus: 0, createdAt: '2030-01-01T00:00:00Z', actorName: 'Huda', note: '' });
    expect(result.reviews[0]).toMatchObject({ decision: 1, publicFeedback: 'More', reviewerName: 'R', internalNotes: 'n' });
  });

  it('starts a review with the priority and If-Match', async () => {
    const sent = firstValueFrom(gateway.startReview(ID, 2, 'v1'));
    const request = backend.expectOne(`/api/v1/teacher-applications/${ID}/start-review`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ priority: 2 });
    expect(request.request.headers.get('If-Match')).toBe('v1');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await sent;
  });

  it('posts exactly the DecideTeacherApplication keys with If-Match', async () => {
    const body = Review.request(complete({ decision: REVIEW_DECISION.REJECT, comment: 'Wrong formula' }));
    const sent = firstValueFrom(gateway.decide(ID, body, 'v2'));
    const request = backend.expectOne(`/api/v1/teacher-applications/${ID}/decision`);
    expect(Object.keys(request.request.body).sort()).toEqual(['comment', 'decision', 'internalNotes', 'scores']);
    expect(request.request.body.scores).toHaveLength(9);
    expect(request.request.headers.get('If-Match')).toBe('v2');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await sent;
  });

  it('streams the demo from the authorized content endpoint, never a storage path', () => {
    expect(gateway.demoPath(ID)).toBe(`/api/v1/teacher-applications/${ID}/demo/content`);
  });
});

describe('review use cases', () => {
  it('sends a start and a decision under the version that was read, and nothing for an incomplete decision', async () => {
    const decide = vi.fn(() => of(undefined));
    const startReview = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      providers: [DecideApplication, StartApplicationReview, { provide: QUALITY_REVIEW_GATEWAY, useValue: { decide, startReview } }]
    });
    await TestBed.inject(StartApplicationReview).execute(review(), 1);
    expect(startReview).toHaveBeenCalledWith(ID, 1, 'AAAAAAAAB9E=');

    await expect(TestBed.inject(DecideApplication).execute(review(), Review.emptyDraft())).rejects.toBeInstanceOf(DecisionIncomplete);
    expect(decide).not.toHaveBeenCalled();
    await TestBed.inject(DecideApplication).execute(review(), complete());
    expect(decide).toHaveBeenCalledWith(ID, Review.request(complete()), 'AAAAAAAAB9E=');
  });
});

describe('ReviewDecisionFormComponent', () => {
  let decide: ReturnType<typeof vi.fn>;
  let confirm: ReturnType<typeof vi.fn>;

  function render() {
    TestBed.configureTestingModule({
      imports: [ReviewDecisionFormComponent],
      providers: [
        DecideApplication,
        { provide: QUALITY_REVIEW_GATEWAY, useValue: { decide } },
        { provide: DialogService, useValue: { confirm } },
        { provide: LocaleService, useValue: { t: (_: string, fallback: string) => fallback, format: (_: string, __: unknown, f: string) => f } }
      ]
    });
    const fixture = TestBed.createComponent(ReviewDecisionFormComponent);
    fixture.componentRef.setInput('review', review());
    const decided: number[] = [];
    fixture.componentInstance.decided.subscribe(d => decided.push(d));
    fixture.detectChanges();
    return { fixture, form: fixture.componentInstance, decided };
  }

  const fill = (form: ReviewDecisionFormComponent, decision: 0 | 1 | 2, comment = '') => {
    EVALUATION_CRITERIA.forEach((_, i) => form.score(i, 5));
    form.choose(decision);
    form.comment(comment);
  };

  beforeEach(() => {
    decide = vi.fn(() => of(undefined));
    confirm = vi.fn(async () => true);
  });

  it('shows what is missing and sends nothing', async () => {
    const { fixture, form } = render();
    await form.submit();
    fixture.detectChanges();
    expect(decide).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#decision-scores-error')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#decision-choice-error')).not.toBeNull();
  });

  it('requires a comment to request changes', async () => {
    const { fixture, form } = render();
    fill(form, REVIEW_DECISION.REQUEST_CHANGES);
    await form.submit();
    fixture.detectChanges();
    expect(decide).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#decision-comment').getAttribute('aria-invalid')).toBe('true');
  });

  it('records the decision once however often it is submitted, after confirmation', async () => {
    const { form, decided } = render();
    fill(form, REVIEW_DECISION.REJECT, 'The derivation is wrong.');
    await Promise.all([form.submit(), form.submit()]);
    expect(confirm).toHaveBeenCalled();
    expect(decide).toHaveBeenCalledTimes(1);
    expect(decided).toEqual([REVIEW_DECISION.REJECT]);
  });

  it('sends nothing when the reviewer cancels the confirmation', async () => {
    confirm = vi.fn(async () => false);
    const { form, decided } = render();
    fill(form, REVIEW_DECISION.APPROVE);
    await form.submit();
    expect(decide).not.toHaveBeenCalled();
    expect(decided).toEqual([]);
  });

  it('shows the server’s reason when the decision is refused', async () => {
    decide = vi.fn(() => throwError(() => new HttpErrorResponse({
      status: 400, error: { code: 'reviewer_not_assigned', detail: 'Only the assigned reviewer can decide this application.' }
    })));
    const { fixture, form, decided } = render();
    fill(form, REVIEW_DECISION.APPROVE);
    await form.submit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid=decision-error]').textContent).toContain('Only the assigned reviewer');
    expect(decided).toEqual([]);
    expect(form.busy()).toBe(false);
  });
});
