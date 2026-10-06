import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ProblemDetailsDto } from '@core/http/api.dto';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { countText } from '@core/i18n/count-text';
import {
  AcceptError, AcceptForm, AcceptPolicy, acceptDefaults, deliveryWindow, priceDiffers, toAcceptBody, toLocalInput, validateAccept
} from '../models/accept-terms';
import { AcceptRequestGateway } from '../services/accept-request.gateway';

/** The learning request row being accepted, as the teacher's work list returns it. */
export interface AcceptableRequest {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly teacherServiceId: string;
  readonly preferredDeliveryAt: string | null;
  /** The price the student saw when sending the request, if the server kept it. */
  readonly listedPrice?: number | null;
}

/**
 * Accepting a direct request sets the terms of the order the student will pay for, so it is
 * a form, not a click (J3-07): price within the catalog range, the service's currency, a
 * delivery time the catalog allows, and a revision allowance within its cap. Cancelling closes
 * without sending anything. A successful acceptance creates the order awaiting payment.
 */
@Component({
  selector: 'tf-accept-request-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <dialog #dialog class="tf-system-dialog" aria-labelledby="accept-title" (close)="onClosed()" data-testid="accept-dialog">
      <form (ngSubmit)="submit()" novalidate>
        <h2 id="accept-title">{{ t('accept_title', 'Accept this request') }}</h2>
        @if (request(); as r) { <p>{{ r.title }}</p> }

        @if (loading()) {
          <p role="status">{{ t('common_loading', 'Loading…') }}</p>
        } @else if (policy(); as p) {
          <label class="tf-system-dialog-field">
            <span>{{ t('accept_price', 'Final price') }} ({{ currencyLabel(p.currency) }})</span>
            <input autocomplete="off" id="accept-price" name="price" type="number" inputmode="decimal" required
                   [attr.min]="p.minPrice" [attr.max]="p.maxPrice" step="0.01"
                   [value]="form().price" (input)="patch({ price: $any($event.target).value })"
                   [attr.aria-invalid]="shown('price')" aria-describedby="accept-price-hint" />
            <small id="accept-price-hint" [class.tf-field-error]="shown('price')">
              {{ t('accept_price_range', 'Between') }} {{ p.minPrice }} – {{ p.maxPrice }} {{ currencyLabel(p.currency) }}
            </small>
          </label>

          <label class="tf-system-dialog-field">
            <span>{{ t('accept_delivery', 'Agreed delivery') }}</span>
            <input autocomplete="off" id="accept-delivery" name="delivery" type="datetime-local" required
                   [attr.min]="window().min" [attr.max]="window().max"
                   [value]="form().deliveryLocal" (input)="patch({ deliveryLocal: $any($event.target).value })"
                   [attr.aria-invalid]="shown('delivery')" aria-describedby="accept-delivery-hint" />
            <small id="accept-delivery-hint" [class.tf-field-error]="shown('delivery')">
              {{ locale.format('accept_delivery_window', { from: span(p.minDeliveryHours), to: span(p.maxDeliveryHours) }, 'Between {from} and {to} from now') }}
            </small>
          </label>

          @if (differs()) {
            <label class="tf-system-dialog-field">
              <span>{{ t('accept_reason', 'Why is the price different? (the student sees this)') }}</span>
              <textarea autocomplete="off" id="accept-reason" name="reason" rows="3" maxlength="500" required
                        [value]="form().reason ?? ''" (input)="patch({ reason: $any($event.target).value })"
                        [attr.aria-invalid]="shown('reason')" aria-describedby="accept-reason-hint"></textarea>
              <small id="accept-reason-hint" [class.tf-field-error]="shown('reason')">{{ locale.format('accept_reason_hint',
                { listed: fmt.money(request()?.listedPrice ?? 0, policy()?.currency ?? 'SAR') },
                'The student saw {listed}. For example: the request needs extra work, or it is longer than usual.') }}</small>
            </label>
          }

          <label class="tf-system-dialog-field">
            <span>{{ t('accept_revisions', 'Revisions included') }}</span>
            <select id="accept-revisions" name="revisions" (change)="patch({ revisions: $any($event.target).value })"
                    [attr.aria-invalid]="shown('revisions')">
              @for (n of revisionChoices(); track n) {
                <option [value]="n" [selected]="form().revisions === '' + n">{{ n }}</option>
              }
            </select>
          </label>
          <p class="tf-accept-next">{{ t('accept_what_next', 'What happens next: the student is asked to pay this price. You start the work only after they have paid. Your earnings, after Tafseel’s commission, then appear under Earnings.') }}</p>
        } @else if (!loading()) {
          <p role="alert">{{ t('accept_no_policy', 'This service is no longer available to accept.') }}</p>
        }

        @if (serverError()) { <p class="tf-field-error" role="alert">{{ serverError() }}</p> }

        <div class="tf-system-dialog-actions">
          <button type="button" class="tf-button tf-button-secondary" (click)="cancel()">{{ t('cancel', 'Cancel') }}</button>
          <button type="submit" class="tf-button" [disabled]="busy() || !policy()">
            {{ busy() ? t('accept_sending', 'Accepting…') : t('td_accept', 'Accept') }}
          </button>
        </div>
      </form>
    </dialog>
  `,
  styles: `
    .tf-system-dialog-field select {
      min-height: 48px; width: 100%; padding-inline: 12px; color: var(--text); background: var(--bg);
      border: 1px solid var(--border-strong); border-radius: var(--r-sm); font: inherit; font-size: var(--type-body-lg-size);
    }
    .tf-system-dialog-field small { font-weight: var(--weight-regular, 400); color: var(--text-2); }
    .tf-system-dialog-field small.tf-field-error { color: var(--error); }
    .tf-accept-next { margin: 4px 0 0; padding: 10px 12px; font-size: var(--type-label-size); line-height: 1.6; color: var(--text-2);
      background: var(--surface-2); border-radius: var(--r-sm); }
  `
})
export class AcceptRequestDialogComponent {
  private readonly gateway = inject(AcceptRequestGateway);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** Emitted after the server accepted; the host reloads its list. */
  readonly accepted = output<void>();

  readonly request = signal<AcceptableRequest | null>(null);
  readonly policy = signal<AcceptPolicy | null>(null);
  readonly form = signal<AcceptForm>({ price: '', deliveryLocal: '', revisions: '0' });
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly attempted = signal(false);
  readonly serverError = signal('');
  private idempotencyKey = '';

  readonly errors = computed(() => {
    const policy = this.policy();
    return policy ? validateAccept(this.form(), policy, new Date(), this.request()?.listedPrice) : [];
  });
  readonly window = computed(() => {
    const policy = this.policy();
    if (!policy) return { min: '', max: '' };
    const [min, max] = deliveryWindow(policy, new Date());
    return { min: toLocalInput(min), max: toLocalInput(max) };
  });
  /** Whether the teacher is changing the price the student saw, which needs their reason. */
  readonly differs = computed(() => priceDiffers(this.form(), this.request()?.listedPrice));
  readonly revisionChoices = computed(() =>
    Array.from({ length: (this.policy()?.maxRevisions ?? 0) + 1 }, (_, i) => i));

  t(key: string, fallback: string): string {
    return this.locale.t(key, fallback);
  }

  /** "12 hours", "14 days": an older teacher should not have to divide 336 by 24. */
  span(hours: number): string {
    return hours < 48 || hours % 24 !== 0
      ? countText((k, f) => this.locale.t(k, f), this.locale.lang(), 'count_hours', hours, '1 hour', '{n} hours')
      : countText((k, f) => this.locale.t(k, f), this.locale.lang(), 'count_days', hours / 24, '1 day', '{n} days');
  }

  /**
   * The currency as the reader writes it. The catalog stores the ISO code, and printing it put "SAR" in the
   * middle of an Arabic form (UX-06). One rule for the whole product, in FormatService.
   */
  currencyLabel(currency: string): string {
    return this.fmt.currencyLabel(currency);
  }

  shown(field: AcceptError): boolean {
    return this.attempted() && this.errors().includes(field);
  }

  patch(change: Partial<AcceptForm>): void {
    this.form.update(form => ({ ...form, ...change }));
  }

  async open(request: AcceptableRequest): Promise<void> {
    this.request.set(request);
    this.policy.set(null);
    this.attempted.set(false);
    this.serverError.set('');
    this.idempotencyKey = crypto.randomUUID();
    this.loading.set(true);
    this.dialog().nativeElement.showModal();
    try {
      const policy = await firstValueFrom(this.gateway.policy(request.teacherServiceId));
      this.policy.set(policy);
      if (policy) this.form.set(acceptDefaults(policy, request.preferredDeliveryAt, new Date()));
    } catch (error) {
      this.serverError.set(this.problem(error));
    } finally {
      this.loading.set(false);
    }
  }

  cancel(): void {
    this.dialog().nativeElement.close();
  }

  onClosed(): void {
    this.request.set(null);
  }

  async submit(): Promise<void> {
    const request = this.request();
    const policy = this.policy();
    this.attempted.set(true);
    this.serverError.set('');
    if (!request || !policy || this.busy()) return;
    if (this.errors().length) {
      this.serverError.set(this.t('accept_fix_fields', 'Check the highlighted terms before accepting.'));
      const first = this.errors()[0];
      this.dialog().nativeElement.querySelector<HTMLElement>(`#accept-${first}`)?.focus();
      return;
    }

    this.busy.set(true);
    try {
      await firstValueFrom(this.gateway.accept(request.id, request.version, this.idempotencyKey, toAcceptBody(this.form(), policy, this.request()?.listedPrice)));
      this.dialog().nativeElement.close();
      this.accepted.emit();
    } catch (error) {
      this.serverError.set(this.problem(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** The API's reason: translated when the vocabulary has its code, else its own sentence. */
  private problem(error: unknown): string {
    const body = (error instanceof HttpErrorResponse ? error.error ?? {} : {}) as ProblemDetailsDto;
    return (body.code ? this.locale.t(`err_${body.code}`, '') : '')
      || body.detail || body.title || this.t('unexpected_error', 'Something went wrong.');
  }
}
