import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
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

function render(over: Partial<Promotion> = {}, lang: 'ar' | 'en' = 'en'): HTMLElement {
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
  return fixture.nativeElement as HTMLElement;
}

describe('UX-07 the promo dialog', () => {
  it('never shows a coupon code, whatever the server published', () => {
    const page = render({ couponCode: 'TAFSEEL20' });
    const copy = landingCopy(false);
    expect(page.textContent).not.toContain('TAFSEEL20');
    expect(page.querySelector('.tf-promo-code')).toBeNull();
    expect(page.querySelector('.tf-promo-code-copy')).toBeNull();
    // Nothing invites the visitor to use a code they cannot redeem.
    expect(page.textContent).not.toContain(copy.promoCodeLabel);
    expect(page.textContent).not.toContain(copy.promoCopy);
  });

  it('says the same in Arabic', () => {
    const page = render({ couponCode: 'TAFSEEL20' }, 'ar');
    expect(page.textContent).not.toContain('TAFSEEL20');
    expect(page.textContent).not.toContain(landingCopy(true).promoCodeLabel);
    expect(page.textContent).toContain('جلسات مباشرة');
  });

  it('still shows the promotion itself, and its call to action', () => {
    const page = render({ couponCode: 'TAFSEEL20' });
    expect(page.textContent).toContain('Live sessions');
    expect(page.textContent).toContain('Book a session with your teacher.');
    expect(page.textContent).toContain('Try it now');
  });

  it('leaves no empty field where the code block used to be', () => {
    const page = render({ couponCode: 'TAFSEEL20' });
    // Only fields with real content remain (this promotion has no countdown).
    for (const field of [...page.querySelectorAll('.tf-promo-field')])
      expect(field.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });
});
