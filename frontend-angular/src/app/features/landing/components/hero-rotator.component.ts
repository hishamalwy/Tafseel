import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal
} from '@angular/core';
import { ReducedMotion } from '@core/a11y/reduced-motion.service';

/**
 * The word that cycles at the end of the hero headline.
 *
 * Two slots, not one: the outgoing word has to still be in the DOM while the
 * incoming one arrives, which is what makes the swap read as a roll rather than
 * a flicker. The keyframe *names* alternate between an `-a` and a `-b` pair on
 * every tick, because changing an attribute alone would not replay a CSS
 * animation on a node the framework reuses.
 *
 * The full sentence is announced once, in the parent's `aria-label`; this is
 * decorative, so the visible slots stay hidden from assistive technology.
 *
 * It rolls through the words once and comes to rest on the first, the word the
 * headline's `aria-label` names: one pass of a few seconds, then still. Under
 * reduced motion it never moves at all.
 */
@Component({
  selector: 'tf-hero-rotator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="tf-rotate-word tf-rotate-accent" aria-hidden="true"
          [style.--tf-rotate-min]="minWidth()">
      <span class="tf-rotate-slot tf-rotate-slot-prev"
            [attr.data-tick]="tick()" [style]="previousStyle()">{{ previous() }}</span>
      <span class="tf-rotate-slot tf-rotate-slot-current"
            [attr.data-tick]="tick()" [style]="currentStyle()">{{ current() }}</span>
    </span>
  `,
  styles: `:host { display: contents; }`
})
export class HeroRotatorComponent {
  private readonly motion = inject(ReducedMotion);

  readonly words = input.required<readonly string[]>();
  /** Reserves the widest word's space so the headline never reflows. */
  readonly minWidth = input('8.6ch');
  readonly intervalMs = input(2600);
  /** Emitted once, when the cycle has come back to the first word and stopped. */
  readonly settled = output<void>();
  private readonly done = signal(false);

  private readonly index = signal(0);
  private readonly previousIndex = signal(0);
  readonly tick = signal(0);

  readonly current = computed(() => this.words()[this.index() % this.words().length] ?? '');
  readonly previous = computed(() =>
    this.words()[this.previousIndex() % this.words().length] ?? '');

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect(onCleanup => {
      if (this.motion.preferred() || this.done()) return;
      const period = this.intervalMs();
      const timer = setInterval(() => {
        this.previousIndex.set(this.index());
        this.index.update(i => (i + 1) % this.words().length);
        this.tick.update(t => t + 1);
        if (this.index() === 0) {
          clearInterval(timer);
          this.done.set(true);
          this.settled.emit();
        }
      }, period);
      onCleanup(() => clearInterval(timer));
    });
    destroyRef.onDestroy(() => this.tick.set(0));
  }

  /**
   * Before the first tick — and always under reduced motion — the slots are
   * placed rather than animated, so nothing moves on load.
   */
  readonly previousStyle = computed(() => this.still()
    ? 'opacity:0;transform:translateY(-110%)'
    : `animation:tf-rotate-out-${this.pulse()} .56s cubic-bezier(.16,1,.3,1) both`);

  readonly currentStyle = computed(() => this.still()
    ? 'opacity:1;transform:none'
    : `animation:tf-rotate-in-${this.pulse()} .56s cubic-bezier(.16,1,.3,1) both`);

  private still(): boolean {
    return this.motion.preferred() || this.tick() === 0;
  }

  private pulse(): 'a' | 'b' {
    return this.tick() % 2 ? 'b' : 'a';
  }
}
