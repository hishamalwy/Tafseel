import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';

/**
 * `prefers-reduced-motion`, as a signal.
 *
 * The landing page has three independent things that must stop moving when a
 * visitor asks for less motion — the rotating headline word, the story
 * autoplay, and the promo dialog's step transition — and the legacy page wired
 * a `matchMedia` listener plus its add/remove-listener fallbacks into the
 * component for each page that needed it. One media query, read by everyone.
 *
 * Defaults to "reduced" during SSR: a prerendered page that arrives already
 * animating would ignore the preference for the whole first paint.
 */
@Injectable({ providedIn: 'root' })
export class ReducedMotion {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly reduced = signal(true);

  /** True when animation should be suppressed. */
  readonly preferred = this.reduced.asReadonly();
  /** The common phrasing at call sites: "may I animate?" */
  readonly allowsMotion = computed(() => !this.reduced());

  constructor() {
    if (!this.isBrowser) return;
    const query = this.document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)');
    if (!query) {
      this.reduced.set(false);
      return;
    }
    this.reduced.set(query.matches);
    query.addEventListener('change', event => this.reduced.set(event.matches));
  }
}
