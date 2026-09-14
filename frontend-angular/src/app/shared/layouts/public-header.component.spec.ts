import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LocaleService } from '@core/i18n/locale.service';
import { ResolveLandingRoute } from '@core/auth/services/resolve-landing-route.use-case';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { ThemeService } from '@core/theme/theme.service';
import { PublicHeaderComponent } from './public-header.component';

describe('PublicHeaderComponent', () => {
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
  });
});
