import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Dispute, DisputeResolution, EligiblePurchase } from '@features/disputes/models/dispute';

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly totalCount: number;
}

export interface OpenDisputeCommand {
  readonly reason: string;
  readonly target: { readonly type: 'order' | 'session'; readonly id: string };
}

/**
 * Reading and writing cases.
 *
 * Split from the admin port below on purpose: a Student's screen has no reason
 * to depend on a type that can resolve a case, and a fake for one does not have
 * to stub the other.
 */
export interface DisputeGateway {
  list(page: number, pageSize: number): Observable<Page<Dispute>>;
  byId(id: string): Observable<Dispute>;
  eligiblePurchases(): Observable<readonly EligiblePurchase[]>;
  open(command: OpenDisputeCommand): Observable<Dispute>;
  /** `version` is sent as If-Match; a stale one must fail rather than overwrite. */
  postMessage(id: string, body: string, version: string): Observable<void>;
  /** The reviewer's question to both parties; only while the case is under review. */
  postReviewerMessage(id: string, body: string, version: string): Observable<void>;
  uploadEvidence(id: string, file: File, version: string): Observable<void>;
  downloadEvidence(evidenceId: string, fileName: string): Observable<void>;
}

/** Everything only an operations reviewer can do. */
export interface DisputeAdminGateway {
  list(page: number, pageSize: number): Observable<Page<Dispute>>;
  byId(id: string): Observable<Dispute>;
  startReview(id: string, version: string): Observable<void>;
  /**
   * `idempotencyKey` is generated once per attempt and reused across retries, so
   * a resubmitted resolution cannot move money twice.
   */
  resolve(
    id: string, resolution: DisputeResolution, rationale: string,
    version: string, idempotencyKey: string
  ): Observable<void>;
}

export const DISPUTE_GATEWAY = new InjectionToken<DisputeGateway>('DisputeGateway');
export const DISPUTE_ADMIN_GATEWAY = new InjectionToken<DisputeAdminGateway>('DisputeAdminGateway');
