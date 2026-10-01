import { Provider } from '@angular/core';
import { Routes } from '@angular/router';
import { QUALITY_REVIEW_GATEWAY } from './services/quality-review.ports';
import { HttpQualityReviewGateway } from './services/http-quality-review.gateway';
import {
  DecideApplication, LoadApplicationReview, LoadReviewQueue, OpenApplicationDemo, RevokeQualification, StartApplicationReview
} from './services/quality-review.use-cases';

/**
 * The teacher application queue and review (J11-05). Bindings live with the routes so the
 * reviewer's code loads only for reviewers; the parent routes require the role, and the API
 * authorizes every call regardless.
 */
const providers: Provider[] = [
  HttpQualityReviewGateway,
  { provide: QUALITY_REVIEW_GATEWAY, useExisting: HttpQualityReviewGateway }
];

export const QUEUE_ROUTES: Routes = [{
  path: '',
  providers: [...providers, LoadReviewQueue],
  loadComponent: () => import('./pages/application-queue-page.component').then(m => m.ApplicationQueuePageComponent)
}];

export const REVIEW_ROUTES: Routes = [{
  path: '',
  providers: [...providers, LoadApplicationReview, StartApplicationReview, DecideApplication, OpenApplicationDemo, RevokeQualification],
  loadComponent: () => import('./pages/application-review-page.component').then(m => m.ApplicationReviewPageComponent)
}];
