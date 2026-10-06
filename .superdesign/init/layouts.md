# Shared layouts

The Angular root has one router outlet. Pages import their shell directly; no route-level layout wrapper exists. Full source follows, with external templates included. The Landing uses `PublicHeaderComponent`, `SkipLinkComponent`, and `LandingFooterComponent`.

## AppComponent

Root router outlet; individual routed pages compose their own shells.

### frontend-angular/src/app/app.component.ts

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'tf-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />'
})
export class AppComponent {}
```

## AuthShellComponent

Authentication page container and brand affordances.

### frontend-angular/src/app/shared/layouts/auth-shell.component.ts

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandMarkComponent } from '@shared/components/brand-mark.component';
import { LangToggleComponent } from '@shared/components/lang-toggle.component';
import { ThemeToggleComponent } from '@shared/components/theme-toggle.component';

/**
 * The split shell the authentication screens share: form column on one side,
 * the ink brand panel on the other.
 *
 * `Tafseel-Auth.dc.html` and `Tafseel-Confirm-Email.dc.html` each carried a full
 * copy of it, including the toolbar, both toggles and the aside with its mark and
 * two lines of promise. The extra class the confirm page put on each element is
 * kept as an input so its own stylesheet rules still apply.
 */
@Component({
  selector: 'tf-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BrandMarkComponent, LangToggleComponent, ThemeToggleComponent],
  template: `
    <div class="tf-auth-layout" [class]="layoutClass()" data-stack="auth">
      <main [id]="mainId()" class="tf-auth-main" [class]="mainClass()">
        <div class="tf-auth-toolbar">
          <a class="tf-auth-brand" [class]="brandClass()" routerLink="/" [attr.aria-label]="homeLabel()">
            <tf-brand-mark />
          </a>
          <div class="tf-auth-tools" [class]="toolsClass()">
            <tf-lang-toggle />
            <tf-theme-toggle />
          </div>
        </div>

        <ng-content />
      </main>

      <aside class="tf-auth-aside tf-ink-band" data-hide-sm="1"
             data-pattern="bottom" data-pattern-tone="lime" data-pattern-scale="lg">
        <div>
          <img class="tf-auth-mark-light" decoding="async" data-tafseel-mark
               src="assets/brand/tafseel-mark.svg" alt="Tafseel" width="68" height="92" />
          <img class="tf-auth-mark-dark" decoding="async" data-tafseel-mark data-tafseel-mark-force="dark"
               src="assets/brand/tafseel-mark-dark.svg" alt="Tafseel" width="68" height="92" />
          <h2 dir="rtl" lang="ar" translate="no">درسك على مقاسك.</h2>
          <p class="tf-mursala" lang="en" dir="ltr">Education, tailored to you.</p>
        </div>
      </aside>
    </div>
  `,
  styles: `:host { display: block; min-block-size: 100dvh; }`
})
export class AuthShellComponent {
  readonly mainId = input<string | null>(null);
  readonly homeLabel = input('Tafseel home');
  /** Extra classes the confirm-email variant adds on top of the shared ones. */
  readonly layoutClass = input('');
  readonly mainClass = input('');
  readonly brandClass = input('');
  readonly toolsClass = input('');
}
```

### frontend-angular/src/app/shared/layouts/landing-footer.component.html

```html
<footer class="tf-landing-footer" data-pattern="bottom">
  <div class="tf-shell tf-landing-footer-main">
    <section class="tf-landing-footer-intro" aria-label="Tafseel">
      <a class="tf-landing-footer-brand" routerLink="/" [attr.aria-label]="labels().home">
        <img class="tf-footer-mark-light tf-brand-lockup" loading="lazy" decoding="async"
             src="assets/brand/tafseel-lockup.svg" alt="" width="100" height="44" />
        <img class="tf-footer-mark-dark tf-brand-lockup" loading="lazy" decoding="async"
             src="assets/brand/tafseel-lockup-dark.svg" alt="" width="100" height="44" />
      </a>
      <p class="tf-landing-footer-statement">{{ copy().statement }}</p>
      <p class="tf-landing-footer-copy">{{ copy().tagline }}</p>
      @if (socialLabel(); as label) {
        <div class="tf-landing-footer-social">
          <span class="tf-landing-footer-heading">{{ labels().follow }}</span>
          <div class="tf-landing-footer-socials" [attr.aria-label]="label">
            @for (network of NETWORKS; track network) {
              <span class="tf-social-icon" [attr.data-network]="network" aria-hidden="true"></span>
            }
          </div>
          <span class="tf-landing-footer-social-note">{{ labels().socialSoon }}</span>
        </div>
      }
    </section>

    <nav class="tf-landing-footer-directory" [attr.aria-label]="labels().explore">
      <a routerLink="/teachers">{{ labels().browse }}</a>
      <a routerLink="/" fragment="how">{{ labels().how }}</a>
      <a routerLink="/requests/new/open">{{ labels().post }}</a>
      <a routerLink="/teach/apply">{{ labels().teach }}</a>
      <a routerLink="/about">{{ labels().about }}</a>
      <a routerLink="/policies/terms">{{ labels().terms }}</a>
      <a routerLink="/policies/privacy">{{ labels().privacy }}</a>
    </nav>
  </div>

  <div class="tf-shell tf-landing-footer-meta">
    <span>{{ copy().rights }}</span>
    <div class="tf-landing-footer-meta-actions">
      <span>{{ copy().origin }}</span>
      <tf-lang-toggle />
    </div>
  </div>
</footer>
```

## LandingFooterComponent

