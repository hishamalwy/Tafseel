import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { ResolveLandingRoute } from '@core/auth/services/resolve-landing-route.use-case';
import { BrandMarkComponent } from '@shared/components/brand-mark.component';
import { LangToggleComponent } from '@shared/components/lang-toggle.component';
import { ThemeToggleComponent } from '@shared/components/theme-toggle.component';

/**
 * The marketing header: brand, primary nav, preferences, either an account
 * link or a log-in link, and one primary call to action.
 *
 * The call to action never asks a signed-in person to sign up: a visitor starts
 * registering as a student (the existing form, Student preselected), a student
 * goes to ask for help, and anyone else to their own home.
 *
 * Five legacy pages each carried a full copy of this — the desktop nav, the
 * mobile sheet, and both `sc-if` branches for signed-in versus guest — differing
 * only in the menu's `id` and which link was current. The current link is now
 * `routerLinkActive`, which cannot fall out of step with the route the way a
 * hand-set `aria-current` did.
 */
@Component({
  selector: 'tf-public-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, BrandMarkComponent, LangToggleComponent, ThemeToggleComponent],
  templateUrl: './public-header.component.html',
  styles: `:host { display: contents; }`
})
export class PublicHeaderComponent {
  private readonly store = inject(SignalSessionStore);
  private readonly landing = inject(ResolveLandingRoute);
  readonly locale = inject(LocaleService);
  private readonly fmt = inject(FormatService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly menuToggle = viewChild<ElementRef<HTMLButtonElement>>('menuToggle');

  /** Distinct id per page, as the legacy `aria-controls` required. */
  readonly menuId = input('public-menu');

  readonly menuOpen = signal(false);

  readonly session = this.store.value;
  readonly isGuest = computed(() => !this.store.isAuthenticated());
  readonly accountHref = computed(() => this.landing.homeFor(this.store.roles()));
  readonly accountName = computed(() => {
    const s = this.session();
    if (!s) return '';
    return this.locale.lang() === 'ar' ? s.fullName : (s.fullNameEnglish || s.fullName);
  });
  readonly avatarSrc = computed(() => {
    const s = this.session();
    return this.fmt.avatarUrl(s?.userId, !!s?.hasAvatar, null,
      this.store.roles().includes('Teacher') ? 'teacher' : 'student');
  });

  /**
   * Visitors and students go straight to the explanation form; a teacher opens their marketplace.
   * The label describes the student's intent (asking for help), while the route stays the direct form.
   */
  readonly demandLink = computed(() => {
    const roles = this.store.roles();
    if (roles.includes('Teacher')) return { path: '/teacher/opportunities', label: this.t('nav_open_requests', 'Open requests') };
    if (roles.some(role => ['Admin', 'Finance', 'QualityReviewer'].includes(role)))
      return { path: this.accountHref(), label: this.t('nav_dashboard', 'Dashboard') };
    return { path: '/requests/new/open', label: this.t('nav_get_help', 'Get help') };
  });

  readonly cta = computed((): { path: string; query: Record<string, string> | null; label: string } => {
    if (this.isGuest())
      return { path: '/auth', query: { mode: 'register', role: 'student' }, label: this.t('nav_get_started', 'Get started') };
    const roles = this.store.roles();
    if (roles.includes('Student') && !roles.includes('Teacher'))
      return { path: '/requests/new/open', query: null, label: this.t('nav_request_explanation', 'Request an explanation') };
    return { path: this.accountHref(), query: null, label: this.t('nav_dashboard', 'Dashboard') };
  });

  readonly labels = computed(() => ({
    home: this.t('nav_home', 'Tafseel home'),
    primaryNav: this.t('nav_primary', 'Primary'),
    browse: this.t('nav_browse', 'Browse teachers'),
    post: this.t('nav_get_help', 'Get help'),
    about: this.t('nav_about', 'About'),
    login: this.t('nav_login', 'Log in'),
    menu: this.t('nav_menu', 'Menu')
  }));

  toggleMenu(): void {
    this.menuOpen.update(open => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape', ['$event'])
  dismissMenu(event: Event): void {
    if (!this.menuOpen()) return;
    event.preventDefault();
    this.closeMenu();
    this.menuToggle()?.nativeElement.focus();
  }

  @HostListener('document:pointerdown', ['$event'])
  closeOutside(event: Event): void {
    if (this.menuOpen() && !this.host.nativeElement.contains(event.target as Node)) this.closeMenu();
  }

  private t(key: string, fallback: string): string {
    return this.locale.t(key, fallback);
  }
}
