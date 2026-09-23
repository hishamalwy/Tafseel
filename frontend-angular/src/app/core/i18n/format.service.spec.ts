import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import ar from '../../../../public/locale/ar.json';
import en from '../../../../public/locale/en.json';
import { FormatService } from './format.service';
import { LocaleService } from './locale.service';

function formatter(lang: 'ar' | 'en') {
  const table = (lang === 'ar' ? ar : en) as Record<string, string>;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{
      provide: LocaleService,
      useValue: { lang: signal(lang), isRtl: signal(lang === 'ar'), t: (k: string, f = '') => table[k] ?? f }
    }]
  });
  return TestBed.inject(FormatService);
}

/**
 * UX-06. Wherever a screen names the currency in words — «السعر (SAR)» above a price field, the accept dialog's
 * range, a plain-text amount — the ISO code leaked English into Arabic. One rule now answers all of them.
 */
describe('FormatService currency wording', () => {
  it('names SAR in Arabic on an Arabic screen', () => {
    expect(formatter('ar').currencyLabel('SAR')).toBe('ر.س');
  });

  it('keeps SAR as SAR in English', () => {
    expect(formatter('en').currencyLabel('SAR')).toBe('SAR');
  });

  it('treats a missing or lower-case code as SAR, the only currency V1 prices in', () => {
    const fmt = formatter('ar');
    expect(fmt.currencyLabel(null)).toBe('ر.س');
    expect(fmt.currencyLabel(' sar ')).toBe('ر.س');
  });

  it('leaves any other currency as its code', () => {
    expect(formatter('ar').currencyLabel('USD')).toBe('USD');
  });

  it('writes a plain-text amount with Latin digits and the Arabic abbreviation', () => {
    expect(formatter('ar').money(853.2, 'SAR')).toBe('853.2 ر.س');
    expect(formatter('en').money(853.2, 'SAR')).toBe('853.2 SAR');
  });
});