Public footer with brand statement, canonical product links and locale switch.

### frontend-angular/src/app/shared/layouts/landing-footer.component.ts

```ts
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService } from '@core/i18n/locale.service';
import { LangToggleComponent } from '@shared/components/lang-toggle.component';

export interface FooterCopy {
  readonly statement: string;
  readonly tagline: string;
  readonly rights: string;
  readonly origin: string;
}

/**
 * The full site footer: brand statement, three link columns, and a meta strip.
 *
 * Shared by Landing and About, which each held a copy that differed only in the
 * `aria-labelledby` ids — a detail that has to be unique per page, so it is
 * derived from an input rather than hard-coded.
 */
@Component({
  selector: 'tf-landing-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LangToggleComponent],
  templateUrl: './landing-footer.component.html',
  styles: `:host { display: contents; }`
})
export class LandingFooterComponent {
  readonly locale = inject(LocaleService);

  readonly copy = input.required<FooterCopy>();
  /** Prefix for the heading ids, so two footers on one document stay unique. */
  readonly idPrefix = input('footer');
  /**
   * The social row is Landing's alone — About carries the same footer without
   * it — so it renders only when a caller supplies its accessible name.
   */
  readonly socialLabel = input('');

  readonly NETWORKS = ['x', 'instagram', 'linkedin', 'facebook'] as const;

  readonly labels = computed(() => ({
    home: this.t('nav_home', 'Tafseel home'),
    explore: this.t('foot_explore', 'Explore'),
    start: this.t('foot_start', 'Get started'),
    company: this.t('foot_company', 'Company'),
    browse: this.t('nav_browse', 'Browse teachers'),
    how: this.t('nav_how', 'How it works'),
    post: this.t('nav_get_help', 'Get help'),
    teach: this.t('nav_teach', 'Become a teacher'),
    about: this.t('nav_about', 'About'),
    terms: this.t('nav_terms', 'Terms'),
    privacy: this.t('nav_privacy', 'Privacy'),
    follow: this.t('foot_follow', 'Follow Tafseel'),
    socialSoon: this.t('foot_social_soon', 'Official accounts are coming soon.')
  }));

  private t(key: string, fallback: string): string {
    return this.locale.t(key, fallback);
  }
}
```

## MiniFooterComponent

Compact policy/copyright footer for functional pages.

### frontend-angular/src/app/shared/layouts/mini-footer.component.ts

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandMarkComponent } from '@shared/components/brand-mark.component';

/** The short footer: brand, rights line, three links. Repeated on seven pages. */
@Component({
  selector: 'tf-mini-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BrandMarkComponent],
  template: `
    <footer class="tf-mini-footer" data-pattern="bottom">
      <div class="tf-shell tf-mini-footer__inner">
        <a class="tf-mini-footer__brand" routerLink="/" aria-label="Tafseel">
          <tf-brand-mark tone="auto" [width]="18" [height]="24" [eager]="false" />
        </a>
        <span class="tf-mini-footer__rights">{{ rights() }}</span>
        <nav class="tf-mini-footer__links" aria-label="Tafseel">
          <a routerLink="/about">{{ aboutLabel() }}</a>
          <a routerLink="/teachers">{{ browseLabel() }}</a>
          <a routerLink="/requests/new/open">{{ postLabel() }}</a>
        </nav>
      </div>
    </footer>
  `,
  styles: `:host { display: contents; }`
})
export class MiniFooterComponent {
  readonly rights = input.required<string>();
  readonly aboutLabel = input.required<string>();
  readonly browseLabel = input.required<string>();
  readonly postLabel = input.required<string>();
}
```

### frontend-angular/src/app/shared/layouts/public-header.component.html

```html
<header class="tf-public-header">
  <div data-public-header class="tf-shell tf-public-header__inner">
    <a class="tf-brand-home tf-public-header__brand" routerLink="/" [attr.aria-label]="labels().home">
      <tf-brand-mark [width]="22" [height]="30" />
    </a>

    <nav data-hide-sm class="tf-public-header__nav" [attr.aria-label]="labels().primaryNav">
      <a class="tf-nav-link" routerLink="/teachers" routerLinkActive="is-current"
         [routerLinkActiveOptions]="{ exact: false }" ariaCurrentWhenActive="page">{{ labels().browse }}</a>
      <a class="tf-nav-link" data-testid="header-demand-link" [routerLink]="demandLink().path" routerLinkActive="is-current"
         ariaCurrentWhenActive="page">{{ demandLink().label }}</a>
      <a class="tf-nav-link" routerLink="/about" routerLinkActive="is-current"
         ariaCurrentWhenActive="page">{{ labels().about }}</a>
    </nav>

    <div class="tf-public-header-actions tf-public-header__actions">
      <tf-lang-toggle />
      <tf-theme-toggle />
      <span data-hide-sm class="tf-public-header__divider" aria-hidden="true"></span>

      @if (session(); as user) {
        <a data-hide-sm class="tf-public-header__account" [routerLink]="accountHref()">
          <img decoding="async" [src]="avatarSrc()" alt="" width="24" height="24" />
          <span>{{ accountName() }}</span>
        </a>
      } @else {
        <a data-hide-sm class="tf-nav-login" routerLink="/auth">{{ labels().login }}</a>
      }
      @if (isGuest()) {
        <a data-hide-sm class="tf-button tf-public-header__cta" data-testid="header-cta"
           [routerLink]="cta().path" [queryParams]="cta().query">{{ cta().label }}</a>
      }

      <button type="button" class="tf-icon-btn" data-public-menu-toggle (click)="toggleMenu()"
              [attr.aria-controls]="menuId()" [attr.aria-expanded]="menuOpen()"
              [attr.aria-label]="labels().menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" aria-hidden="true" focusable="false">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
    </div>
  </div>

  <!-- The mobile sheet. `data-public-menu` is what the stylesheet animates. -->
  <div [id]="menuId()" [attr.data-public-menu]="menuOpen() ? 'open' : 'closed'" class="tf-shell">
    <nav [attr.aria-label]="labels().menu">
      <a routerLink="/teachers" routerLinkActive="is-current" [routerLinkActiveOptions]="{ exact: false }"
         ariaCurrentWhenActive="page" (click)="closeMenu()">{{ labels().browse }}</a>
      <a [routerLink]="demandLink().path" routerLinkActive="is-current"
         ariaCurrentWhenActive="page" (click)="closeMenu()">{{ demandLink().label }}</a>
      <a routerLink="/about" routerLinkActive="is-current"
         ariaCurrentWhenActive="page" (click)="closeMenu()">{{ labels().about }}</a>
    </nav>
    <div class="tf-public-menu-actions">
       @if (isGuest()) {
         <a class="tf-button tf-public-menu-cta" data-testid="menu-cta" [routerLink]="cta().path" [queryParams]="cta().query"
            (click)="closeMenu()">{{ cta().label }}</a>
       }
      @if (session(); as user) {
        <a class="tf-public-menu-login" [routerLink]="accountHref()" (click)="closeMenu()">
          <img decoding="async" [src]="avatarSrc()" alt="" width="24" height="24" />
          {{ accountName() }}
        </a>
      } @else {
        <a class="tf-public-menu-login" routerLink="/auth" (click)="closeMenu()">{{ labels().login }}</a>
      }
    </div>
  </div>
