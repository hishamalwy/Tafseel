import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ProtectedFile, ProtectedObjectUrl } from '@core/http/protected-file.service';
import {
  ApplicationReview, DecisionDraft, DecisionProblem, QueueFilter, Review, ReviewPriority, ReviewQueuePage,
  ReviewQueueSummary
} from '../models/application-review';
import { QUALITY_REVIEW_GATEWAY } from './quality-review.ports';

export interface ReviewQueue {
  readonly page: ReviewQueuePage | null;
  readonly summary: ReviewQueueSummary | null;
  /** True when the list could not be read; the summary failing alone is not a failed queue. */
  readonly failed: boolean;
}

/** The queue and its counts, settled separately so a failed summary still shows the list. */
@Injectable()
export class LoadReviewQueue {
  private readonly gateway = inject(QUALITY_REVIEW_GATEWAY);

  async execute(filter: QueueFilter): Promise<ReviewQueue> {
    const [page, summary] = await Promise.allSettled([
      firstValueFrom(this.gateway.queue(filter)),
      firstValueFrom(this.gateway.summary())
    ]);
    return {
      page: page.status === 'fulfilled' ? page.value : null,
      summary: summary.status === 'fulfilled' ? summary.value : null,
      failed: page.status === 'rejected'
    };
  }
}

@Injectable()
export class LoadApplicationReview {
  private readonly gateway = inject(QUALITY_REVIEW_GATEWAY);

  execute(applicationId: string): Promise<ApplicationReview> {
    return firstValueFrom(this.gateway.review(applicationId));
  }
}

/** Taking a submitted application: it becomes under review and assigned to this reviewer. */
@Injectable()
export class StartApplicationReview {
  private readonly gateway = inject(QUALITY_REVIEW_GATEWAY);

  execute(review: ApplicationReview, priority: ReviewPriority): Promise<void> {
    return firstValueFrom(this.gateway.startReview(review.application.id, priority, review.application.version));
  }
}

export class DecisionIncomplete extends Error {
  constructor(readonly problems: readonly DecisionProblem[]) { super('The decision is incomplete.'); }
}

/**
 * Recording the decision under the version the reviewer read, so a decision about an
 * application that changed meanwhile is refused (409) instead of silently applied.
 */
@Injectable()
export class DecideApplication {
  private readonly gateway = inject(QUALITY_REVIEW_GATEWAY);

  execute(review: ApplicationReview, draft: DecisionDraft): Promise<void> {
    const problems = Review.problems(draft);
    if (problems.length) return Promise.reject(new DecisionIncomplete(problems));
    return firstValueFrom(
      this.gateway.decide(review.application.id, Review.request(draft), review.application.version));
  }
}

/**
 * The teaching demo, fetched with the reviewer's credentials from the authorized content
 * endpoint and handed to the player as a short-lived object URL: never a storage path, never
 * a public URL. The caller revokes it when the page closes.
 */
@Injectable()
export class OpenApplicationDemo {
  private readonly gateway = inject(QUALITY_REVIEW_GATEWAY);
  private readonly files = inject(ProtectedFile);

  execute(applicationId: string): Promise<ProtectedObjectUrl | null> {
    return this.files.objectUrl(this.gateway.demoPath(applicationId));
  }
}
