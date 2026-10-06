import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ToastService } from '@shared/services/toast.service';

/**
 * The transient confirmation strip. Positioning and the rise animation come from
 * the stylesheet; the legacy pages inlined all of it at each use site.
 */
@Component({
  selector: 'tf-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The live region is always in the page and only its content comes and goes:
  // a region inserted together with its text is often not announced at all.
  template: `
    <div class="tf-toast-region" role="status" aria-live="polite" aria-atomic="true">
      @if (text(); as shown) {
        <div class="tf-toast" [class.is-leaving]="toasts.leaving()">{{ shown }}</div>
      }
    </div>
  `,
  styles: `
    :host { display: contents; }
    /* Out of flow, so the empty region adds no gap to the grid or flex row it sits in. */
    .tf-toast-region { position: fixed; inline-size: 0; block-size: 0; }
    .tf-toast.is-leaving { opacity: 0; transform: translateY(6px); }
    .tf-toast {
      position: fixed; inset-block-end: 24px; inset-inline-end: 24px; z-index: 80;
      background: var(--surface); box-shadow: var(--shadow-lg);
      border-radius: var(--r-md); padding: 14px 18px;
      font-size: var(--type-body-sm-size); font-weight: 500; max-inline-size: 320px;
      animation: tf-rise 220ms ease both;
      transition: opacity 180ms ease, transform 180ms ease;
    }
    @media (prefers-reduced-motion: reduce) { .tf-toast { animation: none; } }
  `
})
export class ToastComponent {
  readonly toasts = inject(ToastService);

  /** An explicit message wins; otherwise the component shows the shared one. */
  readonly message = input<string>('');
  readonly text = () => this.message() || this.toasts.message();
}
