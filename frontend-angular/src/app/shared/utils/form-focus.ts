import { afterNextRender, ElementRef, inject, Injector } from '@angular/core';

const INVALID = '[aria-invalid="true"]:not([disabled])';

/**
 * After a refused submit, move focus to the first field the component marks
 * `aria-invalid`, so a keyboard or screen-reader user lands on the problem
 * instead of on a button that did nothing.
 *
 * Call it in an injection context; it returns the function a submit handler calls.
 * When the errors are already on screen (a second press) focus moves now;
 * otherwise it waits for the render that draws them.
 */
export function injectFocusFirstInvalid(): () => void {
  const host = inject<ElementRef<HTMLElement>>(ElementRef);
  const injector = inject(Injector);
  const first = () => host.nativeElement.querySelector<HTMLElement>(INVALID);
  return () => {
    const now = first();
    if (now) {
      now.focus();
      return;
    }
    afterNextRender(() => first()?.focus(), { injector });
  };
}
