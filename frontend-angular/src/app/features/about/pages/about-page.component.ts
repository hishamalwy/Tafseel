import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ABOUT_COPY } from '@features/about/content/about.content';
import { LocaleService } from '@core/i18n/locale.service';
import { SignalSessionStore } from '@core/auth/services/session.store';
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
  private readonly session = inject(SignalSessionStore);

  readonly c = computed(() => ABOUT_COPY[this.locale.lang()]);
  readonly showStudentCta = computed(() => !this.session.isAuthenticated() || this.session.roles().includes('Student'));
  readonly showTeacherCta = computed(() => !this.session.isAuthenticated() || this.session.roles().includes('Teacher'));
  readonly teacherJoinLink = computed(() => this.session.roles().includes('Teacher')
    ? { path: '/teach/apply', query: {} }
    : { path: '/auth', query: { mode: 'register', role: 'teacher' } });

  readonly footerCopy = computed(() => ({
    statement: this.c().footStatement,
    tagline: this.c().footTag,
    rights: this.c().footRights,
    origin: this.c().footOrigin
  }));

  constructor() {
    // The heading already carries the brand line, so it is the whole title.
    effect(() => this.title.setTitle(this.c().heroTitle));
  }
}
