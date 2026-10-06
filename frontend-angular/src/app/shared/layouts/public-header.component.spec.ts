import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LocaleService } from '@core/i18n/locale.service';
import { ResolveLandingRoute } from '@core/auth/services/resolve-landing-route.use-case';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { ThemeService } from '@core/theme/theme.service';
import { PublicHeaderComponent } from './public-header.component';

async function header(roles: readonly string[]) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [PublicHeaderComponent],
    providers: [
      provideRouter([]),
      { provide: LocaleService, useValue: { lang: signal('en'), t: (_key: string, fallback: string) => fallback, toggle: () => {} } },
      { provide: ThemeService, useValue: { toggle: () => {} } },
      { provide: SignalSessionStore, useValue: { value: signal(null), isAuthenticated: signal(roles.length > 0), roles: signal(roles) } },
      { provide: ResolveLandingRoute, useValue: { homeFor: () => '/' } }
    ]
  }).compileComponents();
  const fixture = TestBed.createComponent(PublicHeaderComponent);
  fixture.componentRef.setInput('menuId', 'test-public-menu');
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PublicHeaderComponent', () => {
  it('opens the explanation form directly, labels it as help, and gives a teacher Open requests instead', async () => {
    for (const roles of [[], ['Student']]) {
      const link = (await header(roles)).querySelector('[data-testid=header-demand-link]')!;
      expect(link.getAttribute('href')).toBe('/requests/new/open');
      expect(link.textContent?.trim()).toBe('Get help');
    }
    const teacher = await header(['Teacher']);
    const link = teacher.querySelector('[data-testid=header-demand-link]')!;
    expect(link.getAttribute('href')).toBe('/teacher/opportunities');
    expect(link.textContent?.trim()).toBe('Open requests');
    const hrefs = [...teacher.querySelectorAll('a')].map(a => a.getAttribute('href'));
    expect(hrefs).not.toContain('/requests');
  });

  it('offers one primary call to action to visitors, then removes it after sign-in', async () => {
    const visitor = await header([]);
    for (const id of ['header-cta', 'menu-cta']) {
      const cta = visitor.querySelector(`[data-testid=${id}]`)!;
      expect(cta.textContent?.trim()).toBe('Get started');
      expect(cta.getAttribute('href')).toBe('/auth?mode=register&role=student');
      expect(cta.classList.contains('tf-button')).toBe(true);
    }
    const studentPage = await header(['Student']);
    expect(studentPage.querySelector('[data-testid=header-cta]')).toBeNull();
    expect(studentPage.querySelector('[data-testid=menu-cta]')).toBeNull();
    for (const roles of [['Teacher'], ['Admin'], ['Finance']]) {
      const page = await header(roles);
      expect(page.querySelector('[data-testid=header-cta]')).toBeNull();
      expect(page.querySelector('[data-testid=menu-cta]')).toBeNull();
    }
  });

  it('renders an identifiable menu control and keeps its state in sync', async () => {
    await TestBed.configureTestingModule({
      imports: [PublicHeaderComponent],
      providers: [
        provideRouter([]),
        { provide: LocaleService, useValue: { lang: signal('en'), t: (_key: string, fallback: string) => fallback, toggle: () => {} } },
        { provide: ThemeService, useValue: { toggle: () => {} } },
        { provide: SignalSessionStore, useValue: { value: signal(null), isAuthenticated: signal(false), roles: signal([]) } },
        { provide: ResolveLandingRoute, useValue: { homeFor: () => '/' } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(PublicHeaderComponent);
    fixture.componentRef.setInput('menuId', 'test-public-menu');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('[data-public-menu-toggle]') as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBe('Menu');
    expect(button.querySelector('svg')).toBeTruthy();
    expect(button.getAttribute('aria-expanded')).toBe('false');

    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('#test-public-menu')?.getAttribute('data-public-menu')).toBe('open');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);

    button.click();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
