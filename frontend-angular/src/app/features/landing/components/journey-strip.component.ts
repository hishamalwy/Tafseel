import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { PriceComponent } from '@shared/components/price.component';
import {
  JourneyItem, LEARNING_REQUEST_STATUS, StudentJourney, requestStatusKey, reservationMinutes
} from '@shared/models/student-journey';
import { JourneyOffer } from '../services/landing.ports';
import { landingCopy } from '../content/landing.copy';

/** How many recent requests the strip lists beneath the promoted one. */
const RECENT_LIMIT = 3;

/**
 * A signed-in Student's real request context, below the fold.
 *
 * It never competes with the hero and it is not a second dashboard: at most one
 * promoted action, at most three recent rows, no filter, no table, no history.
 * The action-required request is promoted into its own module, so it is never
 * repeated in the list below it.
 */
@Component({
  selector: 'tf-journey-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PriceComponent],
  templateUrl: './journey-strip.component.html',
  styles: `:host { display: contents; }`
})
export class JourneyStripComponent {
  private readonly locale = inject(LocaleService);
  private readonly fmt = inject(FormatService);

  readonly journey = input.required<StudentJourney>();
  readonly selectedOffer = input<JourneyOffer | null>(null);

  private readonly isArabic = computed(() => this.locale.lang() === 'ar');
  readonly copy = computed(() => landingCopy(this.isArabic()));

  readonly action = computed(() => this.journey().actionRequired);

  readonly recent = computed(() => {
    const promoted = this.action();
    return this.journey().items
      .filter(item => !promoted || item.id !== promoted.id)
      .slice(0, RECENT_LIMIT)
      .map(item => ({
        id: item.id,
        title: item.title || this.copy().journeyUntitled,
        sourcingLabel: this.locale.t(item.sourcingKey, ''),
        isOpen: item.isOpen,
        statusLabel: this.statusLabel(item),
        deadlineLabel: item.deadline
          ? this.copy().journeyDuePrefix
            + this.fmt.date(item.deadline, { month: 'short', day: 'numeric' })
          : '',
        ctaLabel: item.hasOffers ? this.copy().journeyReviewOffers : this.copy().journeyView
      }));
  });

  readonly actionTitle = computed(() =>
    this.action()?.title || this.copy().journeyUntitled);

  /**
   * Commercial terms come from the selected Offer, which is the record the
   * reservation actually locked — not from the request, which carries only what
   * the Student asked for.
   */
  readonly facts = computed(() => {
    const item = this.action();
    if (!item) return [];
    const offer = this.selectedOffer();
    const teacher = item.teacher
      || offer?.teacherDisplayName || offer?.teacherDisplayNameEnglish || '';

    const facts: { label: string; value: string }[] = [];
    if (teacher) facts.push({ label: this.copy().journeyTeacher, value: teacher });

    if (offer?.deliveryHours) {
      facts.push({
        label: this.copy().journeyDelivery,
        value: this.isArabic()
          ? `خلال ${this.fmt.number(offer.deliveryHours)} ساعة`
          : `${this.fmt.number(offer.deliveryHours)}h`
      });
    } else if (item.deadline) {
      facts.push({
        label: this.copy().journeyDelivery,
        value: this.fmt.date(item.deadline, { month: 'short', day: 'numeric' })
      });
    }
    return facts;
  });

  readonly price = computed(() => {
    const offer = this.selectedOffer();
    return this.action() && offer?.amount != null ? offer : null;
  });

  /**
   * The deadline is the server's `PaymentReservationExpiresAt`. Once it has
   * elapsed the Student is told so plainly — inventing remaining minutes here
   * would be fake urgency.
   */
  readonly reservationLabel = computed(() => {
    const item = this.action();
    if (!item) return '';
    const minutes = reservationMinutes(item);
    if (item.reservationExpired || minutes === null) {
      return this.locale.t('sd_market_reservation_expired', 'The payment reservation has expired.');
    }
    return this.copy().journeyReservationPrefix
      + this.fmt.number(minutes) + this.copy().journeyReservationSuffix;
  });

  /** Direct requests keep the canonical lifecycle wording the dashboard uses. */
  private statusLabel(item: JourneyItem): string {
    if (item.awaitingPayment) {
      return item.reservationExpired
        ? this.locale.t('sd_market_reservation_expired', 'Reservation expired')
        : this.copy().journeyAwaitingPayment;
    }
    if (item.isOpen && item.status === LEARNING_REQUEST_STATUS.OPEN_FOR_OFFERS) {
      const count = item.offerCount ?? 0;
      if (count > 0) {
        const number = this.fmt.number(count);
        return this.isArabic()
          ? `${number} عروض`
          : `${number} ${count === 1 ? 'Offer' : 'Offers'}`;
      }
      return this.copy().journeyWaitingOffers;
    }
    return this.locale.t(requestStatusKey(item.status), '');
  }
}
