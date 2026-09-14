/**
 * Money formatting, ported from `Tafseel.money` / `moneyView` / `moneyParts`.
 *
 * Two rules carried over verbatim, both deliberate and both easy to lose in a
 * rewrite:
 *
 *  - **Amounts always use Latin digits**, even in Arabic. SAMA writes `⃁ 1,620`,
 *    not Arabic-Indic numerals, so the formatter is pinned to `en-US` regardless
 *    of interface language.
 *  - **SAR never renders through `Intl`'s currency glyph.** The Unicode riyal
 *    sign is missing from many fonts and lands as tofu, so the amount and the
 *    mark are kept apart: plain-text callers get the ISO code, and UI callers
 *    pair `amountNumber` with the SAMA symbol element themselves.
 */

export interface MoneyParts {
  /** The number alone, grouped, Latin digits. */
  readonly amount: string;
  /** ISO code, upper-cased. */
  readonly code: string;
  readonly isSar: boolean;
  readonly numeric: number | null;
}

export interface MoneyView {
  /** Safe in any plain-text context — amount plus ISO code, never a glyph. */
  readonly amount: string;
  /** The number alone, for pairing with the SAMA mark in markup. */
  readonly amountNumber: string;
  /** Render the riyal mark beside `amountNumber`. */
  readonly isSarAmount: boolean;
  /** Render `amount` as-is. */
  readonly isPlainAmount: boolean;
}

const NBSP = ' ';

export const Money = {
  parts(value: unknown, currency?: string, unavailable = '—'): MoneyParts {
    const amount = Number(value);
    const code = (String(currency ?? 'SAR').trim().toUpperCase()) || 'SAR';
    if (!Number.isFinite(amount)) {
      return { amount: unavailable, code, isSar: code === 'SAR', numeric: null };
    }

    let formatted: string;
    try {
      formatted = new Intl.NumberFormat('en-US', {
        // Whole amounts read as 1,620 rather than 1,620.00.
        maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
        minimumFractionDigits: 0
      }).format(amount);
    } catch {
      formatted = String(amount);
    }
    return { amount: formatted, code, isSar: code === 'SAR', numeric: amount };
  },

  /**
   * Plain text: `1,620 SAR`. Never a currency symbol.
   *
   * Deviation from `Tafseel.money`, deliberate: the legacy version tested only
   * `Number.isFinite`, and `Number(null)` is `0`, so a missing price rendered as
   * "0 SAR" — an absent amount shown as free. `moneyView` already guarded null
   * separately; this brings the two into line rather than preserving the gap.
   */
  format(value: unknown, currency?: string, unavailable = '—'): string {
    if (value == null || value === '') return unavailable;
    const amount = Number(value);
    if (!Number.isFinite(amount)) return unavailable;
    const parts = Money.parts(amount, currency, unavailable);
    return parts.amount + NBSP + parts.code;
  },

  /** What a table cell or card needs to decide between the mark and the code. */
  view(value: unknown, currency?: string, unavailable = '—'): MoneyView {
    const amount = Number(value);
    if (value == null || !Number.isFinite(amount)) {
      return {
        amount: unavailable, amountNumber: unavailable,
        isSarAmount: false, isPlainAmount: true
      };
    }
    const parts = Money.parts(amount, currency ?? 'SAR', unavailable);
    return {
      amount: Money.format(amount, currency ?? 'SAR', unavailable),
      amountNumber: parts.amount,
      isSarAmount: parts.isSar,
      isPlainAmount: !parts.isSar
    };
  }
} as const;