</header>
```

## PublicHeaderComponent

Public navigation, guest/sign-in state, role-aware actions, language/theme switches, mobile disclosure.

### frontend-angular/src/app/shared/layouts/public-header.component.ts

```ts
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
  readonly demandLink = computed(() => this.store.roles().includes('Teacher') && !this.store.roles().includes('Student')
    ? { path: '/teacher/opportunities', label: this.t('nav_open_requests', 'Open requests') }
    : { path: '/requests/new/open', label: this.t('nav_get_help', 'Get help') });

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

  private t(key: string, fallback: string): string {
    return this.locale.t(key, fallback);
  }
}
```

## SkipLinkComponent

Keyboard skip-to-main link and controlled focus transfer.

### frontend-angular/src/app/shared/layouts/skip-link.component.ts

```ts
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LocaleService } from '@core/i18n/locale.service';

/**
 * Skip-to-content link: the first focusable element on every screen with a <main>.
 *
 * It moves focus itself instead of relying on the `#fragment`. The app runs under
 * `<base href="/ar/">`, so a bare `href="#main"` resolves to `/ar/#main` and, on any page
 * other than the home page, sent the reader back to the home page instead of past the
 * navigation. `scripts/check-component-styles.mjs` fails the build when a template with a
 * <main> has no skip link pointing at that main's id.
 */
@Component({
  selector: 'tf-skip-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a [attr.href]="'#' + target()" class="tf-skip" (click)="skip($event)">{{ label() }}</a>`,
  styles: `:host { display: contents; }`
})
export class SkipLinkComponent {
  private readonly locale = inject(LocaleService);
  private readonly document = inject(DOCUMENT);

  /** The id of the <main> this link skips to. */
  readonly target = input('main');

  readonly label = computed(() =>
    this.locale.lang() === 'ar' ? 'تخطَّ إلى المحتوى الرئيسي' : 'Skip to main content');

  skip(event: Event): void {
    const main = this.document.getElementById(this.target());
    if (!main) return;
    event.preventDefault();
    // A <main> is not focusable by default; -1 lets script focus it without adding a tab stop.
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    main.focus();
    main.scrollIntoView?.({ block: 'start' });
  }
}
```

## WorkflowHeaderComponent

Focused transaction/workflow header with back navigation.

### frontend-angular/src/app/shared/layouts/workflow-header.component.ts

```ts
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService } from '@core/i18n/locale.service';
import { BrandMarkComponent } from '@shared/components/brand-mark.component';
import { LangToggleComponent } from '@shared/components/lang-toggle.component';
import { ThemeToggleComponent } from '@shared/components/theme-toggle.component';
import { DashboardRole } from '@features/dashboards/models/dashboard';
import { AccountMenuComponent } from '@features/navigation/pages/account-menu.component';

/**
 * The narrow header used by single-purpose pages: brand, one breadcrumb, and the
 * two preference toggles. Policies, About and the checkout flow each carried
 * their own copy of it.
 */
