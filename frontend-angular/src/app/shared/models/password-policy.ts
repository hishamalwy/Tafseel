/**
 * The password rule, in one place.
 *
 * It exists on the server (`MinLength(10)` plus the identity options) and the UI
 * has to show it live as the user types. Duplicating it in a component is how the
 * two drift; this is the single definition both the form hints and the submit
 * gate read from.
 */
export type PasswordRuleId = 'length' | 'upper' | 'lower' | 'digit' | 'special';

export interface PasswordRule {
  readonly id: PasswordRuleId;
  readonly satisfied: boolean;
}

const CHECKS: ReadonlyArray<readonly [PasswordRuleId, (pw: string) => boolean]> = [
  ['length', pw => pw.length >= 10 && pw.length <= 128],
  ['upper', pw => /[A-Z]/.test(pw)],
  ['lower', pw => /[a-z]/.test(pw)],
  ['digit', pw => /[0-9]/.test(pw)],
  ['special', pw => /[^A-Za-z0-9]/.test(pw)]
];

export const PasswordPolicy = {
  /** Every rule with its current state — what the live hint list renders. */
  evaluate(password: string): readonly PasswordRule[] {
    return CHECKS.map(([id, test]) => ({ id, satisfied: test(password) }));
  },

  isSatisfiedBy(password: string): boolean {
    return CHECKS.every(([, test]) => test(password));
  }
} as const;
