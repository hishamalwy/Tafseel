import { describe, expect, it } from 'vitest';
import { Money } from './money';
import { DisplayName } from './display-name';

/**
 * These two rules are the ones a rewrite loses quietly, so they are pinned:
 * SAR renders as the official U+20C1 mark, and amounts never use Arabic-Indic
 * digits even when the interface is Arabic.
 */
describe('Money', () => {
  it('writes the official riyal mark, never a tofu glyph or ISO letters', () => {
    expect(Money.format(1620, 'SAR')).toBe('1,620 \u20C1');
    expect(Money.format(1620, 'USD')).toBe('1,620 USD');
    expect(Money.format(1620, 'SAR')).not.toContain('﷼');
    expect(Money.format(1620, 'SAR')).not.toContain('SAR');
  });

  it('uses Latin digits regardless of interface language', () => {
    // The formatter is pinned to en-US on purpose; there is no locale input.
    expect(Money.format(1620, 'SAR')).toMatch(/^[\d,]+/);
  });

  it('drops the decimals on whole amounts and keeps two otherwise', () => {
    expect(Money.parts(1620, 'SAR').amount).toBe('1,620');
    expect(Money.parts(1620.5, 'SAR').amount).toBe('1,620.50');
    expect(Money.parts(1620.55, 'SAR').amount).toBe('1,620.55');
  });

  it('defaults a missing currency to SAR', () => {
    expect(Money.parts(10).code).toBe('SAR');
    expect(Money.parts(10, '  sar ').code).toBe('SAR');
  });

  it('flags SAR so the caller can pair the amount with the SAMA mark', () => {
    const sar = Money.view(1620, 'SAR');
    expect(sar.isSarAmount).toBe(true);
    expect(sar.isPlainAmount).toBe(false);
    expect(sar.amountNumber).toBe('1,620');

    const usd = Money.view(1620, 'USD');
    expect(usd.isSarAmount).toBe(false);
    expect(usd.isPlainAmount).toBe(true);
  });

  it('uses a caller-supplied SAR label when one is given', () => {
    expect(Money.format(1620, 'SAR', '—', '\u20C1')).toBe('1,620 \u20C1');
    expect(Money.format(1620, 'SAR', '—', '\u20C1')).not.toContain('SAR');
  });

  it('never relabels a currency that is not SAR', () => {
    expect(Money.format(1620, 'USD', '—', '\u20C1')).toBe('1,620 USD');
  });

  it('keeps Latin digits for the amount whatever the currency label', () => {
    expect(Money.format(1620, 'SAR', '—', '\u20C1')).toMatch(/^1,620/);
  });

  it('answers with the unavailable text rather than NaN', () => {
    expect(Money.format(null, 'SAR', 'n/a')).toBe('n/a');
    expect(Money.format(undefined, 'SAR', 'n/a')).toBe('n/a');
    expect(Money.format('nonsense', 'SAR', 'n/a')).toBe('n/a');
    expect(Money.view(null, 'SAR', 'n/a').isPlainAmount).toBe(true);
  });

  it('handles zero as a real amount, not as missing', () => {
    expect(Money.format(0, 'SAR')).toBe('0 \u20C1');
    expect(Money.view(0, 'SAR').amountNumber).toBe('0');
  });
});

describe('DisplayName', () => {
  const dto = {
    teacherDisplayName: 'نور', teacherDisplayNameEnglish: 'Noor',
    studentDisplayName: 'سارة', studentDisplayNameEnglish: 'Sara'
  };

  it('picks the language-appropriate spelling', () => {
    expect(DisplayName.ofParty(dto, 'teacher', true, '—')).toBe('نور');
    expect(DisplayName.ofParty(dto, 'teacher', false, '—')).toBe('Noor');
    expect(DisplayName.ofParty(dto, 'student', true, '—')).toBe('سارة');
    expect(DisplayName.ofParty(dto, 'student', false, '—')).toBe('Sara');
  });

  it('falls back across languages rather than showing nothing', () => {
    expect(DisplayName.pick('نور', '', false)).toBe('نور');
    expect(DisplayName.pick('', 'Noor', true)).toBe('Noor');
  });

  /** The rule that matters: a raw id must never reach the screen. */
  it('answers the unavailable text when both names are missing', () => {
    expect(DisplayName.ofParty({}, 'teacher', false, 'name unavailable')).toBe('name unavailable');
    expect(DisplayName.ofParty(null, 'teacher', false, 'name unavailable')).toBe('name unavailable');
    expect(DisplayName.ofUser({ fullName: '  ' }, false, 'name unavailable')).toBe('name unavailable');
  });

  it('accepts either fullName or name on a user', () => {
    expect(DisplayName.ofUser({ name: 'Noor' }, false, '—')).toBe('Noor');
    expect(DisplayName.ofUser({ fullName: 'Noor' }, false, '—')).toBe('Noor');
  });
});
