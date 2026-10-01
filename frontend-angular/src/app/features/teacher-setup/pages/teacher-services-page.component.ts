import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { durationChoices } from '@shared/models/duration';
import { ToastComponent } from '@shared/components/toast.component';
import { ToastService } from '@shared/services/toast.service';
import { APPROACH_MAX, OfferTerms, Offering, ServiceOffer, ServiceSubject, ServiceType, TermsField } from '../models/service-offer';
import { NamedItem, localName } from '../models/teacher-profile';
import { FormInvalid, LoadServicesWorkspace, ManageServices, ServicesWorkspace } from '../services/teacher-setup.use-cases';
import { SetupProgressComponent } from '../components/setup-progress.component';

/** Which form is open: adding to a service type, or editing one offering. */
type Editor = { readonly mode: 'create'; readonly typeId: string } | { readonly mode: 'edit'; readonly offeringId: string; readonly typeId: string };

/** Service types a teacher can never pick are hidden unless the teacher already has an offering in them. */
const HIDDEN_STATES = new Set(['catalog_inactive', 'catalog_hidden', 'catalog_unavailable']);

/** My services (J11-07): the teacher chooses from Tafseel's catalog and prices within its range (UX-03). */
@Component({
  selector: 'tf-teacher-services-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgTemplateOutlet, RouterLink, WorkspaceShellComponent, ToastComponent, SetupProgressComponent],
  templateUrl: './teacher-services-page.component.html',
  styles: `
    .tf-services { display: grid; gap: 18px; }
    .tf-service-policy { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .tf-offer-row { display: grid; grid-template-columns: minmax(0, 1.4fr) repeat(3, minmax(0, .8fr)) minmax(0, 1fr) auto; align-items: center; gap: 10px 14px;
      padding: 12px 0; border-block-start: 1px solid var(--border); font-size: 14px; }
    .tf-offer-row small { display: block; color: var(--muted); font-size: 12px; }
    .tf-offer-actions { display: flex; align-items: center; gap: 10px; justify-content: flex-end; }
    .tf-offer-switch { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-size: 13px; }
    .tf-offer-form { padding: 16px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface-2); }
    @media (max-width: 860px) { .tf-offer-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .tf-offer-actions { grid-column: 1 / -1; justify-content: flex-start; } }
  `
})
export class TeacherServicesPageComponent {
  private readonly load = inject(LoadServicesWorkspace);
  private readonly services = inject(ManageServices);
  private readonly toasts = inject(ToastService);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  readonly ServiceOffer = ServiceOffer;
  readonly approachMax = APPROACH_MAX;

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly workspace = signal<ServicesWorkspace | null>(null);
  readonly editor = signal<Editor | null>(null);
  readonly subjectId = signal('');
  readonly terms = signal<OfferTerms>({ price: null, deliveryHours: null, revisions: null, approachEn: '', approachAr: '' });
  readonly attempted = signal(false);
  readonly busy = signal('');
  readonly formError = signal('');
  readonly rowError = signal<{ id: string; text: string } | null>(null);

  readonly eligible = computed(() => new Set((this.workspace()?.eligibleSubjects ?? []).map(subject => subject.id)));
  readonly types = computed(() => (this.workspace()?.types ?? [])
    .filter(type => !HIDDEN_STATES.has(type.availabilityState) || ServiceOffer.current(type).length));
  readonly editingType = computed(() => this.types().find(type => type.id === this.editor()?.typeId) ?? null);
  readonly problems = computed<Partial<Record<TermsField | 'subject', string>>>(() => {
    const type = this.editingType();
    if (!this.attempted() || !type) return {};
    const problems: Partial<Record<TermsField | 'subject', string>> = { ...ServiceOffer.problems(type, this.terms()) };
    if (this.editor()?.mode === 'create' && !this.subjectId()) problems.subject = 'required';
    return problems;
  });

