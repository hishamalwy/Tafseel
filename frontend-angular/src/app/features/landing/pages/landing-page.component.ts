import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, PLATFORM_ID, ViewEncapsulation, computed, effect, inject,
  signal, untracked, viewChild
} from '@angular/core';
import { ReducedMotion } from '@core/a11y/reduced-motion.service';
import { Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { ResolveLandingRoute } from '@core/auth/services/resolve-landing-route.use-case';
import { ToastService } from '@shared/services/toast.service';
import { ToastComponent } from '@shared/components/toast.component';
import { PriceComponent } from '@shared/components/price.component';
import { PublicHeaderComponent } from '@shared/layouts/public-header.component';
import { LandingFooterComponent } from '@shared/layouts/landing-footer.component';
import { SkipLinkComponent } from '@shared/layouts/skip-link.component';
import { StudentJourney } from '@shared/models/student-journey';
import {
  CatalogService, FeaturedSubject, FeaturedTeacher
} from '../models/featured';
import { JourneyOffer } from '../services/landing.ports';
import { Promotion } from '../models/promotion';
import {
  Campaigns, LandingContent, LoadLandingContent, LoadStudentJourney
} from '../services/landing.use-cases';
import { JourneyStripComponent } from '../components/journey-strip.component';
import { KingdomMapComponent } from '../components/kingdom-map.component';
import { LandingSpriteComponent } from '../components/landing-sprite.component';
import { ProductStoryComponent, StoryTeacher } from '../components/product-story.component';
import { PromoWizardComponent } from '../components/promo-wizard.component';
import {
  escrowSteps, landingCopy, scaleNote
} from '../content/landing.copy';

/** Long enough for the hero to paint before a dialog can cover it. */
const WIZARD_DELAY_MS = 700;
/** One escrow step after another, close enough to read as a single sequence. */
const ESCROW_STEP_MS = 220;

/**
 * The home page.
 *
 * Five public reads open it, each settling independently, plus one extra read
 * for a signed-in Student's own requests. The sections it composes are separate
 * components because each owns real behaviour — an autoplaying
 * chapter, a modal campaign — and folding them together is how the legacy page
 * ended up with a 460-line `renderVals` and fourteen timers on one class.
 *
 * What is *not* here is as deliberate: no invented rating, count, availability
 * or total. Where a figure has not arrived the page says so — the community orbs
 * retain a pending dash until counts are available. The active service catalogue is authoritative;
 * failure and an empty result never substitute a static marketing catalogue.
 */
@Component({
  selector: 'tf-landing-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, SkipLinkComponent, PublicHeaderComponent, LandingFooterComponent,
    LandingSpriteComponent, KingdomMapComponent,
    ProductStoryComponent, JourneyStripComponent, PromoWizardComponent,
    PriceComponent, ToastComponent
  ],
  templateUrl: './landing-page.component.html',
  styleUrls: ['./landing-page.component.css', './landing-global.css'],
  encapsulation: ViewEncapsulation.None
})
export class LandingPageComponent {
  private readonly loadContent = inject(LoadLandingContent);
  private readonly loadJourney = inject(LoadStudentJourney);
  private readonly campaigns = inject(Campaigns);
  private readonly store = inject(SignalSessionStore);
  private readonly landingRoute = inject(ResolveLandingRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly toasts = inject(ToastService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  private loadVersion = 0;
  private wizardTimer?: ReturnType<typeof setTimeout>;
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  /** Set once the visitor has started doing something; a dialog that opens after that interrupts them. */
  private engaged = false;

  @HostListener('document:keydown')
  @HostListener('document:pointerdown')
  @HostListener('document:scroll')
  markEngaged(): void { this.engaged = true; }

  private readonly content = signal<Partial<LandingContent>>({});
  private readonly journey = signal<StudentJourney | null>(null);
  private readonly selectedOffer = signal<JourneyOffer | null>(null);

  readonly query = signal('');
  readonly wizardPromotion = signal<Promotion | null>(null);

  private readonly isArabic = computed(() => this.locale.lang() === 'ar');
  readonly copy = computed(() => landingCopy(this.isArabic()));

  private readonly motion = inject(ReducedMotion);
  private readonly escrowRail = viewChild<ElementRef<HTMLElement>>('escrowRail');
  /** How many escrow steps have arrived; the rail's fill runs to the last of them. */
  readonly escrowReached = signal(0);
  readonly escrowFill = computed(() => {
    const total = this.escrow().length;
    return total > 1 ? Math.max(0, this.escrowReached() - 1) / (total - 1) : 1;
  });

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.wizardTimer));
    effect(() => this.title.setTitle(
      this.isArabic() ? 'تفصيل — التعليم، مفصّل عليك.' : 'Tafseel — Education, Tailored to You.'));
    void this.load();