@Component({
  selector: 'tf-workflow-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AccountMenuComponent, BrandMarkComponent, LangToggleComponent, ThemeToggleComponent],
  template: `
    <header class="tf-workflow-header">
      <div class="tf-shell tf-workflow-header__inner">
        <a class="tf-workflow-header__brand" routerLink="/" [attr.aria-label]="locale.t('nav_home', 'Tafseel home')">
          <tf-brand-mark [width]="18" [height]="24" />
        </a>
        @if (crumb(); as text) {
          <span class="tf-workflow-header__crumb">/ {{ text }}</span>
        }
        <div class="tf-workflow-header__actions">
          <!-- A signed-in person keeps their way home and out (UX-53): the application is long, and people leave mid-way. -->
          @if (role(); as r) { <tf-account-menu [role]="r" /> }
          <tf-lang-toggle />
          <tf-theme-toggle />
        </div>
      </div>
    </header>
  `,
  styles: `:host { display: contents; }`
})
export class WorkflowHeaderComponent {
  readonly locale = inject(LocaleService);
  readonly crumb = input<string>('');
  /** Shown to a signed-in person on a single-purpose page, for the account menu. */
  readonly role = input<DashboardRole | null>(null);
}
```

## WorkspaceShellComponent

Authenticated role workspace with navigation and account controls.

### frontend-angular/src/app/shared/layouts/workspace-shell.component.ts

```ts
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { LocaleService } from '@core/i18n/locale.service';
import { DASHBOARDS, DashboardRole } from '@features/dashboards/models/dashboard';
import { AccountMenuComponent } from '@features/navigation/pages/account-menu.component';
import { NotificationBellComponent } from '@features/navigation/pages/notification-bell.component';
import { WorkspaceNavComponent } from '@features/navigation/pages/workspace-nav.component';
import { UnreadMessages } from '@features/navigation/services/unread-messages';
import { BrandMarkComponent } from '@shared/components/brand-mark.component';
import { LangToggleComponent } from '@shared/components/lang-toggle.component';
import { ThemeToggleComponent } from '@shared/components/theme-toggle.component';
import { SkipLinkComponent } from './skip-link.component';

/**
 * The frame of a role workspace screen that is not the generic dashboard: the same
 * sections in the sidebar (from `DASHBOARDS`, so both kinds of screen list the same
 * places), a title bar, and the page in the middle. It is the design system's
 * dashboard shell (`tf-dashboard-shell`, `tf-dash-*`), including its mobile drawer.
 */
@Component({
  selector: 'tf-workspace-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeDrawer()' },
  imports: [RouterLink, AccountMenuComponent, BrandMarkComponent, LangToggleComponent, NotificationBellComponent,
    ThemeToggleComponent, WorkspaceNavComponent, SkipLinkComponent],
  template: `
    <tf-skip-link target="main-content" />
    <div class="tf-dashboard-shell" data-stack="app">
      <aside class="tf-dash-sidebar" id="workspace-navigation" [attr.data-drawer]="drawer() ? 'open' : 'closed'">
        <a routerLink="/" class="tf-dash-brand" aria-label="Tafseel"><tf-brand-mark [width]="25" [height]="34" /></a>
        <tf-workspace-nav [role]="role()" (navigated)="drawer.set(false)" />
      </aside>
      <button type="button" [attr.data-drawer-overlay]="drawer() ? 'open' : 'closed'"
              (click)="drawer.set(false)" [attr.aria-label]="t('common_close_navigation', 'Close navigation')"></button>
      <div data-dash-main>
        <header class="tf-dash-header" data-dash-header>
          <button type="button" class="tf-dash-header__icon tf-dash-header__menu" data-drawer-toggle (click)="drawer.set(!drawer())"
                  aria-controls="workspace-navigation" [attr.aria-expanded]="drawer()" [attr.aria-label]="t('common_open_navigation', 'Open navigation')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            @if (unread.count() > 0) { <span class="tf-menu-dot" data-testid="menu-unread-dot" aria-hidden="true"></span> }
          </button>
          <span class="tf-dash-header__title">{{ t(config().titleKey, config().title) }}</span>
          <div class="tf-dash-header__actions">
            <tf-notification-bell /><tf-account-menu [role]="role()" /><tf-lang-toggle /><tf-theme-toggle />
          </div>
        </header>
        <main class="tf-workspace-content" id="main-content"><ng-content /></main>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    /* On a phone the navigation is folded away; the dot says a message is waiting inside it (UX-71). */
    .tf-dash-header__menu { position: relative; }
    .tf-menu-dot { position: absolute; top: 8px; inset-inline-end: 8px; width: 9px; height: 9px; border-radius: 50%;
      background: var(--primary); box-shadow: 0 0 0 2px var(--surface, #fff); }
    .tf-workspace-content { box-sizing: border-box; width: 100%; max-width: calc(var(--container-dashboard, 1200px) + 80px); margin-inline: auto; padding: 36px 40px 72px; }
    @media (max-width: 1100px) { .tf-workspace-content { padding: 28px 28px 64px; } }
    @media (max-width: 720px) { .tf-workspace-content { padding: 20px 16px 48px; } }
  `
})
export class WorkspaceShellComponent {
  readonly role = input.required<DashboardRole>();
  /** The sidebar section this screen belongs to. */
  readonly section = input.required<string>();
  readonly session = inject(SESSION_STORE);
  private readonly locale = inject(LocaleService);
  readonly config = computed(() => DASHBOARDS[this.role()]);
  readonly drawer = signal(false);
  readonly unread = inject(UnreadMessages);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }

  /** Escape closes the phone drawer, as a person expects of anything laid over the page, and gives focus back to its toggle. */
  closeDrawer(): void {
    if (!this.drawer()) return;
    this.drawer.set(false);
    this.host.nativeElement.querySelector<HTMLElement>('[data-drawer-toggle]')?.focus();
  }
}
```

## WorkspaceNavComponent

Shared role sidebar navigation used by all workspace shells.

### frontend-angular/src/app/features/navigation/pages/workspace-nav.component.ts

```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Event } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { LocaleService } from '@core/i18n/locale.service';
import { DashboardRole } from '@features/dashboards/models/dashboard';
import { IconComponent } from '@shared/components/icon.component';
import { NAV_GROUP_STARTS, NAV_ICONS, NavDestination, NavGroupLabel, PRIMARY_NAV, activeChild, activeKey } from '../models/primary-nav';
import { UnreadMessages } from '../services/unread-messages';

