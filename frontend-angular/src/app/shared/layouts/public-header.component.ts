import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { ResolveLandingRoute } from '@core/auth/services/resolve-landing-route.use-case';
import { BrandMarkComponent } from '@shared/components/brand-mark.component';
import { LangToggleComponent } from '@shared/components/lang-toggle.component';
import { ThemeToggleComponent } from '@shared/components/theme-toggle.component';

/**
 * The marketing header: brand, primary nav, preferences, and either an account
 * link or a log-in link.
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
   * One path per goal (UX-05): a visitor or student posts a request through the request-mode
   * choice; a teacher's marketplace is Open requests, not the student's form.
   */
  readonly demandLink = computed(() => this.store.roles().includes('Teacher') && !this.store.roles().includes('Student')
    ? { path: '/teacher/opportunities', label: this.t('nav_open_requests', 'Open requests') }
    : { path: '/requests/new', label: this.labels().post });

  readonly labels = computed(() => ({
    home: this.t('nav_home', 'Tafseel home'),
    primaryNav: this.t('nav_primary', 'Primary'),
    browse: this.t('nav_browse', 'Browse teachers'),
    post: this.t('nav_post_request', 'Post a Request'),
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

  private t(key: string, fallback: string): string {
    return this.locale.t(key, fallback);
  }
}
