import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import ar from '../../../../public/locale/ar.json';
import en from '../../../../public/locale/en.json';
import { LocaleService } from '@core/i18n/locale.service';
import { AgreedPriceSource } from '@shared/models/agreed-price';
import { PricePanelComponent } from './price-panel.component';

const order = (over: Partial<AgreedPriceSource> = {}): AgreedPriceSource => ({
  price: 150, currency: 'SAR', studentFeePercent: 8, studentFeeAmount: 12, studentTotal: 162,
  listedPriceAtRequest: 100, listedCurrencyAtRequest: 'SAR', ...over
});

/** The panel with the shipped locale tables, so the words asserted are the words students read. */
function render(source: AgreedPriceSource, lang: 'ar' | 'en' = 'en', paid = false) {
  const table = (lang === 'ar' ? ar : en) as Record<string, string>;
  const locale = {
    lang: signal(lang), isRtl: signal(lang === 'ar'),
    t: (key: string, fallback = '') => table[key] ?? fallback,
    format: (key: string, values: Record<string, string | number>, fallback = '') =>
      Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), table[key] ?? fallback)
  };
  // Some tests render the panel twice (two languages, or paid and unpaid) inside one `it`.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: LocaleService, useValue: locale }]
  });
  const fixture = TestBed.createComponent(PricePanelComponent);
  fixture.componentRef.setInput('order', source);
  fixture.componentRef.setInput('paid', paid);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const labels = (el: HTMLElement) => [...el.querySelectorAll('dt')].map(dt => dt.textContent!.trim());
const row = (el: HTMLElement, key: string) => el.querySelector(`[data-testid="price-row-${key}"]`);

describe('PricePanelComponent', () => {
  it('tells the student what they were quoted and what was agreed', () => {
    const el = render(order());

    expect(el.querySelector('[data-testid="price-panel"]')?.getAttribute('data-comparison')).toBe('true');
    expect(labels(el)).toEqual([
      'Price when you sent the request',
      'Price after the teacher reviewed your request',
      'Tafseel service fee (8%)',
      'Total to pay'
    ]);
  });

  it('says the same thing in Arabic', () => {
    const el = render(order(), 'ar');

    expect(labels(el)).toEqual([
      'السعر عند إرسال الطلب',
      'السعر بعد مراجعة المعلم لطلبك',
      'رسوم خدمة تفصيل (8٪)',
      'الإجمالي المطلوب'
    ]);
  });

  it('uses no wording that accuses the teacher of raising a price', () => {
    const text = render(order(), 'ar').textContent ?? '';
    const english = render(order()).textContent ?? '';

    for (const forbidden of ['زيادة السعر', 'السعر المدرج', 'ارتفع', 'رفع السعر']) {
      expect(text).not.toContain(forbidden);
    }
    for (const forbidden of ['Listed price', 'price increase', 'increased', 'was raised']) {
      expect(english.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('makes no comparison when nothing changed', () => {
    const el = render(order({ price: 100, studentFeeAmount: 8, studentTotal: 108 }));

    expect(el.querySelector('[data-testid="price-panel"]')?.getAttribute('data-comparison')).toBe('false');
    expect(row(el, 'listed')).toBeNull();
    expect(labels(el)).toEqual(['Price', 'Tafseel service fee (8%)', 'Total to pay']);
  });

  it('shows a request from before the capture without inventing its history', () => {
    const el = render(order({ listedPriceAtRequest: null, listedCurrencyAtRequest: null }));

    expect(row(el, 'listed')).toBeNull();
    expect(row(el, 'price')?.textContent).toContain('150');
  });

  it('renders money through the house price component, never as raw letters', () => {
    const el = render(order());

    expect(el.querySelectorAll('tf-price').length).toBe(4);
    expect(el.textContent).not.toContain('SAR');
  });

  it('calls the last row paid once the money is taken', () => {
    expect(labels(render(order(), 'en', true)).at(-1)).toBe('Total');
    expect(labels(render(order(), 'ar', true)).at(-1)).toBe('الإجمالي');
  });

  it('says nothing is taken until the student chooses to pay, and stops saying it afterwards', () => {
    expect(render(order()).querySelector('[data-testid="price-note"]')?.textContent)
      .toContain('Nothing is charged unless you choose to pay.');
    expect(render(order(), 'ar').querySelector('[data-testid="price-note"]')?.textContent)
      .toContain('لن يُخصم أي مبلغ إلا إذا اخترت الدفع.');
    expect(render(order(), 'en', true).querySelector('[data-testid="price-note"]')).toBeNull();
  });
});
