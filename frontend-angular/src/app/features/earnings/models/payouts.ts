/**
 * Where a teacher's money goes and what happened to each withdrawal (FIN-02, FIN-03, DEC-04).
 *
 * The server decides everything that involves money: what is withdrawable, the minimum, whether the
 * payout details are verified, and every status. This file only shapes what the teacher types into the
 * request the API expects, and checks the obvious mistakes before a round trip.
 *
 * The full IBAN is sent once, over HTTPS, and sealed by the server before it is stored; no screen ever gets
 * it back. Reads show the bank and the last four characters only ("Al Rajhi ••••7519"), so changing the
 * details means typing the IBAN again.
 */

export type PayoutState = 'pending' | 'verified' | 'rejected';
/** requested → (finance starts the bank transfer) initiated → transferred, or rejected with the money returned. */
export type WithdrawalState = 'requested' | 'initiated' | 'transferred' | 'rejected';

export interface PayoutProfile {
  readonly legalName: string;
  readonly countryCode: string;
  readonly payoutMethod: string;
  readonly destinationLabel: string;
  readonly identityLast4: string;
  readonly state: PayoutState;
  readonly rejectionReason: string | null;
  readonly submittedAt: string;
  /** Saved before full bank details were collected: the teacher enters them again before withdrawing. */
  readonly reenrollmentRequired: boolean;
}

export interface Withdrawal {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly state: WithdrawalState;
  readonly status: number;
  readonly destinationLabel: string;
  readonly rejectionReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;
  readonly transferInitiatedAt: string | null;
  readonly transferredAt: string | null;
  /** The bank's own reference, once Finance recorded the transfer. */
  readonly bankReference: string | null;
}

/** What the teacher types. */
export interface PayoutDraft {
  readonly legalName: string;
  readonly countryCode: string;
  readonly bankName: string;
  readonly iban: string;
  readonly identityLast4: string;
}

export type PayoutProblem = 'legalName' | 'bankName' | 'iban' | 'ibanCountry' | 'identityLast4';
export type AmountProblem = 'required' | 'below_minimum' | 'above_available' | 'invalid';

export const PAYOUT_COUNTRIES = ['SA', 'EG', 'AE', 'KW', 'QA', 'BH', 'OM', 'JO'] as const;

/** ISO 13616 lengths for the countries offered; the server applies the same rule. */
const IBAN_LENGTHS: Readonly<Record<string, number>> = { SA: 24, AE: 23, KW: 30, QA: 29, BH: 22, OM: 23, JO: 30, EG: 29 };

export const Payouts = {
  emptyDraft(countryCode = 'SA'): PayoutDraft {
    return { legalName: '', countryCode, bankName: '', iban: '', identityLast4: '' };
  },

  /** Brings a saved profile back into the form. The IBAN itself is never returned, so it starts empty. */
  draftFrom(profile: PayoutProfile): PayoutDraft {
    const match = /^(.*?)\s*[•*xX]+\s*([0-9A-Za-z]{4})$/.exec(profile.destinationLabel.trim());
    return {
      legalName: profile.legalName,
      countryCode: profile.countryCode || 'SA',
      bankName: match?.[1]?.trim() ?? '',
      iban: '',
      identityLast4: profile.identityLast4
    };
  },

  /** Spaces and dashes are how people copy an IBAN from their bank app; they are not part of it. */
  normalizeIban(value: string): string {
    return value.replace(/[\s-]/g, '').toUpperCase();
  },

  /** ISO 7064 MOD 97-10, as the server checks it. */
  validIban(value: string): boolean {
    const iban = Payouts.normalizeIban(value);
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
    const expected = IBAN_LENGTHS[iban.slice(0, 2)];
    if (expected && iban.length !== expected) return false;
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    let remainder = 0;
    for (const char of rearranged) {
      const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
      for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
    }
    return remainder === 1;
  },

  problems(draft: PayoutDraft): readonly PayoutProblem[] {
    const problems: PayoutProblem[] = [];
    if (draft.legalName.trim().length < 2) problems.push('legalName');
    if (draft.bankName.trim().length < 2 || /[0-9]/.test(draft.bankName)) problems.push('bankName');
    const iban = Payouts.normalizeIban(draft.iban);
    if (!Payouts.validIban(iban)) problems.push('iban');
    else if (!iban.startsWith(draft.countryCode)) problems.push('ibanCountry');
    if (!/^[A-Za-z0-9]{4}$/.test(draft.identityLast4.trim())) problems.push('identityLast4');
    return problems;
  },

  /** `SubmitPayoutProfile`: bank transfer is the only method a payout can be made to in V1. */
  input(draft: PayoutDraft) {
    return {
      legalName: draft.legalName.trim(),
      countryCode: draft.countryCode,
      payoutMethod: 'bank_transfer',
      bankName: draft.bankName.trim(),
      iban: Payouts.normalizeIban(draft.iban),
      identityLast4: draft.identityLast4.trim()
    };
  },

  /** Obvious mistakes only; the server still refuses anything it will not pay. */
  amountProblem(raw: string, available: number, minimum: number): AmountProblem | null {
    if (!raw.trim()) return 'required';
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) return 'invalid';
    if (amount > available) return 'above_available';
    if (amount < minimum) return 'below_minimum';
    return null;
  },

  payoutState(status: unknown): PayoutState {
    return status === 1 ? 'verified' : status === 2 ? 'rejected' : 'pending';
  },

  withdrawalState(status: unknown): WithdrawalState {
    return status === 1 ? 'transferred' : status === 2 ? 'rejected' : status === 3 ? 'initiated' : 'requested';
  }
} as const;

export type PayoutProfileInput = ReturnType<typeof Payouts.input>;
