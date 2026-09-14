import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ABOUT_COPY } from '@features/about/content/about.content';
import { LocaleService } from '@core/i18n/locale.service';
import { PublicHeaderComponent } from '@shared/layouts/public-header.component';
import { LandingFooterComponent } from '@shared/layouts/landing-footer.component';
import { SkipLinkComponent } from '@shared/layouts/skip-link.component';

/** The About page — ported from `Tafseel-About.dc.html`. */
@Component({
  selector: 'tf-about-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicHeaderComponent, LandingFooterComponent, SkipLinkComponent],
  templateUrl: './about-page.component.html'
})
export class AboutPageComponent {
  private readonly title = inject(Title);
  readonly locale = inject(LocaleService);

  readonly c = computed(() => ABOUT_COPY[this.locale.lang()]);

  readonly footerCopy = computed(() => ({
    statement: this.c().footStatement,
    tagline: this.c().footTag,
    rights: this.c().footRights,
    origin: this.c().footOrigin
  }));

  constructor() {
    queueMicrotask(() => this.title.setTitle(`${this.c().heroTitle} — Tafseel`));
  }
}
