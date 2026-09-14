import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ProblemDetailsDto } from '@core/http/api.dto';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { ToastService } from '@shared/services/toast.service';
import { DialogService } from '@shared/services/dialog.service';
import { ToastComponent } from '@shared/components/toast.component';
import { PriceComponent } from '@shared/components/price.component';
import { PublicHeaderComponent } from '@shared/layouts/public-header.component';
import { SkipLinkComponent } from '@shared/layouts/skip-link.component';
import { Offer, OfferStatus, OpenRequest, RequestStatus } from '../services/request.ports';
import {
  ListMarketplaceRequests, OFFER_LIMITS, SelectOffer, SubmitOffer
} from '../services/request.use-cases';

/** Which side of the marketplace the viewer is on. */
type Side = 'student' | 'teacher';

/** How long a teacher's offer stays open, in days. SubmitTeacherOffer allows 1 to 720 hours. */
export const OFFER_VALIDITY_DAYS = [1, 3, 7, 14, 30] as const;

/**
 * The open marketplace — ported from `Tafseel-Open-Marketplace.dc.html` and
 * `js/open-marketplace.js`.
 *
 * One screen, two audiences. A student sees their own published requests and the
 * offers on them; a teacher sees opportunities they can bid on. The side is derived
 * from the session once and the rest follows from it.
 *
 * Selecting an offer does not create an order. It reserves the request for payment of
 * that offer for a limited time; the page shows the reservation, and payment for an
 * open request is a later step (Wave 3).
 */
@Component({
  selector: 'tf-marketplace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, PublicHeaderComponent, SkipLinkComponent, ToastComponent, PriceComponent],
  templateUrl: './marketplace-page.component.html',
  styleUrl: './marketplace-page.component.css'
})
export class MarketplacePageComponent {
  private readonly list = inject(ListMarketplaceRequests);
  private readonly submitOfferUseCase = inject(SubmitOffer);
  private readonly selectOfferUseCase = inject(SelectOffer);
  private readonly store = inject(SignalSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly toasts = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  readonly limits = OFFER_LIMITS;
  readonly validityDays = OFFER_VALIDITY_DAYS;

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
  readonly offerRevisions = signal('2');
  readonly offerValidityDays = signal('7');
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

  /** The selected request is reserved for payment of one of its offers. */
  readonly reservation = computed(() => {
    const request = this.selected();
    return request && request.status === RequestStatus.AwaitingPayment
      ? { offerId: request.selectedOfferId, expiresAt: request.paymentReservationExpiresAt }
      : null;
  });

  /** Offers can be chosen only while the request is still open for offers. */
  readonly canSelect = computed(() => this.selected()?.status === RequestStatus.OpenForOffers);

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
    reserved: request.status === RequestStatus.AwaitingPayment,
    when: this.fmt.dateOnly(request.createdAt),
    current: request.id === this.selectedId()
  })));

  readonly offerRows = computed(() => this.offers().map(offer => ({
    ...offer,
    teacher: this.locale.lang() === 'ar'
      ? (offer.teacherDisplayName || offer.teacherDisplayNameEnglish || this.t('name_unavailable', '—'))
      : (offer.teacherDisplayNameEnglish || offer.teacherDisplayName || this.t('name_unavailable', '—')),
    deliveryLabel: offer.deliveryHours >= 24
      ? `${Math.round(offer.deliveryHours / 24)} ${this.t('tp_days', 'days')}`
      : `${offer.deliveryHours} ${this.t('om_hours', 'hours')}`,
    revisionsLabel: `${offer.includedRevisions} ${this.t('om_revisions_included', 'revisions included')}`,
    isSelected: offer.status === OfferStatus.Selected || offer.id === this.reservation()?.offerId,
    selectable: offer.status === OfferStatus.Submitted
  })));

  readonly canSubmitOffer = computed(() =>
    !this.busy()
    && Number(this.offerPrice()) > 0
    && Number(this.offerDays()) > 0
    && this.offerMessage().trim().length > 0
    && this.selectedId() !== '');

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const requests = this.side() === 'teacher'
        ? await this.list.opportunities()
        : await this.list.mine();
      this.requests.set(requests);
      // Keep the open request; otherwise a notification link names one (`?requestId=`).
      const wanted = this.selectedId() || this.route.snapshot.queryParamMap.get('requestId');
      const first = requests.find(r => r.id === wanted) ?? requests[0];
      if (first) await this.select(first.id);
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
      await this.submitOfferUseCase.execute(this.selectedId(), {
        amount: Number(this.offerPrice()),
        deliveryHours: Math.round(Number(this.offerDays()) * 24),
        includedRevisions: Number(this.offerRevisions()),
        validityHours: Number(this.offerValidityDays()) * 24,
        message: this.offerMessage()
      });
      this.offerPrice.set('');
      this.offerDays.set('');
      this.offerRevisions.set('2');
      this.offerValidityDays.set('7');
      this.offerMessage.set('');
      this.toasts.show(this.t('om_offer_sent', 'Your offer was sent.'));
      await this.load();
    } catch (error) {
      const code = (error as Error)?.message;
      this.toasts.show(
        code === 'offer-needs-price' ? this.t('om_needs_price', 'Enter a price.')
        : code === 'offer-needs-delivery' ? this.t('om_needs_delivery', 'Enter a delivery time.')
        : code === 'offer-needs-revisions' ? this.t('om_needs_revisions', 'Choose between 0 and 20 revisions.')
        : code === 'offer-needs-validity' ? this.t('om_needs_validity', 'Choose how long the offer stays open.')
        : code === 'offer-needs-message' ? this.t('om_needs_message', 'Write a short message to the student.')
        : this.problem(error, this.t('om_offer_failed', 'Could not send the offer.')));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Choosing an offer reserves the request for paying that teacher, for a limited time,
   * so it asks first. It does not create an order and does not leave the page.
   */
  async choose(offer: Offer): Promise<void> {
    const request = this.selected();
    if (!request || !this.canSelect()) return;
    const confirmed = await this.dialogs.confirm({
      title: this.t('om_select_title', 'Choose this offer?'),
      body: this.t('om_select_body', 'The request is reserved for this teacher while you pay. Other offers stay on hold.'),
      confirmLabel: this.t('om_choose_offer', 'Choose offer')
    });
    if (!confirmed) return;

    this.busy.set(true);
    try {
      await this.selectOfferUseCase.execute(request, offer);
      this.toasts.show(this.t('om_selected', 'Offer chosen. The request is reserved for payment.'));
    } catch (error) {
      const conflict = error instanceof HttpErrorResponse && error.status === 409;
      this.toasts.show(conflict
        ? this.t('om_select_stale', 'This request or offer changed. The latest version is shown; try again.')
        : this.problem(error, this.t('om_select_failed', 'Could not choose the offer.')));
    } finally {
      this.busy.set(false);
    }
    await this.load();
  }

  /** The API's own sentence (translated when the vocabulary has its code), else the fallback. */
  private problem(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) return fallback;
    const body = (error.error ?? {}) as ProblemDetailsDto;
    return (body.code ? this.locale.t(`err_${body.code}`, '') : '') || body.detail || fallback;
  }
}
