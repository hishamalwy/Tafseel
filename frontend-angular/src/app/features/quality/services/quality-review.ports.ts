import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ApplicationReview, DecisionRequest, QueueFilter, ReviewPriority, ReviewQueuePage, ReviewQueueSummary
} from '../models/application-review';

export interface QualityReviewGateway {
  queue(filter: QueueFilter): Observable<ReviewQueuePage>;
  summary(): Observable<ReviewQueueSummary>;
  review(applicationId: string): Observable<ApplicationReview>;
  startReview(applicationId: string, priority: ReviewPriority, version: string): Observable<void>;
  decide(applicationId: string, decision: DecisionRequest, version: string): Observable<void>;
  revokeQualification(qualificationId: string, reason: string): Observable<void>;
  /** The authorized content endpoint for the teaching demo, relative to the site. */
  demoPath(applicationId: string): string;
}

export const QUALITY_REVIEW_GATEWAY = new InjectionToken<QualityReviewGateway>('QualityReviewGateway');
