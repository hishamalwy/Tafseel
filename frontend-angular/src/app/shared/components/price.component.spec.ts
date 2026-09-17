import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import ar from '../../../../public/locale/ar.json';
import en from '../../../../public/locale/en.json';
import { LocaleService } from '@core/i18n/locale.service';
import { PriceComponent } from './price.component';

const table = (t: unknown) => t as Record<string, string>;

function render(amount: number | null, currency = 'SAR', lang: 'ar' | 'en' = 'ar') {
  const strings = lang === 'ar' ? table(ar) : table(en);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), {
      provide: LocaleService,
      useValue: { lang: signal(lang), isRtl: signal(lang === 'ar'), t: (k: string, f = '') => strings[k] ?? f }
    }]
  });
  const fixture = TestBed.createComponent(PriceComponent);
  fixture.componentRef.setInput('amount', amount);
  fixture.componentRef.setInput('currency', currency);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/**
 * UX-06. The riyal mark used to be a webfont glyph shown only when `html.tf-riyal-font-ok` was present — and
 * nothing in the product ever set that class, so every Arabic screen printed the Latin letters "SAR".
 */
describe('PriceComponent', () => {
  it('prints no Latin currency code inside an Arabic price', () => {
    const el = render(150);

    expect(el.textContent).toContain('150');
    expect(el.textContent).not.toContain('SAR');
  });

  it('names the currency in the reader’s own language for screen readers', () => {
    const mark = render(150).querySelector('.tf-price-currency--mark');

    expect(mark?.getAttribute('aria-label')).toBe('ريال سعودي');
    expect(render(150, 'SAR', 'en').querySelector('.tf-price-currency--mark')?.getAttribute('aria-label')).toBe('SAR');
  });

  it('still spells out a currency that has no mark', () => {
    expect(render(150, 'USD').textContent).toContain('USD');
  });

  it('shows a missing amount as the placeholder, not as zero', () => {
    expect(render(null).textContent?.trim()).not.toContain('0');
  });
});
