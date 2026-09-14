/**
 * A published policy document.
 *
 * Content, not configuration: these are the terms users agree to, they are
 * versioned, and the version is what `POST /auth/register` records consent
 * against. Modelled in the domain so the version is one fact, not a string
 * repeated in a form and a footer.
 */
export type PolicyId = 'terms' | 'privacy' | 'refunds' | 'integrity' | 'teacher' | 'disputes';

/** Listing order, as the legacy page had it. */
export const POLICY_ORDER: readonly PolicyId[] =
  ['terms', 'privacy', 'refunds', 'integrity', 'teacher', 'disputes'];

export interface PolicySection {
  readonly title: string;
  readonly body: string;
}

export interface Policy {
  readonly id: PolicyId;
  readonly title: string;
  readonly intro: string;
  readonly sections: readonly PolicySection[];
}

/** The revision currently in force, and the one registration records. */
export const POLICY_VERSION = '2026-08-12';
