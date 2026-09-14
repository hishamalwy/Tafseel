import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect,
  inject, input, signal, viewChild
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReducedMotion } from '@core/a11y/reduced-motion.service';
import { LocaleService } from '@core/i18n/locale.service';
import { FormatService } from '@core/i18n/format.service';
import { catalogueIndex } from '../models/featured';
import {
  STORY_DOC_LINES, STORY_FORMATS, landingCopy, storySteps
} from '../content/landing.copy';

/** The qualified teacher the third panel compares, when one is available. */
export interface StoryTeacher {
  readonly avatar: string;
  readonly name: string;
  readonly subject: string;
  readonly rating: string;
  readonly delivery: string;
  readonly price: string;
}

const STEP_COUNT = 4;
const AUTOPLAY_MS = 4200;
const VISIBLE_RATIO = 0.18;

/**
 * "How Tafseel works" — one interface canvas that changes state while four
 * narrative steps progress.
 *
 * The autoplay is scoped to the chapter itself: it runs only while the section
 * is on screen and the tab is visible, it stops for `prefers-reduced-motion`,
 * and choosing a step by hand stops it for good. It never intercepts or locks
 * scrolling, which is the reason this is a section that animates rather than a
 * scroll-jacked one.
 */
@Component({
  selector: 'tf-product-story',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './product-story.component.html',
  styles: `:host { display: contents; }`
})
export class ProductStoryComponent {
  private readonly locale = inject(LocaleService);
  private readonly motion = inject(ReducedMotion);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly fmt = inject(FormatService);

  readonly teacher = input<StoryTeacher | null>(null);

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('story');
  private readonly inView = signal(false);
  private readonly documentHidden = signal(false);
  /** Once a visitor picks a step, the section stops advancing on its own. */
  private readonly manual = signal(false);

  readonly step = signal(0);

  private readonly isArabic = computed(() => this.locale.lang() === 'ar');
  readonly copy = computed(() => landingCopy(this.isArabic()));
  readonly docLines = STORY_DOC_LINES;
  readonly formats = STORY_FORMATS;

  readonly steps = computed(() => storySteps(this.isArabic()).map((step, i) => ({
    ...step,
    rawIndex: i,
    index: catalogueIndex(i + 1, this.isArabic()),
    active: this.step() === i
  })));

  readonly canvasStatus = computed(() =>
    this.copy().storyStepPrefix + this.fmt.number(this.step() + 1) + this.copy().storyStepSuffix);

  readonly qualifiedLabel = computed(() =>
    this.locale.t('trust_badge_qualified_on_tafseel', 'Qualified on Tafseel'));

  constructor() {
    inject(DestroyRef);
    if (this.isBrowser) {
      this.watchVisibility();
      this.watchIntersection();
    }
    this.autoplay();
  }

  select(index: number): void {
    this.manual.set(true);
    this.step.set(Math.min(STEP_COUNT - 1, Math.max(0, index)));
  }

  /**
   * Advance only while the chapter is genuinely being read: on screen, tab in
   * the foreground, motion allowed, and not yet driven by hand.
   */
  private autoplay(): void {
    effect(onCleanup => {
      const running = this.inView() && !this.documentHidden()
        && !this.motion.preferred() && !this.manual();
      if (!running) return;
      const timer = setInterval(
        () => this.step.update(s => (s + 1) % STEP_COUNT), AUTOPLAY_MS);
      onCleanup(() => clearInterval(timer));
    });
  }

  private watchVisibility(): void {
    this.documentHidden.set(this.document.hidden);
    const onChange = () => this.documentHidden.set(this.document.hidden);
    this.document.addEventListener('visibilitychange', onChange);
    inject(DestroyRef).onDestroy(
      () => this.document.removeEventListener('visibilitychange', onChange));
  }

  private watchIntersection(): void {
    const destroyRef = inject(DestroyRef);
    effect(onCleanup => {
      const element = this.host().nativeElement;
      if (!('IntersectionObserver' in (this.document.defaultView ?? {}))) {
        // No observer: treat the section as always read rather than never.
        this.inView.set(true);
        return;
      }
      const observer = new IntersectionObserver(
        entries => this.inView.set(
          !!entries[0]?.isIntersecting && entries[0].intersectionRatio >= VISIBLE_RATIO),
        { threshold: [0, VISIBLE_RATIO, 0.45] });
      observer.observe(element);
      onCleanup(() => observer.disconnect());
    });
    destroyRef.onDestroy(() => this.inView.set(false));
  }
}