interface NavRow { readonly item: NavDestination; readonly group: NavGroupLabel | null }

/**
 * The primary navigation list (UX-03), shared by both workspace shells so a person sees the same
 * destinations wherever they are. The active destination is decided by the route, explicitly: an order
 * opened from a notification still belongs to the list it came from.
 *
 * Visually each destination carries its icon, and related destinations sit under a quiet group label; the
 * order and the destinations themselves are Gate 2's and do not change here.
 */
@Component({
  selector: 'tf-workspace-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <nav class="tf-dash-nav" [attr.aria-label]="t('dashboard_navigation', 'Dashboard navigation')" data-testid="primary-nav">
      <div class="tf-dash-nav-group">
        @for (row of rows(); track row.item.key) {
          @if (row.group) { <p class="tf-dash-nav-group-label" aria-hidden="true">{{ t(row.group.labelKey, row.group.fallback) }}</p> }
          <a class="tf-dash-nav-item" data-testid="nav-item" [attr.data-nav]="row.item.key"
             [routerLink]="row.item.path" [queryParams]="row.item.query ?? null" (click)="navigated.emit()"
             [attr.aria-current]="row.item.key === active() ? 'page' : null">
            <span class="tf-dash-nav-ico-wrap"><tf-icon [name]="icon(row.item.key)" [size]="18" /></span>
            <span class="tf-dash-nav-text">{{ t(row.item.labelKey, row.item.fallback) }}</span>
            @if (row.item.key === 'messages' && unread.count() > 0) {
              <!-- Re-created when the number changes, so the count gives one small pulse, not a loop. -->
              @for (n of [unread.count()]; track n) {
                <span class="tf-nav-count" data-testid="nav-unread-messages">{{ n > 99 ? '99+' : n }}<span class="tf-sr-only">{{ ' ' + t('nav_unread_messages', 'unread') }}</span></span>
              }
            }
          </a>
          @if (row.item.children?.length && row.item.key === active()) {
            <div class="tf-dash-subnav" data-testid="nav-children">
              @for (sub of row.item.children; track sub.key) {
                <a class="tf-dash-subnav-item" data-testid="nav-child" [attr.data-nav]="sub.key"
                   [routerLink]="sub.path" (click)="navigated.emit()"
                   [attr.aria-current]="sub.key === child() ? 'page' : null">{{ t(sub.labelKey, sub.fallback) }}</a>
              }
            </div>
          }
        }
      </div>
    </nav>
  `,
  styles: `
    /* The drawer is how a phone navigates, so every destination is a 44px target (UX-03 AC9). */
    .tf-dash-nav-item { min-height: 44px; }
    .tf-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `
})
export class WorkspaceNavComponent {
  readonly role = input.required<DashboardRole>();
  /** Raised when a destination is chosen, so a mobile drawer can close itself. */
  readonly navigated = output<void>();

  private readonly locale = inject(LocaleService);
  private readonly router = inject(Router);
  readonly unread = inject(UnreadMessages);
  private readonly url = toSignal(this.router.events.pipe(
    filter((event: Event): event is NavigationEnd => event instanceof NavigationEnd),
    map(event => event.urlAfterRedirects),
    startWith(this.router.url)
  ), { initialValue: this.router.url });

  readonly destinations = computed<readonly NavDestination[]>(() => PRIMARY_NAV[this.role()]);
  readonly rows = computed<readonly NavRow[]>(() => {
    const starts = NAV_GROUP_STARTS[this.role()];
    return this.destinations().map(item => ({ item, group: starts[item.key] ?? null }));
  });
  readonly active = computed(() => activeKey(this.role(), this.url()));
  readonly child = computed(() => activeChild(this.role(), this.url()));

  constructor() {
    effect(() => {
      this.url();
      if (PRIMARY_NAV[this.role()].some(item => item.key === 'messages')) void untracked(() => this.unread.refresh());
    });
  }

  icon(key: string) { return NAV_ICONS[key] ?? 'home'; }
  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
}
```

## AccountMenuComponent

Shared account navigation/popover used by workspace and focused headers.

### frontend-angular/src/app/features/navigation/pages/account-menu.component.ts

```ts
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { LogOut } from '@core/auth/services/log-out.use-case';
import { LocaleService } from '@core/i18n/locale.service';
import { DashboardRole } from '@features/dashboards/models/dashboard';

/**
 * The account menu (UX-03): where settings went when they stopped being a primary destination. It adds no
 * account capability — it gathers the destinations each role already had.
 */
@Component({
  selector: 'tf-account-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="tf-account">
      <button type="button" class="tf-dash-header__icon" data-testid="account-menu-toggle"
              [attr.aria-expanded]="open()" aria-haspopup="menu"
              [attr.aria-label]="t('nav_account_menu', 'My account')" (click)="open.set(!open())">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0" />
        </svg>
      </button>
      @if (open()) {
        <div class="tf-account-menu" animate.enter="tf-popover-enter" animate.leave="tf-popover-leave" [attr.inert]="!open() ? '' : null" role="menu" data-testid="account-menu">
          <p class="tf-account-name">{{ session.current()?.fullName }}</p>
          @if (settingsPath(); as path) {
            <a role="menuitem" data-testid="account-settings" [routerLink]="path" (click)="open.set(false)">{{
              t('nav_account_menu', 'My account') }}</a>
          }
          @if (role() === 'Teacher' && session.current()?.userId; as id) {
            <a role="menuitem" data-testid="account-public-profile" [routerLink]="['/teachers', id]" (click)="open.set(false)">{{
              t('nav_public_profile', 'View my public profile') }}</a>
          }
          <!-- Help and reports: everyone can reach it. A paid purchase is sent on to its dispute from there. -->
          <a role="menuitem" data-testid="account-report-problem" routerLink="/help" (click)="open.set(false)">{{
            t('nav_help_reports', 'Help and reports') }}</a>
          <button type="button" class="tf-account-sign-out" role="menuitem" data-testid="account-sign-out" (click)="signOut()">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4m4-4H9" /></svg>
            <span>{{ t('nav_sign_out', 'Sign out') }}</span>
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .tf-account { position: relative; display: inline-flex; }
    .tf-account-menu { position: absolute; inset-block-start: calc(100% + 8px); inset-inline-end: 0; z-index: 40;
      min-width: 220px; padding: 8px; display: grid; gap: 2px; border: 1px solid var(--edge-overlay);
      border-radius: var(--r-md); background: var(--surface); box-shadow: var(--overlay-shadow); }
    .tf-account-name { margin: 0; padding: 6px 10px; font-weight: 700; }
    .tf-account-menu a, .tf-account-menu button { display: flex; align-items: center; min-height: 44px; padding: 8px 10px;
      border: 0; border-radius: var(--r-sm); background: none; text-align: start; text-decoration: none; color: inherit;
      font: inherit; cursor: pointer; }
    @media (hover:hover) and (pointer:fine){.tf-account-menu a:hover,.tf-account-menu button:hover { background: var(--surface-2, rgba(0,0,0,.04)); } }
    .tf-account-menu .tf-account-sign-out { gap: 10px; margin-block-start: 6px; border-block-start: 1px solid var(--border); border-radius: 0 0 var(--r-sm) var(--r-sm); color: var(--danger); font-weight: 750; }
    .tf-account-sign-out svg { inline-size: 20px; block-size: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    @media (hover:hover) and (pointer:fine){.tf-account-menu .tf-account-sign-out:hover { background: var(--danger-soft); } }
    .tf-account-menu .tf-account-sign-out:focus-visible { outline: 2px solid var(--danger); outline-offset: 2px; }
  `
})
export class AccountMenuComponent {
  readonly role = input.required<DashboardRole>();
  readonly session = inject(SESSION_STORE);
  private readonly locale = inject(LocaleService);
  // Resolved only when someone actually signs out: rendering a menu should not need the session
  // machinery, and every screen that shows this header would otherwise have to provide it.
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);

  readonly open = signal(false);

  /** PRODUCT-P1: every role, Admin and Finance included, manages their own account on one page. */
  readonly settingsPath = computed(() => '/account');

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }

  async signOut(): Promise<void> {
    this.open.set(false);
    await this.injector.get(LogOut).execute();
    await this.router.navigateByUrl('/auth');
  }
}
```

## NotificationBellComponent

Shared notification navigation and unread count control.

### frontend-angular/src/app/features/navigation/pages/notification-bell.component.ts

```ts
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { Dashboard } from '@features/dashboards/models/dashboard';
import { IconComponent, IconName } from '@shared/components/icon.component';
import { NOTIFICATION_UNKNOWN, notificationCopy } from '@shared/vocabulary/status-vocabulary';
import { Notification, NotificationsGateway } from '../services/notifications.gateway';