  constructor() {
    inject(Title).setTitle(`${this.t('setup_services_title', 'My services')} — Tafseel`);
    void this.refresh();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  named(item: NamedItem): string { return localName(item, this.locale.isRtl()); }
  typeName(type: ServiceType): string { return localName(type, this.locale.isRtl()); }
  typeDescription(type: ServiceType): string { return (this.locale.isRtl() ? type.descriptionArabic : '') || type.description; }
  money(value: number, currency: string): string { return this.fmt.money(value, currency); }
  sellable(type: ServiceType): readonly ServiceSubject[] { return ServiceOffer.sellableSubjects(type, this.eligible()); }
  subjectName(type: ServiceType, id: string): string {
    const subject = type.subjects.find(s => s.id === id) ?? this.workspace()?.eligibleSubjects.find(s => s.id === id);
    return subject ? localName(subject, this.locale.isRtl()) : '—';
  }
  problem(field: TermsField | 'subject', type: ServiceType): string {
    const problem = this.problems()[field];
    if (!problem) return '';
    if (problem === 'out_of_range') {
      if (field === 'price') return this.locale.format('setup_price_range', { min: this.money(type.minPrice, type.currency), max: this.money(type.maxPrice, type.currency) }, 'Choose a price from {min} to {max}.');
      if (field === 'deliveryHours') return this.locale.format('setup_delivery_range', { min: this.fmt.duration(type.minDeliveryHours ?? 1), max: this.fmt.duration(type.maxDeliveryHours ?? 8760) }, 'Choose between {min} and {max}.');
      if (field === 'revisions') return this.locale.format('setup_revisions_range', { max: type.maxRevisions }, 'Choose between 0 and {max} revisions.');
    }
    return this.locale.format(`setup_problem_${problem}`, { max: APPROACH_MAX }, problem);
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try { this.workspace.set(await this.load.execute()); }
    catch (error) { this.loadError.set(problemMessage(error, (k, f) => this.t(k, f)).text); }
    finally { this.loading.set(false); }
  }

  openCreate(type: ServiceType): void {
    this.editor.set({ mode: 'create', typeId: type.id });
    this.subjectId.set(this.sellable(type)[0]?.id ?? '');
    this.terms.set(ServiceOffer.defaultTerms(type));
    this.attempted.set(false);
    this.formError.set('');
  }

  openEdit(type: ServiceType, offering: Offering): void {
    this.editor.set({ mode: 'edit', offeringId: offering.id, typeId: type.id });
    this.terms.set(ServiceOffer.termsOf(offering));
    this.attempted.set(false);
    this.formError.set('');
  }

  close(): void { this.editor.set(null); this.formError.set(''); }

  /** Delivery lengths a person reads ("2 days"), inside what the service allows; the saved value is always listed. */
  deliveryChoices(type: ServiceType): number[] {
    return durationChoices(type.minDeliveryHours ?? 1, type.maxDeliveryHours ?? 8760, this.terms().deliveryHours);
  }

  revisionChoices(type: ServiceType): number[] {
    return Array.from({ length: Math.max(0, type.maxRevisions) + 1 }, (_, i) => i);
  }

  setTerm(field: TermsField, value: unknown): void {
    this.terms.update(t => ({
      ...t, [field]: field === 'approachEn' || field === 'approachAr' ? String(value ?? '') : (value === '' || value === null ? null : Number(value))
    }));
  }

  isEditing(offering: Offering): boolean {
    const editor = this.editor();
    return editor?.mode === 'edit' && editor.offeringId === offering.id;
  }

  async submit(type: ServiceType): Promise<void> {
    const editor = this.editor(), workspace = this.workspace();
    if (!editor || !workspace || this.busy()) return;
    this.attempted.set(true);
    this.formError.set('');
    if (Object.keys(this.problems()).length) return;
    this.busy.set(editor.mode === 'create' ? `create:${type.id}` : `edit:${editor.offeringId}`);
    try {
      if (editor.mode === 'create') await this.services.create(workspace, type, this.subjectId(), this.terms());
      else {
        const offering = type.offerings.find(o => o.id === editor.offeringId);
        if (!offering) return;
        await this.services.update(type, offering, this.terms());
      }
      this.close();
      await this.refresh();
      this.toasts.show(editor.mode === 'create' ? this.t('setup_service_created', 'Service created and switched on.') : this.t('common_saved', 'Saved.'));
    } catch (error) {
      this.formError.set(error instanceof FormInvalid
        ? this.t('setup_service_subject_not_sellable', 'You can only offer a service in a subject you are approved to teach.')
        : problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.busy.set('');
    }
  }

  async toggle(offering: Offering, active: boolean): Promise<void> {
    if (this.busy()) return;
    this.busy.set(`active:${offering.id}`);
    this.rowError.set(null);
    try {
      await this.services.setActive(offering, active);
      await this.refresh();
      this.toasts.show(active ? this.t('setup_service_on', 'Service switched on.') : this.t('setup_service_off', 'Service switched off.'));
    } catch (error) {
      this.rowError.set({ id: offering.id, text: problemMessage(error, (k, f) => this.t(k, f)).text });
      await this.refresh();
    } finally {
      this.busy.set('');
    }
  }
}
