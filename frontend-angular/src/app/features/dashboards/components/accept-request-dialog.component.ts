import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ProblemDetailsDto } from '@core/http/api.dto';
import { LocaleService } from '@core/i18n/locale.service';
import {
  AcceptError, AcceptForm, AcceptPolicy, acceptDefaults, deliveryWindow, toAcceptBody, toLocalInput, validateAccept
} from '../models/accept-terms';
import { AcceptRequestGateway } from '../services/accept-request.gateway';

/** The learning request row being accepted, as the teacher's work list returns it. */
export interface AcceptableRequest {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly teacherServiceId: string;
  readonly preferredDeliveryAt: string | null;
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
            <input id="accept-price" name="price" type="number" inputmode="decimal" required
                   [attr.min]="p.minPrice" [attr.max]="p.maxPrice" step="0.01"
                   [value]="form().price" (input)="patch({ price: $any($event.target).value })"
                   [attr.aria-invalid]="shown('price')" aria-describedby="accept-price-hint" />
            <small id="accept-price-hint" [class.tf-field-error]="shown('price')">
              {{ t('accept_price_range', 'Between') }} {{ p.minPrice }} – {{ p.maxPrice }} {{ currencyLabel(p.currency) }}
            </small>
          </label>

          <label class="tf-system-dialog-field">
            <span>{{ t('accept_currency', 'Currency') }}</span>
            <input name="currency" [value]="currencyLabel(p.currency)" readonly aria-readonly="true" />
          </label>

          <label class="tf-system-dialog-field">
            <span>{{ t('accept_delivery', 'Agreed delivery') }}</span>
            <input id="accept-delivery" name="delivery" type="datetime-local" required
                   [attr.min]="window().min" [attr.max]="window().max"
                   [value]="form().deliveryLocal" (input)="patch({ deliveryLocal: $any($event.target).value })"
                   [attr.aria-invalid]="shown('delivery')" aria-describedby="accept-delivery-hint" />
            <small id="accept-delivery-hint" [class.tf-field-error]="shown('delivery')">
              {{ t('accept_delivery_range', 'Between') }} {{ p.minDeliveryHours }} – {{ p.maxDeliveryHours }} {{ t('accept_hours_from_now', 'hours from now') }}
            </small>
          </label>

          <label class="tf-system-dialog-field">
            <span>{{ t('accept_revisions', 'Revisions included') }}</span>
            <select id="accept-revisions" name="revisions" (change)="patch({ revisions: $any($event.target).value })"
                    [attr.aria-invalid]="shown('revisions')">
              @for (n of revisionChoices(); track n) {
                <option [value]="n" [selected]="form().revisions === '' + n">{{ n }}</option>
              }
            </select>
          </label>
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
      border: 1px solid var(--border-strong); border-radius: var(--r-sm); font: inherit; font-size: 16px;
    }
    .tf-system-dialog-field small { font-weight: var(--weight-regular, 400); color: var(--text-2); }
    .tf-system-dialog-field small.tf-field-error { color: var(--error); }
  `
})
export class AcceptRequestDialogComponent {
  private readonly gateway = inject(AcceptRequestGateway);
  private readonly locale = inject(LocaleService);
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
    return policy ? validateAccept(this.form(), policy, new Date()) : [];
  });
  readonly window = computed(() => {
    const policy = this.policy();
    if (!policy) return { min: '', max: '' };
    const [min, max] = deliveryWindow(policy, new Date());
    return { min: toLocalInput(min), max: toLocalInput(max) };
  });
  readonly revisionChoices = computed(() =>
    Array.from({ length: (this.policy()?.maxRevisions ?? 0) + 1 }, (_, i) => i));

  t(key: string, fallback: string): string {
    return this.locale.t(key, fallback);
  }

  /**
   * The currency as the reader writes it. The catalog stores the ISO code, and printing it put "SAR" in the
   * middle of an Arabic form (UX-06); any other currency keeps its code, which is how it is written anywhere.
   */
  currencyLabel(currency: string): string {
    return currency === 'SAR' ? this.locale.t('currency_sar_short', 'SAR') : currency;
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
    if (!request || !policy || this.busy() || this.errors().length) return;

    this.busy.set(true);
    try {
      await firstValueFrom(this.gateway.accept(request.id, request.version, this.idempotencyKey, toAcceptBody(this.form(), policy)));
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
