import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { ToastService } from '@shared/services/toast.service';
import { DialogService } from '@shared/services/dialog.service';
import { ToastComponent } from '@shared/components/toast.component';
import { PriceComponent } from '@shared/components/price.component';
import { PublicHeaderComponent } from '@shared/layouts/public-header.component';
import { SkipLinkComponent } from '@shared/layouts/skip-link.component';
import { Offer, OpenRequest } from '../services/request.ports';
import {
  AcceptOffer, ListMarketplaceRequests, SubmitOffer
} from '../services/request.use-cases';

/** Which side of the marketplace the viewer is on. */
type Side = 'student' | 'teacher';

/**
 * The open marketplace — ported from `Tafseel-Open-Marketplace.dc.html` and
 * `js/open-marketplace.js`.
 *
 * One screen, two audiences. A student sees their own published requests and the
 * offers on them; a teacher sees opportunities they can bid on. The legacy
 * version decided that by branching through a 956-line script; here the side is
 * derived from the session once and the rest follows from it.
 */
@Component({
  selector: 'tf-marketplace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicHeaderComponent, SkipLinkComponent, ToastComponent, PriceComponent],
  templateUrl: './marketplace-page.component.html',
  styleUrl: './marketplace-page.component.css'
})
export class MarketplacePageComponent {
  private readonly list = inject(ListMarketplaceRequests);
  private readonly submitOfferUseCase = inject(SubmitOffer);
  private readonly acceptOfferUseCase = inject(AcceptOffer);
  private readonly store = inject(SignalSessionStore);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly toasts = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly requests = signal<readonly OpenRequest[]>([]);
  readonly selectedId = signal('');
  readonly offers = signal<readonly Offer[]>([]);
  readonly offersLoading = signal(false);
  readonly busy = signal(false);

  // Teacher's offer form
  readonly offerPrice = signal('');
  readonly offerDays = signal('');
  readonly offerMessage = signal('');

  readonly side = computed<Side>(() =>
    this.store.roles().includes('Teacher') ? 'teacher' : 'student');
  readonly isGuest = computed(() => !this.store.isAuthenticated());

  constructor() {
    queueMicrotask(() =>
      this.title.setTitle(this.t('om_title', 'Open marketplace') + ' — Tafseel'));
    void this.load();
  }

  t(key: string, fallback = ''): string {
    return this.locale.t(key, fallback);
  }

  readonly selected = computed(() =>
    this.requests().find(r => r.id === this.selectedId()) ?? null);

  readonly rows = computed(() => this.requests().map(request => ({
    id: request.id,
    title: request.title,
    subject: this.locale.lang() === 'ar'
      ? (request.subjectNameArabic || request.subjectName)
      : (request.subjectName || request.subjectNameArabic),
    deadline: request.deadline ? this.fmt.dateOnly(request.deadline) : '—',
    budget: request.budget,
    currency: request.currency || 'SAR',
    offerCount: request.offerCount,
    when: this.fmt.dateOnly(request.createdAt),
    current: request.id === this.selectedId()
  })));

  readonly offerRows = computed(() => this.offers().map(offer => ({
    ...offer,
    teacher: this.locale.lang() === 'ar'
      ? (offer.teacherDisplayName || offer.teacherDisplayNameEnglish || this.t('name_unavailable', '—'))
      : (offer.teacherDisplayNameEnglish || offer.teacherDisplayName || this.t('name_unavailable', '—')),
    deliveryLabel: offer.deliveryDays
      ? `${offer.deliveryDays} ${this.t('tp_days', 'days')}`
      : this.t('tp_flexible', 'Flexible')
  })));

  readonly canSubmitOffer = computed(() =>
    !this.busy()
    && Number(this.offerPrice()) > 0
    && Number(this.offerDays()) > 0
    && this.selectedId() !== '');

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const requests = this.side() === 'teacher'
        ? await this.list.opportunities()
        : await this.list.mine();
      this.requests.set(requests);
      if (requests.length) await this.select(requests[0]!.id);
    } catch {
      this.error.set(this.t('om_failed', 'Could not load the marketplace.'));
    } finally {
      this.loading.set(false);
    }
  }

  async select(requestId: string): Promise<void> {
    this.selectedId.set(requestId);
    // A teacher sees their own offer form; only a student reads the offer list.
    if (this.side() !== 'student') return;

    this.offersLoading.set(true);
    try {
      this.offers.set(await this.list.offers(requestId));
    } catch {
      this.offers.set([]);
    } finally {
      this.offersLoading.set(false);
    }
  }

  async sendOffer(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSubmitOffer()) return;

    this.busy.set(true);
    try {
      await this.submitOfferUseCase.execute(
        this.selectedId(), Number(this.offerPrice()), Number(this.offerDays()), this.offerMessage());
      this.offerPrice.set('');
      this.offerDays.set('');
      this.offerMessage.set('');
      this.toasts.show(this.t('om_offer_sent', 'Your offer was sent.'));
      await this.load();
    } catch (error) {
      const code = (error as Error)?.message;
      this.toasts.show(
        code === 'offer-needs-price' ? this.t('om_needs_price', 'Enter a price.')
        : code === 'offer-needs-delivery' ? this.t('om_needs_delivery', 'Enter a delivery time.')
        : this.t('om_offer_failed', 'Could not send the offer.'));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Accepting an offer creates the order and commits the student to paying, so
   * it asks first rather than acting on a single click.
   */
  async accept(offer: Offer): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: this.t('om_accept_title', 'Accept this offer?'),
      body: this.t('om_accept_body', 'This creates an order and takes you to payment.'),
      confirmLabel: this.t('om_accept', 'Accept')
    });
    if (!confirmed) return;

    this.busy.set(true);
    try {
      const { orderId } = await this.acceptOfferUseCase.execute(offer.id);
      await this.router.navigate(['/checkout'], { queryParams: { orderId } });
    } catch {
      this.toasts.show(this.t('om_accept_failed', 'Could not accept the offer.'));
    } finally {
      this.busy.set(false);
    }
  }
}
