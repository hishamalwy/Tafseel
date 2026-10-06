import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { PriceComponent } from '@shared/components/price.component';
import { ToastComponent } from '@shared/components/toast.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import { Demand, OFFER_STATUS, Offer } from '../models/demand';
import { LoadOffers, OfferChanged, OffersView, SelectOffer } from '../services/demand.use-cases';

/**
 * Comparing the offers on an open request (J4-07) and holding the selected one for payment
 * (J4-08). Offers are shown in the order the server returned them, with only what it returned:
 * no ranking, no "best offer".
 */
@Component({
  selector: 'tf-offers-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, WorkspaceShellComponent, ToastComponent, PriceComponent],
  templateUrl: './offers-page.component.html',
  styleUrls: ['../../../shared/styles/workspace-detail.css', './offers-page.component.css']
})
export class OffersPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly load = inject(LoadOffers);
  private readonly select = inject(SelectOffer);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  readonly Demand = Demand;
  readonly OFFER_STATUS = OFFER_STATUS;

  requestId = '';
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly view = signal<OffersView | null>(null);
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly error = signal('');
  readonly now = signal(Date.now());

  readonly offers = computed(() => this.view()?.offers ?? []);
  readonly comparing = signal(false);
  readonly reserved = computed(() => { const r = this.view()?.request; return !!r && Demand.isReserved(r); });
  readonly secondsLeft = computed(() => {
    const r = this.view()?.request;
    return r && Demand.isReserved(r) ? Demand.reservationSecondsLeft(r.reservationExpiresAt, this.now()) : 0;
  });

  constructor() {
    inject(Title).setTitle(`${this.t('demand_offers_title', 'Offers')} — Tafseel`);
    const timer = setInterval(() => {
      this.now.set(Date.now());
      if (this.reserved() && this.secondsLeft() === 0 && !this.loading()) {
        this.notice.set(this.t('demand_reservation_expired', 'The reservation ran out before payment. The offers are open again.'));
        void this.refresh();
      }
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.requestId = params.get('requestId') ?? '';
      void this.refresh();
    });
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  date(value: string): string { return value ? this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
  teacherName(offer: Offer): string { return (this.locale.isRtl() ? offer.teacherName : offer.teacherNameEnglish) || offer.teacherName || offer.teacherNameEnglish || '—'; }
  countdown(): string { return Demand.countdown(this.secondsLeft()); }

  async refresh(): Promise<void> {
    // Moving to another one while this load is in flight must not let its late answer paint the other.
    const requestId = this.requestId;
    this.loading.set(true);
    this.loadError.set('');
    try {
      const view = await this.load.execute(requestId);
      if (requestId === this.requestId) this.view.set(view);
    }
    catch (error) { if (requestId === this.requestId) this.loadError.set(problemMessage(error, (k, f) => this.t(k, f)).text); }
    finally { if (requestId === this.requestId) this.loading.set(false); }
  }

  async choose(offer: Offer): Promise<void> {
    const view = this.view();
    if (!view || this.busy()) return;
    if (!await this.dialogs.confirm({
      title: this.t('demand_select_title', 'Select this offer?'),
      body: this.locale.format('demand_select_body', { teacher: this.teacherName(offer) },
        'The request is held for {teacher} while you pay. No order exists until the payment succeeds.'),
      confirmLabel: this.t('demand_select', 'Select offer'), cancelLabel: this.t('common_cancel', 'Cancel')
    })) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await this.select.execute(view.request, offer);
      await this.refresh();
      this.toasts.show(this.t('demand_selected', 'Offer selected. Pay before the reservation runs out.'));
    } catch (error) {
      if (error instanceof OfferChanged) {
        await this.refresh();
        this.notice.set(this.t('demand_offer_changed', 'This offer or the request changed since you opened the page. Review the updated offers, then select again.'));
      } else {
        this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
      }
    } finally {
      this.busy.set(false);
    }
  }

  async release(): Promise<void> {
    const view = this.view();
    if (!view || this.busy() || !await this.dialogs.confirm({
      title: this.t('demand_release_title', 'Choose a different offer?'),
      body: this.t('demand_release_body', 'The offer you picked will no longer be held for you, and you can choose any offer again. You have not paid, so nothing is charged.'),
      confirmLabel: this.t('demand_release', 'Choose a different offer'), cancelLabel: this.t('common_cancel', 'Cancel')
    })) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.select.cancel(view.request);
      await this.refresh();
    } catch (error) {
      this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
      await this.refresh();
    } finally {
      this.busy.set(false);
    }
  }
}
