import { Injectable, signal } from '@angular/core';

/**
 * The transient confirmation strip, ported from `Tafseel.flash` / `toastClass`.
 *
 * The legacy version reached into the calling component and set `toast` and
 * `toastLeaving` on its state, then juggled two timers stored on the component
 * itself — which meant every screen carried two state keys and two timer fields
 * for a message that belongs to no screen in particular. Here the state is the
 * service's, and a component reads it.
 *
 * `leaving` drives the exit transition, so the strip animates out rather than
 * vanishing; the 180ms gap matches the CSS.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly text = signal('');
  private readonly exiting = signal(false);
  private holdTimer?: ReturnType<typeof setTimeout>;
  private exitTimer?: ReturnType<typeof setTimeout>;

  readonly message = this.text.asReadonly();
  readonly leaving = this.exiting.asReadonly();

  show(message: string, holdMs = 2600): void {
    this.clearTimers();
    this.text.set(message);
    this.exiting.set(false);

    this.holdTimer = setTimeout(() => {
      this.exiting.set(true);
      this.exitTimer = setTimeout(() => {
        this.text.set('');
        this.exiting.set(false);
      }, 180);
    }, holdMs);
  }

  dismiss(): void {
    this.clearTimers();
    this.text.set('');
    this.exiting.set(false);
  }

  private clearTimers(): void {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    if (this.exitTimer) clearTimeout(this.exitTimer);
  }
}
