import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { Demand, MyOffer, myOfferOutcome } from '../models/demand';
import { LoadMyOffers } from '../services/demand.use-cases';

/**
 * Every offer the teacher has sent, and what became of it (UX-82, DEC-UX-05). An offer used to vanish once
 * the request closed to other teachers; now the teacher can see that another teacher was selected, that the
 * student closed the request, or that it became their order — without asking anyone.
 */
@Component({
  selector: 'tf-my-offers-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, WorkspaceShellComponent],
  template: `
    <tf-workspace-shell role="Teacher" section="opportunities">
      <header class="tf-page-header" data-face="sans">
        <div class="tf-stack">
          <h1>{{ t('my_offers_title', 'My offers') }}</h1>
          <p class="tf-page-header-desc">{{ t('my_offers_intro', 'Every offer you sent, and what happened to it.') }}</p>
        </div>
      </header>

      @if (loading()) {
        <div class="tf-state" data-state="loading" role="status">{{ t('common_loading', 'Loading…') }}</div>
      } @else if (error()) {
        <div class="tf-state" data-state="error" role="alert">
          <h2 class="tf-state-title">{{ t('my_offers_failed', 'We couldn’t load your offers.') }}</h2>
          <p class="tf-state-body">{{ error() }}</p>
          <div class="tf-action-row"><button type="button" class="tf-button" (click)="refresh()">{{ t('common_retry', 'Retry') }}</button></div>
        </div>
      } @else if (!offers().length) {
        <div class="tf-state" data-state="empty" data-testid="my-offers-empty">
          <h2 class="tf-state-title">{{ t('my_offers_empty', 'You have not sent an offer yet.') }}</h2>
          <p class="tf-state-body">{{ t('my_offers_empty_body', 'Open requests are posted by students who have not chosen a teacher. Send an offer on one that fits you.') }}</p>
          <div class="tf-action-row"><a class="tf-button" routerLink="/teacher/opportunities">{{ t('demand_opportunity_to_list', 'See open requests') }}</a></div>
        </div>
      } @else {
        <ul class="tf-my-offers" data-testid="my-offers">
          @for (offer of offers(); track offer.id) {
            @let outcome = outcomeOf(offer);
            <li class="tf-profile-editor-card" data-testid="my-offer-row" [attr.data-outcome]="outcome.key">
              <div class="tf-my-offer-head">
                <div>
                  <span class="tf-page-header-eyebrow">{{ names(offer) }}</span>
                  <h2>{{ offer.requestTitle }}</h2>
                </div>
                <span class="tf-badge" [attr.data-tone]="outcome.tone">{{ t(outcome.key, outcome.fallback) }}</span>
              </div>
              <p class="tf-muted">{{ locale.format('my_offers_terms', { price: fmt.money(offer.amount, offer.currency), time: fmt.duration(offer.deliveryHours) }, 'You offered {price}, delivered in {time}.') }}
                · {{ fmt.relative(offer.updatedAt) }}</p>
              @if (outcome.link; as link) {
                <div class="tf-action-row"><a class="tf-button tf-button-secondary" [routerLink]="link.path">{{ t(link.key, link.fallback) }}</a></div>
              }
            </li>
          }
        </ul>
      }
    </tf-workspace-shell>
  `,
  styles: `
    .tf-my-offers { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
    .tf-my-offer-head { display: flex; gap: 12px; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; }
    .tf-my-offer-head h2 { margin: 2px 0 0; font-size: 17px; }
  `
})
export class MyOffersPageComponent {
  private readonly load = inject(LoadMyOffers);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly offers = signal<readonly MyOffer[]>([]);

  constructor() {
    inject(Title).setTitle(`${this.t('my_offers_title', 'My offers')} — Tafseel`);
    void this.refresh();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  outcomeOf(offer: MyOffer) { return myOfferOutcome(offer); }

  names(offer: MyOffer): string {
    const rtl = this.locale.isRtl();
    return [Demand.localName({ name: offer.subjectName, nameArabic: offer.subjectNameArabic ?? '' }, rtl),
      Demand.localName({ name: offer.serviceName, nameArabic: offer.serviceNameArabic ?? '' }, rtl)].filter(Boolean).join(' · ');
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.offers.set(await this.load.execute());
    } catch (e) {
      this.error.set(problemMessage(e, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
    }
  }
}