    // The payment's path is told once, step by step, when the rail comes into view.
    // Reduced motion, the server render and a browser without an observer get every
    // step already arrived, so the words never wait on the motion.
    effect(onCleanup => {
      const rail = this.escrowRail()?.nativeElement;
      if (!rail) return;
      const total = untracked(() => this.escrow().length);
      if (!this.isBrowser || this.motion.preferred() || !('IntersectionObserver' in globalThis)) {
        this.escrowReached.set(total);
        return;
      }
      let timer: ReturnType<typeof setInterval> | undefined;
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        timer = setInterval(() => {
          this.escrowReached.update(n => Math.min(total, n + 1));
          if (this.escrowReached() >= total) clearInterval(timer);
        }, ESCROW_STEP_MS);
      }, { threshold: 0.35 });
      observer.observe(rail);
      onCleanup(() => { observer.disconnect(); clearInterval(timer); });
    });
  }

  // ---- session-derived ----

  private readonly roles = computed(() => this.store.roles());

  /**
   * "Become a Teacher" is a guest recruitment path, not an action for someone
   * who already holds a Tafseel role.
   */
  readonly showsTeacherJoin = computed(() => !this.store.isAuthenticated());
  readonly teacherJoinLink = computed(() => this.roles().includes('Teacher')
    ? { path: '/teach/apply', query: {} }
    : { path: '/auth', query: { mode: 'register', role: 'teacher' } });

  /**
   * Role-aware account actions. Until the session check resolves the page shows
   * the public Student path, which is both the common case and the correct guest
   * experience, so no call to action flashes into something else.
   */
  readonly heroAction = computed(() => {
    const copy = this.copy();
    const roles = this.roles();
    if (roles.includes('Teacher')) {
      return {
        primaryLabel: copy.teacherPrimary,
        primaryLink: '/teacher/opportunities',
        secondaryLabel: copy.teacherSecondary,
        secondaryLink: '/teacher',
        isPost: false,
        note: copy.teacherNote
      };
    }
    if (roles.includes('Admin') || roles.includes('Finance') || roles.includes('QualityReviewer')) {
      return {
        primaryLabel: copy.staffPrimary,
        primaryLink: this.landingRoute.homeFor(roles),
        secondaryLabel: '', secondaryLink: '', isPost: false, note: ''
      };
    }
    return {
      primaryLabel: copy.studentPrimary,
      primaryLink: '/requests/new/open',
      secondaryLabel: copy.studentSecondary,
      secondaryLink: '/teachers',
      isPost: true,
      note: copy.studentNote
    };
  });

  readonly heroActionsLabel = computed(() => this.heroAction().isPost
    ? this.locale.t('sd_request_route_question', 'Do you already know which teacher you want?')
    : this.copy().accountActions);

  /** Stable text, with a natural word boundary in both languages. */
  readonly headlineLabel = computed(() => {
    const copy = this.copy();
    return `${copy.heroLead} ${copy.heroPrefix} ${copy.heroFocus}`;
  });

  // ---- content ----

  readonly subjects = computed(() => (this.content()?.subjects ?? []).map(subject => ({
    id: subject.id,
    name: FeaturedSubject.name(subject, this.isArabic()),
    cta: this.locale.t('subj_cta', 'Find teachers')
  })));

  readonly subjectsLoading = computed(() => this.content().subjects === undefined);
  readonly subjectsFailed = computed(() =>
    !this.subjectsLoading() && this.content()?.subjects === null);
  readonly subjectsEmpty = computed(() =>
    !this.subjectsLoading() && !this.subjectsFailed() && this.subjects().length === 0);

  readonly teachersLoading = computed(() => this.content().teachers === undefined);
  readonly teachersFailed = computed(() =>
    !this.teachersLoading() && this.content()?.teachers === null);
  readonly teachersEmpty = computed(() =>
    !this.teachersLoading() && !this.teachersFailed() && this.teacherCards().length === 0);

  readonly contentRetrying = signal(false);

  retryContent(): void {
    if (this.contentRetrying()) return;
    this.contentRetrying.set(true);
    this.content.set({});
    void this.load().finally(() => this.contentRetrying.set(false));
  }

  /**
   * Composed only from fields `/teachers` returns. A missing value removes its
   * row rather than showing a placeholder, and several cards carry the same
   * visible call to action, so the accessible name says which teacher it leads
   * to.
   */
  readonly teacherCards = computed(() => {
    const ar = this.isArabic();
    const profileLabel = this.locale.t('compare_view_profile', 'View profile');
    return (this.content()?.teachers ?? []).map(teacher => ({
      id: teacher.id,
      name: teacher.name,
      avatar: this.fmt.avatarUrl(teacher.id, teacher.hasAvatar, null, 'teacher'),
      subject: FeaturedTeacher.subject(teacher, ar),
      headline: teacher.headline,
      qualified: teacher.qualified,
      qualifiedLabel: this.locale.t('trust_badge_qualified_on_tafseel', 'Qualified on Tafseel'),
      hasRating: FeaturedTeacher.hasRating(teacher),
      rating: FeaturedTeacher.hasRating(teacher)
        ? this.fmt.number(Number(teacher.rating),
            { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        : '',
      reviewsLabel: FeaturedTeacher.hasRating(teacher)
        ? `(${this.fmt.number(teacher.ratingCount)})` : '',
      topics: FeaturedTeacher.topics(teacher),
      deliveryLabel: teacher.deliveryHours
        ? this.locale.format('feat_delivery', { time: this.fmt.duration(teacher.deliveryHours) }, 'Delivery within {time}')
        : '',
      hasPrice: teacher.startingPrice != null,
      price: teacher.startingPrice,
      currency: teacher.currency,
      priceOnRequest: ar ? 'السعر عند الطلب' : 'Price on request',
      profileLabel,
      profileAria: `${profileLabel} — ${teacher.name}`
    }));
  });

  readonly fromLabel = computed(() => this.locale.t('common_from', 'From'));
  readonly topicsLabel = computed(() => this.locale.t('feat_topics_label', 'Also teaches'));

  readonly services = computed(() => {
    const ar = this.isArabic();
    const rows = this.content().services ?? [];
    // Subjects, services and pillars are sets, not steps: only the product story is numbered.
    return rows.map(service => ({
      name: CatalogService.name(service, ar),
      description: CatalogService.description(service, ar)
    }));
  });
  readonly servicesLoading = computed(() => this.content().services === undefined);
  readonly servicesFailed = computed(() => this.content().services === null);
  readonly servicesEmpty = computed(() => !this.servicesLoading() && !this.servicesFailed() && this.services().length === 0);

  readonly trustPillars = computed(() => [1, 2, 3].map(n => ({
    title: this.locale.t(`why_pillar${n}_t`, ''),
    body: this.locale.t(`why_pillar${n}_b`, '')
  })));

  readonly escrow = computed(() =>
    escrowSteps(this.isArabic()).map((text, i) => ({ n: this.fmt.number(i + 1), text })));

  /**
   * A total is a claim about the business; only confirmed counts are displayed.
   */
  readonly communityStats = computed(() => {
    const stats = this.content()?.stats ?? null;
    return ([
      { icon: 'tf-i-students', total: stats?.students ?? null, label: this.copy().orbStudents },
      { icon: 'tf-i-teacher-cap', total: stats?.teachers ?? null, label: this.copy().orbTeachers },
      { icon: 'tf-i-calendar', total: stats?.completedSessions ?? null, label: this.copy().orbSessions }
    ]).map(metric => {
      const value = metric.total === null ? '—' : this.fmt.number(metric.total);
      return {
        icon: metric.icon,
        label: metric.label,
        value,
        // The orb sizes its number down as the platform grows, so six figures
        // still clear the ring.
        len: value.length,
        countUp: metric.total === null ? '' : String(metric.total),
        pending: metric.total === null
      };
    });
  });

  readonly scaleNote = computed(() => {
    const subjects = this.content()?.stats?.subjects;
    return subjects == null ? '' : scaleNote(this.fmt.number(subjects), this.isArabic());
  });

  // ---- the story's featured teacher ----

  readonly storyTeacher = computed<StoryTeacher | null>(() => {
    const source = (this.content()?.teachers ?? []).find(t => t.qualified);
    if (!source) return null;
    const card = this.teacherCards().find(c => c.id === source.id);
    return {
      avatar: this.fmt.avatarUrl(source.id, source.hasAvatar, null, 'teacher'),
      name: source.name,
      subject: FeaturedTeacher.subject(source, this.isArabic()),
      rating: card?.hasRating ? `${card.rating} ★ ${card.reviewsLabel}` : '',
      delivery: card?.deliveryLabel ?? '',
      price: source.startingPrice != null
        ? this.fmt.money(source.startingPrice, source.currency) : ''
    };
  });

  // ---- the Student journey module ----

  readonly journeyValue = this.journey.asReadonly();
  readonly journeyOffer = this.selectedOffer.asReadonly();
  readonly showsJourney = computed(() => (this.journey()?.total ?? 0) > 0);

  // ---- footer ----

  readonly footerCopy = computed(() => ({
    statement: this.locale.t('foot_statement', 'An explanation that finally fits the way you learn.'),
    tagline: this.locale.t('foot_tag',
      'Personalized explanations from verified teachers.'),
    rights: this.locale.t('foot_rights', '© 2026 Tafseel. All rights reserved.'),
    origin: this.locale.t('foot_origin',
      'Tafseel — education, tailored to you.')
  }));

  // ---- actions ----

  search(event: Event): void {
    event.preventDefault();
    const text = this.query().trim();
    void this.router.navigate(['/teachers'], { queryParams: text ? { q: text } : {} });
  }

  onWizardClosed(): void {
    this.campaigns.dismiss(this.wizardPromotion(), this.liveIds());
    this.wizardPromotion.set(null);
  }

  onWizardClaimed(): void {
    const promotion = this.wizardPromotion();
    if (promotion) this.campaigns.claim(promotion, this.liveIds());
  }

  onCodeCopied(): void {
    this.toasts.show(this.copy().promoCopied);
  }

  private liveIds(): readonly string[] {
    return (this.content()?.promotions ?? []).map(p => p.id);
  }

  private async load(): Promise<void> {
    const version = ++this.loadVersion;
    const current = () => !this.destroyRef.destroyed && version === this.loadVersion;
    const journey = this.loadJourney.execute(this.roles()).then(result => {
      if (!current()) return;
      this.journey.set(result.journey);
      this.selectedOffer.set(result.selectedOffer);
    });
    const content = await this.loadContent.execute(section => {
      if (current()) this.content.update(previous => ({ ...previous, ...section }));
    });
    if (current()) {
      this.content.set(content);
      this.openWizardOnEntry(content.promotions);
    }
    await journey;
  }

  /**
   * The dialog opens on entry when an eligible campaign exists, after a short
   * delay so the page never appears behind something covering content the
   * visitor has not seen yet. A visitor who already closed a dialog this visit
   * is left alone unless a slot has been published since.
   */
  private openWizardOnEntry(promotions: readonly Promotion[]): void {
    if (!this.isBrowser) return;
    const promotion = this.campaigns.primary(promotions);
    if (!promotion || this.campaigns.coolingDown(promotions)) return;
    clearTimeout(this.wizardTimer);
    this.wizardTimer = setTimeout(() => {
      // Someone already typing a search or tapping a card is not shown the campaign now; it is not
      // recorded as seen either, so it can open on a later, quieter visit.
      if (this.engaged || this.destroyRef.destroyed) return;
      this.campaigns.record(promotion.id, 'seenAt');
      this.wizardPromotion.set(promotion);
    }, WIZARD_DELAY_MS);
  }
}
