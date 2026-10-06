import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { ReducedMotion } from './reduced-motion.service';

/** Motion follows input modality; keyboard interaction always stays immediate. */
@Injectable({ providedIn: 'root' })
export class InteractionMotion {
  private readonly document = inject(DOCUMENT);
  private readonly reduced = inject(ReducedMotion);
  readonly keyboard = signal(false);
  readonly allowed = computed(() => this.reduced.allowsMotion() && !this.keyboard());

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const set = (keyboard: boolean): void => {
      this.keyboard.set(keyboard);
      this.document.documentElement.dataset['motionInput'] = keyboard ? 'keyboard' : 'pointer';
    };
    const key = (): void => set(true);
    const pointer = (): void => set(false);
    this.document.addEventListener('keydown', key, true);
    this.document.addEventListener('pointerdown', pointer, true);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('keydown', key, true);
      this.document.removeEventListener('pointerdown', pointer, true);
    });
  }
}
