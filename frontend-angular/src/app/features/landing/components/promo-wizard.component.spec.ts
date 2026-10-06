import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ReducedMotion } from '@core/a11y/reduced-motion.service';
import { LocaleService } from '@core/i18n/locale.service';
import { landingCopy } from '../content/landing.copy';
import { Promotion } from '../models/promotion';
import { PromoWizardComponent } from './promo-wizard.component';

const promotion = (over: Partial<Promotion> = {}): Promotion => ({
  id: 'p1', kindCode: 'announcement',
  eyebrowArabic: 'جديد', eyebrowEnglish: 'New',
  titleArabic: 'جلسات مباشرة', titleEnglish: 'Live sessions',
  bodyArabic: 'احجز جلسة مع معلمك.', bodyEnglish: 'Book a session with your teacher.',
  highlightArabic: '', highlightEnglish: '',
  couponCode: '', ctaLabelArabic: 'جرّبها الآن', ctaLabelEnglish: 'Try it now',
  ctaHref: '/teachers', endsAt: '',
  ...over
});

function renderFixture(over: Partial<Promotion> = {}, lang: 'ar' | 'en' = 'en') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PromoWizardComponent],
    providers: [
      { provide: LocaleService, useValue: { lang: signal(lang), isRtl: signal(lang === 'ar'), t: (_: string, f = '') => f, toggle: () => {} } },
      // The test DOM has no matchMedia; the dialog only asks whether it may animate.
      { provide: ReducedMotion, useValue: { preferred: signal(true), allowsMotion: signal(false) } }
    ]
  });
  const fixture = TestBed.createComponent(PromoWizardComponent);
  fixture.componentRef.setInput('promotion', promotion(over));
  fixture.detectChanges();
  return fixture;
}

function render(over: Partial<Promotion> = {}, lang: 'ar' | 'en' = 'en'): HTMLElement {
  return renderFixture(over, lang).nativeElement as HTMLElement;
}

describe('UX-07 the promo dialog', () => {
  it('reports a copied code only after clipboard success and offers manual copy on refusal or missing support', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    try {
      for (const { clipboard, success } of [
        { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }, success: true },
        { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('permission denied')) }, success: false },
        { clipboard: undefined, success: false }
      ]) {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
        const fixture = renderFixture({ kindCode: 'discount', couponCode: 'TAFSEEL20' });
        const copied = vi.fn(), claimed = vi.fn();
        fixture.componentInstance.codeCopied.subscribe(copied);
        fixture.componentInstance.claimed.subscribe(claimed);
        await fixture.componentInstance.copyCode();
        fixture.detectChanges();
        expect(claimed).toHaveBeenCalledOnce();
        if (!success) {
          expect(copied).not.toHaveBeenCalled();
          expect(fixture.nativeElement.querySelector('[role=status]')?.textContent).toContain('TAFSEEL20');
        } else {
          expect(copied).toHaveBeenCalledWith('TAFSEEL20');
        }
        fixture.destroy();
      }
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('shows a copyable code on a discount', () => {
    const page = render({ kindCode: 'discount', couponCode: 'TAFSEEL20' });
    expect(page.textContent).toContain('TAFSEEL20');
    expect(page.querySelector('.tf-promo-code')).not.toBeNull();
    expect(page.textContent).toContain(landingCopy(false).promoCopy);
  });

  it('labels the code in Arabic', () => {
    const page = render({ kindCode: 'discount', couponCode: 'TAFSEEL20' }, 'ar');
    expect(page.textContent).toContain('TAFSEEL20');
    expect(page.textContent).toContain(landingCopy(true).promoCodeLabel);
    expect(page.textContent).toContain('جلسات مباشرة');
  });

  it('still shows the promotion itself, and its call to action', () => {
    const page = render({ couponCode: 'TAFSEEL20' });
    expect(page.textContent).toContain('Live sessions');
    expect(page.textContent).toContain('Book a session with your teacher.');
    expect(page.textContent).toContain('Try it now');
  });

  it('leaves no empty field when an announcement has no coupon', () => {
    const page = render({ couponCode: 'TAFSEEL20' });
    // Only fields with real content remain (this promotion has no countdown).
    for (const field of [...page.querySelectorAll('.tf-promo-field')])
      expect(field.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });
});