/**
 * The notifications bell (UX-03): the one place notifications live, now that they are not a primary
 * destination. The dot only says there is something unread on the first page — no exact count is claimed
 * for a number the server was never asked for.
 *
 * A row reads as Tafseel's own sentence for its type (`UX-04`), never the server's English title, and
 * follows its link through the existing safe-link guard, so a stored link can never send the reader off
 * this site.
 */
@Component({
  selector: 'tf-notification-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgTemplateOutlet, IconComponent],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <div class="tf-bell">
      <button #trigger type="button" class="tf-dash-header__icon" data-testid="notification-bell"
              [attr.aria-expanded]="open()" aria-controls="notification-panel"
              [attr.aria-label]="t('nav_notifications', 'Notifications')" (click)="toggle()">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3a5 5 0 0 0-5 5v3l-1.5 3h13L17 11V8a5 5 0 0 0-5-5zM10 19a2 2 0 0 0 4 0" />
        </svg>
        @if (unread()) {
          <span class="tf-bell-dot" data-testid="notification-dot"
                [attr.aria-label]="t('nav_unread', 'Unread notifications')"></span>
        }
      </button>
      @if (open()) {
        <div id="notification-panel" class="tf-bell-panel" animate.enter="tf-popover-enter" animate.leave="tf-popover-leave" [attr.inert]="!open() ? '' : null" role="region" data-testid="notification-panel"
             [attr.aria-label]="t('nav_notifications', 'Notifications')">
          <header class="tf-bell-panel__head">
            <h2 class="tf-bell-panel__title">{{ t('nav_notifications', 'Notifications') }}</h2>
            <div class="tf-bell-panel__actions">
              @if (items().length && unread()) {
                <button type="button" class="tf-button tf-button-ghost tf-button-sm" data-testid="notification-mark-all"
                        (click)="markAll()">{{ t('nav_mark_all_read', 'Mark all as read') }}</button>
              }
              <button type="button" class="tf-icon-btn tf-icon-btn-quiet tf-bell-panel__close"
                      [attr.aria-label]="t('close', 'Close')" (click)="close()">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
          </header>
          <!-- Read after an unread row's own sentence by screen readers; never shown, never part of the row's text. -->
          <span id="tf-bell-unread-note" hidden>{{ t('nav_unread_one', 'Unread') }}</span>
          @if (feedback(); as message) {
            <p class="tf-bell-feedback" role="status" aria-live="polite" data-testid="notification-feedback">{{ message }}</p>
          }
          @if (error()) {
            <div class="tf-bell-state" role="alert" data-testid="notification-error">
              <p>{{ t('nav_notifications_error', 'We couldn’t load your notifications.') }}</p>
              <button type="button" class="tf-button tf-button-secondary tf-button-sm" (click)="load()">{{ t('common_retry', 'Retry') }}</button>
            </div>
          } @else if (!items().length) {
            <div class="tf-bell-state" data-testid="notification-empty">
              <span class="tf-bell-state__icon" aria-hidden="true"><tf-icon name="bell" [size]="20" /></span>
              <p>{{ t('nav_notifications_empty', 'No notifications') }}</p>
            </div>
          } @else {
            <ul class="tf-bell-list">
              @for (item of items(); track item.id) {
                <li class="tf-bell-row" [class.is-unread]="!item.read" data-testid="notification-row">
                  @if (routeOf(item); as route) {
                    <a class="tf-bell-row__hit" [routerLink]="route.path" [queryParams]="route.query" (click)="openRow(item)"
                       [attr.aria-describedby]="item.read ? null : 'tf-bell-unread-note'">
                      <ng-container *ngTemplateOutlet="row; context: { $implicit: item }" />
                    </a>
                  } @else if (legacyHrefOf(item); as href) {
                    <!-- A link stored before the move to Angular (/app/*.dc.html): relative to the
                         locale's <base href>, the host redirects it to its Angular screen. -->
                    <a class="tf-bell-row__hit" [attr.href]="href" (click)="openRow(item)"
                       [attr.aria-describedby]="item.read ? null : 'tf-bell-unread-note'">
                      <ng-container *ngTemplateOutlet="row; context: { $implicit: item }" />
                    </a>
                  } @else {
                    <button type="button" class="tf-bell-row__hit" (click)="openRow(item)"
                            [attr.aria-describedby]="item.read ? null : 'tf-bell-unread-note'">
                      <ng-container *ngTemplateOutlet="row; context: { $implicit: item }" />
                    </button>
                  }
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>
    <ng-template #row let-item>
      <span class="tf-bell-row__icon" aria-hidden="true"><tf-icon [name]="iconOf(item)" [size]="18" /></span>
      <span class="tf-bell-row__text">
        <span class="tf-bell-row__message">{{ say(item) }}</span>
        <small class="tf-bell-row__time">{{ when(item) }}</small>
      </span>
      <span class="tf-bell-row__dot" aria-hidden="true"></span>
    </ng-template>
  `,
  styles: `
    .tf-bell { position: relative; display: inline-flex; }
    .tf-bell-dot { position: absolute; inset-block-start: 8px; inset-inline-end: 8px; width: 8px; height: 8px;
      border-radius: 50%; background: var(--error); box-shadow: 0 0 0 2px var(--surface); }

    .tf-bell-panel { position: absolute; inset-block-start: calc(100% + var(--space-2)); inset-inline-end: 0; z-index: 40;
      width: min(400px, calc(100vw - 24px)); max-height: min(560px, calc(100dvh - 88px)); overflow: hidden;
      display: flex; flex-direction: column; border: 1px solid var(--edge-overlay); border-radius: var(--r-lg);
      background: var(--surface); box-shadow: var(--overlay-shadow); }
    .tf-bell-panel__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
      min-height: 60px; padding-block: var(--space-2); padding-inline: var(--space-5) var(--space-2);
      border-block-end: 1px solid var(--border); flex: none; }
    .tf-bell-panel__title { margin: 0; font-size: var(--type-item-title-size); font-weight: 800; line-height: 1.3; }
    .tf-bell-panel__actions { display: flex; align-items: center; gap: var(--space-1); }
    .tf-bell-panel__actions .tf-button { color: var(--primary); border-color: transparent; }
    @media (hover:hover) and (pointer:fine){.tf-bell-panel__actions .tf-button:hover { border-color: var(--border); } }
    .tf-bell-panel__close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }

    .tf-bell-list { list-style: none; margin: 0; padding: var(--space-2); overflow-y: auto; min-height: 0;
      overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }
    .tf-bell-list::-webkit-scrollbar { width: 6px; }
    .tf-bell-list::-webkit-scrollbar-thumb { background: var(--border-strong); border: 0; border-radius: 999px; }
    .tf-bell-list::-webkit-scrollbar-track { background: transparent; }
    /* Rows are separated by a rule, not one shared background, so twenty rows never read as one block. */
    .tf-bell-row + .tf-bell-row { border-block-start: 1px solid var(--border); }
    .tf-bell-row__hit { display: grid; grid-template-columns: 34px minmax(0, 1fr) 8px; align-items: start; gap: var(--space-3);
      width: 100%; min-height: 56px; margin-block: 2px; padding: var(--space-3); border: 0; border-radius: var(--r-sm);
      background: transparent; text-align: start; text-decoration: none; color: inherit; font: inherit; cursor: pointer;
      transition: background var(--t); }
    @media (hover:hover) and (pointer:fine){.tf-bell-row__hit:hover { background: var(--surface-2); } }
    .tf-bell-row__hit:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; background: var(--surface-2); }
    .tf-bell-row__icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: var(--r-sm);
      background: var(--surface-2); color: var(--text-2); }
    .tf-bell-row__text { display: grid; gap: 3px; min-width: 0; }
    .tf-bell-row__message { font-size: var(--type-body-sm-size); line-height: 1.45; font-weight: 500; color: var(--text-2); overflow-wrap: anywhere; }
    .tf-bell-row__time { font-size: var(--type-meta-size); line-height: 1.4; color: var(--text-2); }
    .tf-bell-row__dot { width: 8px; height: 8px; margin-block-start: 7px; border-radius: 50%; }
    /* Unread: the sentence in full weight and ink, the kind in the brand tint, and a dot at the end. */
    .tf-bell-row.is-unread .tf-bell-row__message { font-weight: 700; color: var(--text); }
    .tf-bell-row.is-unread .tf-bell-row__icon { background: var(--primary-soft); color: var(--primary); }
    .tf-bell-row.is-unread .tf-bell-row__dot { background: var(--primary); }

    .tf-bell-state { display: grid; justify-items: center; gap: var(--space-3); margin: 0; padding: var(--space-8) var(--space-5);
      text-align: center; color: var(--text-2); font-size: var(--type-body-sm-size); }
    .tf-bell-state p { margin: 0; }
    .tf-bell-feedback { margin: 0 var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid color-mix(in oklab, var(--primary) 34%, var(--border));
      border-radius: var(--r-sm); background: var(--primary-soft); color: var(--text); font-size: var(--type-meta-size); line-height: 1.45; }
    .tf-bell-state__icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%;
      background: var(--surface-2); color: var(--text-2); }

    @media (max-width: 480px) {
      .tf-bell-panel { position: fixed; inset-inline: var(--space-3); inset-block-start: 64px; width: auto;
        max-height: min(72dvh, 560px); }
      .tf-bell-panel__actions .tf-button { min-height: 44px; }
    }
    @media (prefers-reduced-motion: reduce) { .tf-bell-row__hit { transition: none; } }
  `
})
export class NotificationBellComponent {
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly gateway = inject(NotificationsGateway);
  private readonly fmt = inject(FormatService);
  private readonly locale = inject(LocaleService);

  readonly open = signal(false);
  readonly error = signal(false);
  readonly feedback = signal('');
  readonly items = signal<readonly Notification[]>([]);
  readonly unread = computed(() => this.items().some(item => !item.read));

  constructor() { void this.load(); }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }

  async toggle(): Promise<void> {
    if (this.open()) { this.feedback.set(''); this.close(); return; }
    this.open.set(true);
    await this.load();
  }

  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.trigger()?.nativeElement.focus();
  }

  async load(): Promise<void> {
    this.error.set(false);
    this.feedback.set('');
    try {
      this.items.set(await firstValueFrom(this.gateway.latest()));
    } catch {
      this.error.set(true);
      this.items.set([]);
    }
  }

  /** Tafseel's own sentence for the type; the English server title is never shown in Arabic (UX-04). */
  say(item: Notification): string {
    const copy = notificationCopy(item.type);
    if (copy) return this.t(copy.labelKey, copy.fallback);
    if (this.locale.lang() === 'en' && item.title) return item.title;
    return this.t(NOTIFICATION_UNKNOWN.labelKey, NOTIFICATION_UNKNOWN.fallback);
  }

  when(item: Notification): string { return this.fmt.relative(item.createdAt); }

  /** A glyph per kind of update, so a long list scans by subject before it is read. Presentation only. */
  iconOf(item: Notification): IconName {
    const type = item.type;
    if (/Message|Clarification/.test(type)) return 'message';
    if (/^Session/.test(type)) return 'calendar';
    if (/Payment|Refund|Withdrawal|Finance/.test(type)) return 'wallet';
    if (/Review/.test(type)) return 'star';
    if (/Dispute/.test(type)) return 'flag';
    if (/Application|Qualification|Profile|Showcase/.test(type)) return 'teacher';
    if (/Support|AccountStatus/.test(type)) return 'inbox';
    if (/Request|Offer|Order|Delivery|Work|Revision/.test(type)) return 'briefcase';
    return 'bell';
  }

  /** Only a path on this site is followed — the existing notification link guard decides. */
  routeOf(item: Notification): { path: string; query: Readonly<Record<string, string>> } | null {
    const action = Dashboard.notificationAction(item.link);
    return action?.kind === 'route' ? { path: action.path, query: action.query } : null;
  }

  /** A stored `/app/...` address; the host's LegacyLinks redirect knows where it lives now. */
  legacyHrefOf(item: Notification): string | null {
    const action = Dashboard.notificationAction(item.link);
    return action?.kind === 'legacy' ? action.href : null;
  }

  async openRow(item: Notification): Promise<void> {
    const hasDestination = this.routeOf(item) !== null || this.legacyHrefOf(item) !== null;
    if (hasDestination) this.open.set(false);
    if (!item.read) {
      this.items.set(this.items().map(row => (row.id === item.id ? { ...row, read: true } : row)));
      try { await firstValueFrom(this.gateway.markRead(item.id)); } catch { /* reading is not the point of the tap */ }
    }
    if (!hasDestination) this.feedback.set(this.t('nav_notification_read', 'Notification marked as read.'));
  }

  async markAll(): Promise<void> {
    this.items.set(this.items().map(row => ({ ...row, read: true })));
    try {
      await firstValueFrom(this.gateway.markAllRead());
      this.feedback.set(this.t('nav_notifications_marked', 'All notifications marked as read.'));
    } catch { await this.load(); }
  }
}
```
