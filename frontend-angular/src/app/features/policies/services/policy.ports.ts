import { InjectionToken } from '@angular/core';
import { Policy, PolicyId } from '@features/policies/models/policy';

/**
 * Where policy documents come from.
 *
 * They are hard-coded copy today. Behind a port so moving them to a CMS, or
 * fetching a historical version for a consent record, is an infrastructure
 * change and nothing above it moves.
 */
export interface PolicyRepository {
  /** In the order they should be listed. */
  all(lang: 'ar' | 'en'): readonly Policy[];
  byId(id: PolicyId, lang: 'ar' | 'en'): Policy | null;
}

export const POLICY_REPOSITORY = new InjectionToken<PolicyRepository>('PolicyRepository');
