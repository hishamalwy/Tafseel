import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LocaleService } from '@core/i18n/locale.service';

/**
 * A strip on every screen while the site takes simulated payments (Development, Staging, PreProduction), so a
 * price, a checkout or a payout is never mistaken for real money. The server decides: it reports the payment
 * simulator only outside Production, and Production refuses the mock provider at startup, so there the strip
 * never appears. It holds no link or control, so the skip link stays the first thing a keyboard reaches.
 */
@Component({
  selector: 'tf-test-mode-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <p class="tf-test-mode" role="note" data-testid="test-mode-banner">
        <strong>{{ locale.t('test_mode_label', 'Test environment') }}</strong>
        <span class="tf-test-mode-long">{{ locale.t('test_mode_body', 'Payments are simulated: no real money is charged or paid out.') }}</span>
        <span class="tf-test-mode-short">{{ locale.t('test_mode_short', 'simulated payments') }}</span>
      </p>
    }
  `,
  styles: `
    .tf-test-mode {
      margin: 0; padding: 6px 16px; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 8px;
      background: var(--warning-soft); color: var(--text, inherit); border-block-end: 1px solid var(--warning);
      font-size: 0.8125rem; line-height: 1.4; text-align: center;
    }
    .tf-test-mode-short { display: none; }
    /* On a phone every pixel above the fold belongs to the page's main action (UX-06): the strip becomes a chip that
       floats over the header's empty middle, takes no layout space and lets every tap through. */
    @media (max-width: 767px) {
      .tf-test-mode {
        position: fixed; z-index: 1000; inset-block-start: 4px; left: 50%; transform: translateX(-50%);
        padding: 2px 10px; border: 1px solid var(--warning); border-radius: 999px; pointer-events: none;
        font-size: 0.6875rem; white-space: nowrap; flex-wrap: nowrap; max-width: calc(100vw - 140px);
      }
      .tf-test-mode-long { display: none; }
      .tf-test-mode-short { display: inline; overflow: hidden; text-overflow: ellipsis; }
    }
  `
})
export class TestModeBannerComponent {
  readonly locale = inject(LocaleService);
  readonly visible = signal(false);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    inject(HttpClient).get<{ mockSimulatorEnabled?: boolean }>('/api/v1/payments/mock/capabilities')
      .subscribe({ next: caps => this.visible.set(caps?.mockSimulatorEnabled === true), error: () => this.visible.set(false) });
  }
}
