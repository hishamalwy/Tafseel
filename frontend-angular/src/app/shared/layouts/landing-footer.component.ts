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
    post: this.t('nav_post_request', 'Post a Request'),
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
