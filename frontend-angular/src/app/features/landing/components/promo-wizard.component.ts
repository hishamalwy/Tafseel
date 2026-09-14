import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal,
  viewChild, effect, afterNextRender
} from '@angular/core';
import { ReducedMotion } from '@core/a11y/reduced-motion.service';
import { LocaleService } from '@core/i18n/locale.service';
import { FormatService } from '@core/i18n/format.service';
import { Promotion } from '../models/promotion';
import { landingCopy } from '../content/landing.copy';

/** How long the exit transition runs; must match the CSS. */
const LEAVE_MS = 180;

/**
 * The entry dialog for an admin-published campaign.
 *
 * One slot at a time, not a Next/Next/Next stack: the published slots arrive in
 * display order and the first the visitor has not dismissed or claimed is the
 * one that presents itself. The rest stay on the Offers surface rather than
 * queueing behind this.
 *
 * Closing is deliberately a two-phase move — `leaving` first so the exit
 * animation can run, then the parent is told. Focus goes to the dialog itself
 * rather than its button, so keyboard and screen-reader users land inside the
 * wizard and a mouse visitor is not met by a control that already looks pressed.
 */
@Component({
  selector: 'tf-promo-wizard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './promo-wizard.component.html',
  styles: `:host { display: contents; }`,
  host: { '(document:keydown.escape)': 'close()' }
})
export class PromoWizardComponent {
  private readonly locale = inject(LocaleService);
  private readonly document = inject(DOCUMENT);
  private readonly motion = inject(ReducedMotion);
  readonly fmt = inject(FormatService);

  readonly promotion = input.required<Promotion>();

  readonly closed = output<void>();
  readonly claimed = output<void>();
  readonly codeCopied = output<string>();

  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  readonly leaving = signal(false);

  private readonly isArabic = computed(() => this.locale.lang() === 'ar');
  readonly copy = computed(() => landingCopy(this.isArabic()));

  readonly kind = computed(() => Promotion.kind(this.promotion()));
  readonly eyebrow = computed(() => this.text('eyebrow'));
  readonly title = computed(() => this.text('title'));
  readonly body = computed(() => this.text('body'));
  readonly highlight = computed(() => this.text('highlight'));
  readonly ctaLabel = computed(() => this.text('ctaLabel'));
  readonly code = computed(() => this.promotion().couponCode);

  readonly lead = computed(() => Promotion.lead(this.promotion(), this.isArabic()));
  readonly showsCta = computed(() => Promotion.showsCallToAction(this.promotion(), this.isArabic()));
  readonly href = computed(() => this.promotion().ctaHref || '/teachers');

  /**
   * The clock is recomputed from a ticking signal rather than a timer that
   * re-renders the page: minute resolution is all a countdown of hours or days
   * can honestly claim, and a per-second tick would redraw the landing page 60
   * times a minute for no visible gain.
   */
  private readonly minuteTick = signal(0);
  readonly countdown = computed(() => {
    this.minuteTick();
    const parts = Promotion.countdown(this.promotion(), Date.now());
    if (!parts) return null;
    return [
      { value: this.fmt.number(parts.days), label: this.copy().promoDays },
      { value: this.fmt.number(parts.hours), label: this.copy().promoHours },
      { value: this.fmt.number(parts.minutes), label: this.copy().promoMinutes }
    ];
  });

  readonly endsAt = computed(() => Promotion.endsAt(this.promotion()));
  readonly dateDay = computed(() => {
    const ends = this.endsAt();
    return ends ? this.fmt.number(ends.getDate()) : '';
  });
  readonly dateMonth = computed(() => {
    const ends = this.endsAt();
    return ends ? this.fmt.date(ends, { month: 'short' }) : '';
  });

  readonly wizardClass = computed(() =>
    `tf-promo-wizard tf-promo-wizard--${this.kind()}${this.leaving() ? ' is-leaving' : ''}`);
  readonly scrimClass = computed(() =>
    `tf-promo-scrim${this.leaving() ? ' is-leaving' : ''}`);
  readonly bodyStyle = computed(() => this.motion.preferred()
    ? ''
    : 'animation:tf-promo-step-a .4s var(--ease-out) both');

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.focus());

    effect(onCleanup => {
      // The page behind must not scroll under an open dialog.
      const body = this.document.body;
      const previous = body.style.overflow;
      body.style.overflow = 'hidden';
      onCleanup(() => { body.style.overflow = previous; });
    });

    effect(onCleanup => {
      if (!this.countdown()) return;
      const timer = setInterval(() => this.minuteTick.update(t => t + 1), 30000);
      onCleanup(() => clearInterval(timer));
    });
  }

  close(): void {
    if (this.leaving()) return;
    this.leaving.set(true);
    setTimeout(() => this.closed.emit(), LEAVE_MS);
  }

  /** Following the campaign's own call to action counts as claiming it. */
  claim(): void {
    this.claimed.emit();
  }

  /**
   * Taking the code is claiming the campaign for this visit, so the record is
   * made before the copy is attempted — a clipboard the browser refuses does
   * not change what the visitor did.
   */
  async copyCode(): Promise<void> {
    const code = this.code();
    if (!code) return;
    this.claimed.emit();
    try {
      await this.document.defaultView?.navigator.clipboard.writeText(code);
    } catch {
      // Clipboard unavailable (insecure context, or permission refused). The
      // code is on screen and selectable, so there is nothing to recover.
    }
    this.codeCopied.emit(code);
  }

  private text(field: 'eyebrow' | 'title' | 'body' | 'highlight' | 'ctaLabel'): string {
    const promotion = this.promotion();
    const arabic = promotion[`${field}Arabic` as const] as string;
    const english = promotion[`${field}English` as const] as string;
    return Promotion.text(arabic, english, this.isArabic());
  }
}
