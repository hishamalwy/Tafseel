import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ToastService } from '@shared/services/toast.service';

/**
 * The transient confirmation strip. Positioning and the rise animation come from
 * the stylesheet; the legacy pages inlined all of it at each use site.
 */
@Component({
  selector: 'tf-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (text(); as shown) {
      <div class="tf-toast" [class.is-leaving]="toasts.leaving()" role="status">{{ shown }}</div>
    }
  `,
  styles: `
    :host { display: contents; }
    .tf-toast.is-leaving { opacity: 0; transform: translateY(6px); }
    .tf-toast {
      position: fixed; inset-block-end: 24px; inset-inline-end: 24px; z-index: 80;
      background: var(--surface); box-shadow: var(--shadow-lg);
      border-radius: var(--r-md); padding: 14px 18px;
      font-size: 14px; font-weight: 500; max-inline-size: 320px;
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
