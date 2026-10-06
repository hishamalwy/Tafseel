import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ReducedMotion } from '@core/a11y/reduced-motion.service';
import { ResolveLandingRoute } from '@core/auth/services/resolve-landing-route.use-case';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { LocaleService } from '@core/i18n/locale.service';
import { ThemeService } from '@core/theme/theme.service';
import { Campaigns, LandingContent, LoadLandingContent, LoadStudentJourney } from '../services/landing.use-cases';
import { LandingPageComponent } from './landing-page.component';

async function render(roles: readonly string[] = [], services: LandingContent['services'] = [], stats: LandingContent['stats'] = null) {
  TestBed.resetTestingModule();
  const content: LandingContent = { subjects: [], teachers: [], services, promotions: [], stats };
  await TestBed.configureTestingModule({
    imports: [LandingPageComponent],
    providers: [
      provideRouter([]),
      { provide: LocaleService, useValue: { lang: signal('en'), t: (_: string, fallback = '') => fallback, toggle: () => {} } },
      { provide: ThemeService, useValue: { toggle: () => {} } },
      { provide: ReducedMotion, useValue: { preferred: signal(true), allowsMotion: signal(false) } },
      { provide: SignalSessionStore, useValue: { value: signal(null), isAuthenticated: signal(roles.length > 0), roles: signal(roles) } },
      { provide: ResolveLandingRoute, useValue: { homeFor: () => '/admin' } },
      { provide: LoadLandingContent, useValue: { execute: async (publish: (value: Partial<LandingContent>) => void) => { publish(content); return content; } } },
      { provide: LoadStudentJourney, useValue: { execute: async () => ({ state: 'idle', journey: null, selectedOffer: null }) } },
      { provide: Campaigns, useValue: { primary: () => null, coolingDown: () => true } }
    ]
  }).compileComponents();
  const fixture = TestBed.createComponent(LandingPageComponent);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('Landing discovery and account actions', () => {
  it('keeps the Kingdom map and live platform counts in the hero, including pending counts', async () => {
    const pending = await render();
    const pendingHero = pending.nativeElement.querySelector('.tf-landing-hero') as HTMLElement;
    expect(pendingHero.querySelector('tf-kingdom-map')).not.toBeNull();
    expect([...pendingHero.querySelectorAll('.tf-orb-value')].map(el => el.textContent)).toEqual(['—', '—', '—']);
    const ready = await render([], [], { students: 120, teachers: 24, completedSessions: 85, subjects: 6 });
    const readyHero = ready.nativeElement.querySelector('.tf-landing-hero') as HTMLElement;
    expect([...readyHero.querySelectorAll('.tf-orb-value')].map(el => el.getAttribute('data-count-up'))).toEqual(['120', '24', '85']);
    expect(ready.nativeElement.querySelectorAll('tf-kingdom-map')).toHaveLength(1);
  });

  it('browses on blank search, trims a query, and distinguishes empty from unavailable services', async () => {
    const fixture = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance.search(new Event('submit'));
    expect(navigate).toHaveBeenLastCalledWith(['/teachers'], { queryParams: {} });
    fixture.componentInstance.query.set('  algebra  ');
    fixture.componentInstance.search(new Event('submit'));
    expect(navigate).toHaveBeenLastCalledWith(['/teachers'], { queryParams: { q: 'algebra' } });
    expect(fixture.componentInstance.servicesEmpty()).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.tf-svc-item')).toHaveLength(0);
    const unavailable = await render([], null);
    expect(unavailable.componentInstance.servicesEmpty()).toBe(false);
    expect(unavailable.componentInstance.servicesFailed()).toBe(true);
    expect(unavailable.nativeElement.querySelectorAll('.tf-svc-item')).toHaveLength(0);
  });

  it('uses one recruitment route for guests and removes student-only actions for teachers and staff', async () => {
    const guest = await render();
    const guestHrefs = [...(guest.nativeElement as HTMLElement).querySelectorAll('a')].map(a => a.getAttribute('href'));
    expect(guestHrefs.filter(href => href === '/auth?mode=register&role=teacher').length).toBeGreaterThanOrEqual(2);
    expect(guestHrefs).not.toContain('/teach/apply');
    for (const roles of [['Teacher'], ['Teacher', 'Student'], ['Admin'], ['Finance'], ['QualityReviewer']]) {
      const fixture = await render(roles);
      const page = fixture.nativeElement as HTMLElement;
      const hrefs = [...page.querySelectorAll('a')].map(a => a.getAttribute('href'));
      expect(hrefs).not.toContain('/requests/new/open');
      expect(hrefs).not.toContain('/auth?mode=register&role=teacher');
      expect(page.querySelector('.tf-cta-primary')?.getAttribute('href')).toBe(roles.includes('Teacher') ? '/teacher/opportunities' : '/admin');
    }
  });
});
