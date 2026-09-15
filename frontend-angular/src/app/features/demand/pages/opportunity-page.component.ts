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
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import { Demand, DraftProblem, OFFER_LIMITS, OFFER_STATUS, OfferDraft, OpenRequest, REQUEST_STATUS } from '../models/demand';
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
  readonly busy = signal(false);
  readonly error = signal('');
  readonly problems = computed(() => this.attempted() ? Demand.offerProblems(this.draft()) : {});
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
    return problem ? this.locale.format(`demand_problem_${problem}`, { max: OFFER_LIMITS.message }, problem) : '';
  }

  set(field: keyof OfferDraft, value: unknown): void {
    this.draft.update(d => ({ ...d, [field]: field === 'message' ? String(value ?? '') : (value === '' || value === null ? null : Number(value)) }));
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const request = await this.load.execute(this.requestId);
      this.request.set(request);
      this.editing.set(false);
      this.draft.set(request.myOffer ? Demand.offerDraft(request.myOffer, Date.now()) : Demand.emptyOffer());
      this.attempted.set(false);
    } catch (error) {
      this.loadError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.busy()) return;
    this.attempted.set(true);
    this.error.set('');
    if (Object.keys(Demand.offerProblems(this.draft())).length) return;
    this.busy.set(true);
    try {
      const updating = Demand.canEditOffer(this.myOffer());
      await this.offers.save(this.requestId, this.myOffer(), this.draft());
      await this.refresh();
      this.toasts.show(updating ? this.t('demand_offer_updated', 'Offer updated.') : this.t('demand_offer_sent', 'Offer sent to the student.'));
    } catch (error) {
      if (!(error instanceof DraftInvalid)) {
        this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
        await this.refresh();
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
