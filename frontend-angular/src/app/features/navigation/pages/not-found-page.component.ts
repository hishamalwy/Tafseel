import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkflowHeaderComponent } from '@shared/layouts/workflow-header.component';
import { SkipLinkComponent } from '@shared/layouts/skip-link.component';

/**
 * Any address the app does not know. It says so, keeps the reader in their language, and
 * offers the two places most people were heading. Without it an unknown path rendered an
 * empty shell.
 */
@Component({
  selector: 'tf-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, WorkflowHeaderComponent, SkipLinkComponent],
  template: `
    <tf-skip-link />
    <tf-workflow-header />
    <main id="main" class="tf-shell tf-not-found" data-testid="not-found">
      <p class="tf-not-found__code" aria-hidden="true">404</p>
      <h1>{{ t('not_found_title', 'We couldn’t find that page') }}</h1>
      <p>{{ t('not_found_body', 'The link may be old, or the page may have moved.') }}</p>
      <p class="tf-not-found__path" dir="ltr"><code>{{ path }}</code></p>
      <nav class="tf-not-found__actions">
        <a class="tf-button" routerLink="/">{{ t('not_found_home', 'Go to the home page') }}</a>
        <a class="tf-button tf-button-secondary" routerLink="/teachers">{{ t('browse_title', 'Find your teacher') }}</a>
      </nav>
    </main>
  `,
  styles: `
    .tf-not-found { display: grid; gap: var(--s-2); justify-items: start; max-inline-size: 640px; margin-inline: auto; padding-block: var(--s-8); }
    .tf-not-found h1 { margin: 0; font-family: var(--font-display); font-size: var(--type-page-title-size); line-height: var(--type-page-title-line); }
    .tf-not-found p { margin: 0; color: var(--text-2); }
    .tf-not-found__code { font-family: var(--font-display); font-size: var(--type-display-size); line-height: 1; color: var(--primary); }
    .tf-not-found__path code { overflow-wrap: anywhere; }
    .tf-not-found__actions { display: flex; flex-wrap: wrap; gap: var(--s-1); }
  `
})
export class NotFoundPageComponent {
  readonly locale = inject(LocaleService);
  readonly path = inject(Router).url;

  constructor() {
    const title = inject(Title);
    queueMicrotask(() => title.setTitle(`${this.t('not_found_title', 'We couldn’t find that page')} — Tafseel`));
    inject(Meta).updateTag({ name: 'robots', content: 'noindex' });
  }

  t(key: string, fallback = ''): string {
    return this.locale.t(key, fallback);
  }
}
