/** Official SAMA riyal sign (U+20C1). The self-hosted `saudi_riyal` face draws it. */
export const RIYAL_MARK = '\u20C1';

/**
 * Money formatting, ported from `Tafseel.money` / `moneyView` / `moneyParts`.
 *
 * Two rules carried over verbatim, both deliberate and both easy to lose in a
 * rewrite:
 *
 *  - **Amounts always use Latin digits**, even in Arabic. SAMA writes `⃁ 1,620`,
 *    not Arabic-Indic numerals, so the formatter is pinned to `en-US` regardless
 *    of interface language.
 *  - **SAR renders as the official riyal mark**, never through `Intl`'s currency
 *    glyph and never as the letters "SAR" or «ر.س». The self-hosted face covers
 *    U+20C1 so the same sign works in Arabic, English, and plain text.
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
  /** Safe in any plain-text context — amount plus the official mark for SAR. */
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
        // UX-35: a fraction always has two digits (140.40, not 140.4), as money is written everywhere else.
        minimumFractionDigits: Number.isInteger(amount) ? 0 : 2
      }).format(amount);
    } catch {
      formatted = String(amount);
    }
    return { amount: formatted, code, isSar: code === 'SAR', numeric: amount };
  },

  /**
   * Plain text: `1,620 ⃁`. The official mark, never "SAR" or a tofu glyph.
   *
   * Deviation from `Tafseel.money`, deliberate: the legacy version tested only
   * `Number.isFinite`, and `Number(null)` is `0`, so a missing price rendered as
   * "0 SAR" — an absent amount shown as free. `moneyView` already guarded null
   * separately; this brings the two into line rather than preserving the gap.
   */
  format(value: unknown, currency?: string, unavailable = '—', sarLabel?: string): string {
    if (value == null || value === '') return unavailable;
    const amount = Number(value);
    if (!Number.isFinite(amount)) return unavailable;
    const parts = Money.parts(amount, currency, unavailable);
    const code = parts.isSar ? (sarLabel || RIYAL_MARK) : parts.code;
    return parts.amount + NBSP + code;
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
