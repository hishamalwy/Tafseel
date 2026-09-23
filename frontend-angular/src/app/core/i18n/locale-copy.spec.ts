import { describe, expect, it } from 'vitest';
import ar from '../../../../public/locale/ar.json';
import en from '../../../../public/locale/en.json';

const tables = { ar: ar as Record<string, string>, en: en as Record<string, string> };

/**
 * UX-06. Checkout told every student, in Arabic, «يصل التأكيد عبر webhook» — a word from the payment
 * integration, not from the person paying. The words below belong to engineers; a student or teacher never
 * needs them to pay, and so never meets them. The simulator's own page (`mock_pay_*`) exists only where the
 * mock provider is switched on, never in production, and is the one place allowed to describe itself.
 */
const DEVELOPER_WORDS = /\b(webhook|staging|endpoint|payload|callback|api)\b/i;

describe('checkout copy', () => {
  for (const [lang, table] of Object.entries(tables)) {
    it(`speaks to the person paying, in ${lang}, not to the engineer`, () => {
      const leaks = Object.entries(table)
        .filter(([key]) => key.startsWith('pay_'))
        .filter(([, text]) => DEVELOPER_WORDS.test(text))
        .map(([key, text]) => `${key}: ${text}`);

      expect(leaks).toEqual([]);
    });
  }

  it('keeps Arabic checkout copy free of Latin words other than product and format names', () => {
    const latin = Object.entries(tables.ar)
      .filter(([key]) => key.startsWith('pay_'))
      .flatMap(([key, text]) => (text.match(/[A-Za-z]{3,}/g) ?? [])
        .filter(word => !/^(Tafseel|CVC|PDF|WELCOME\d*|mada|Apple|Pay|STC)$/i.test(word))
        .map(word => `${key}: ${word}`));

    expect(latin).toEqual([]);
  });
});
