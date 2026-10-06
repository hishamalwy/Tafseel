import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { PriceComponent } from '@shared/components/price.component';
import { ToastComponent } from '@shared/components/toast.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { durationChoices } from '@shared/models/duration';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import { injectFocusFirstInvalid } from '@shared/utils/form-focus';
import { Demand, DraftProblem, MyOffer, OFFER_LIMITS, OFFER_STATUS, OfferDraft, OfferTerms, OpenRequest, REQUEST_STATUS, myOfferOutcome } from '../models/demand';
import { DraftInvalid, LoadOpportunity, ManageOffer } from '../services/demand.use-cases';

/**
 * An open request a qualified teacher can bid on (J4-05): the request as the endpoint shares it
 * (no student identity), and the teacher's own offer - submit, change or withdraw while it is only
 * submitted, resubmit once withdrawn.
 */
@Component({
  selector: 'tf-opportunity-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, WorkspaceShellComponent, ToastComponent, PriceComponent],
  templateUrl: './opportunity-page.component.html',
  styleUrl: '../../../shared/styles/workspace-detail.css'
})
export class OpportunityPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly load = inject(LoadOpportunity);
  private readonly offers = inject(ManageOffer);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  readonly Demand = Demand;
  readonly OFFER_STATUS = OFFER_STATUS;
  readonly limits = OFFER_LIMITS;

  requestId = '';
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly request = signal<OpenRequest | null>(null);
  readonly editing = signal(false);
  readonly draft = signal<OfferDraft>(Demand.emptyOffer());
  readonly attempted = signal(false);
  private readonly focusFirstInvalid = injectFocusFirstInvalid();
  readonly busy = signal(false);
  readonly error = signal('');
  readonly terms = signal<OfferTerms | null>(null);
  /** The teacher's offer on a request they can no longer open, to say what happened (UX-82). */
  readonly pastOffer = signal<MyOffer | null>(null);
  readonly problems = computed(() => this.attempted() ? Demand.offerProblems(this.draft(), this.terms()) : {});
  readonly deliveryChoices = computed(() => durationChoices(this.terms()?.minDeliveryHours ?? 1,
    this.terms()?.maxDeliveryHours ?? OFFER_LIMITS.hoursMax, this.draft().deliveryHours));
  readonly validityChoices = computed(() => durationChoices(1, OFFER_LIMITS.validityMax, this.draft().validityHours));
  readonly revisionChoices = computed(() => Array.from({ length: (this.terms()?.maxRevisions ?? OFFER_LIMITS.revisionsMax) + 1 }, (_, i) => i));
  readonly outcome = computed(() => { const o = this.pastOffer(); return o ? myOfferOutcome(o) : null; });
  readonly myOffer = computed(() => this.request()?.myOffer ?? null);
  readonly reservedForMe = computed(() => {
    const r = this.request();
    return !!r && r.status === REQUEST_STATUS.AWAITING_PAYMENT && r.myOffer?.status === OFFER_STATUS.SELECTED;
  });
  readonly showForm = computed(() => {
    const r = this.request(), mine = this.myOffer();
    if (!r || r.status !== REQUEST_STATUS.OPEN_FOR_OFFERS) return false;
    return !mine || this.editing() || Demand.canResubmitOffer(mine);
  });

  constructor() {
    inject(Title).setTitle(`${this.t('demand_opportunity_title', 'Opportunity')} — Tafseel`);
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.requestId = params.get('requestId') ?? '';
      void this.refresh();
    });
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  date(value: string): string { return value ? this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }

  problem(field: keyof OfferDraft): string {
    const problem: DraftProblem | undefined = this.problems()[field];
    if (problem === 'price_range') {
      const terms = this.terms(), currency = this.request()?.currency ?? 'SAR';
      return this.locale.format('demand_problem_price_range',
        { min: this.fmt.money(terms?.minPrice ?? 0, currency), max: this.fmt.money(terms?.maxPrice ?? 0, currency) },
        'Enter a price between {min} and {max}.');
    }
    return problem ? this.locale.format(`demand_problem_${problem}`, { max: OFFER_LIMITS.message }, problem) : '';
  }

  set(field: keyof OfferDraft, value: unknown): void {
    this.draft.update(d => ({ ...d, [field]: field === 'message' ? String(value ?? '') : (value === '' || value === null ? null : Number(value)) }));
  }

  async refresh(): Promise<void> {
    // Moving to another one while this load is in flight must not let its late answer paint the other.
    const requestId = this.requestId;
    this.loading.set(true);
    this.loadError.set('');
    try {
      const request = await this.load.execute(requestId);
      if (requestId !== this.requestId) return;
      // The service's limits are read before the form appears: arriving later, they reset the form under a
      // teacher who had already started typing (found in the Round 3 browser run).
      const terms = await this.load.terms(request.serviceTypeId);
      if (requestId !== this.requestId) return;
      this.terms.set(terms);
      this.request.set(request);
      this.pastOffer.set(null);
      this.editing.set(false);
      const draft = request.myOffer ? Demand.offerDraft(request.myOffer, Date.now()) : Demand.emptyOffer();
      this.draft.set(terms && !request.myOffer ? Demand.fitOffer(draft, terms) : draft);
      this.attempted.set(false);
    } catch (error) {
      if (requestId !== this.requestId) return;
      this.loadError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
      const past = await this.load.pastOffer(requestId);
      if (requestId === this.requestId) this.pastOffer.set(past);
    } finally {
      if (requestId === this.requestId) this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.busy()) return;
    this.attempted.set(true);
    this.error.set('');
    if (Object.keys(Demand.offerProblems(this.draft(), this.terms())).length) return this.focusFirstInvalid();
    this.busy.set(true);
    try {
      const updating = Demand.canEditOffer(this.myOffer());
      await this.offers.save(this.requestId, this.myOffer(), this.draft());
      await this.refresh();
      this.toasts.show(updating ? this.t('demand_offer_updated', 'Offer updated.') : this.t('demand_offer_sent', 'Offer sent to the student.'));
    } catch (error) {
      if (!(error instanceof DraftInvalid)) {
        this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
        // Read the request again (it may have closed), but keep what the teacher typed so they can correct it.
        const typed = this.draft();
        await this.refresh();
        this.draft.set(typed);
      }
    } finally {
      this.busy.set(false);
    }
  }

  async withdraw(): Promise<void> {
    const mine = this.myOffer();
    if (!mine || this.busy() || !await this.dialogs.confirm({
      body: this.t('demand_withdraw_body', 'Withdraw your offer? The student will no longer see it.'),
      confirmLabel: this.t('demand_withdraw', 'Withdraw offer'), cancelLabel: this.t('common_cancel', 'Cancel'), destructive: true
    })) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.offers.withdraw(mine);
      await this.refresh();
      this.toasts.show(this.t('demand_offer_withdrawn', 'Offer withdrawn.'));
    } catch (error) {
      this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
      await this.refresh();
    } finally {
      this.busy.set(false);
    }
  }
}
