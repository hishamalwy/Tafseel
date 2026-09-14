import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { ToastComponent } from '@shared/components/toast.component';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import {
  Availability, DAYS_OF_WEEK, ExceptionDraft, ExceptionProblem, REASON_MAX, RuleDraft, RuleProblem, SLOT_RANGE, browserTimeZone,
  timeZoneChoices
} from '../models/availability';
import { AvailabilityException, OwnProfile, WeeklyRule } from '../models/teacher-profile';
import { FormInvalid, LoadOwnProfile, ManageAvailability } from '../services/teacher-setup.use-cases';

const SLOT_CHOICES = [15, 30, 45, 60, 90, 120, 180, 240] as const;

/** Weekly availability and exceptions (J11-08). */
@Component({
  selector: 'tf-teacher-availability-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, WorkspaceShellComponent, ToastComponent],
  templateUrl: './teacher-availability-page.component.html',
  styles: `
    .tf-availability { display: grid; gap: 18px; max-width: 980px; }
    .tf-availability-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .tf-availability-list li { display: grid; grid-template-columns: minmax(90px, .8fr) minmax(0, 1fr) minmax(0, 1.2fr) auto; align-items: center; gap: 8px 14px;
      padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--r-sm); font-size: 14px; }
    .tf-availability-list small { color: var(--muted); font-size: 12px; }
    .tf-availability-list .tf-cluster { justify-content: flex-end; }
    .tf-availability-days { display: flex; flex-wrap: wrap; gap: 2px 16px; margin: 0; padding: 0; border: 0; }
    .tf-availability-days legend { margin-bottom: 6px; font-size: 13px; font-weight: 700; color: var(--text-2); }
    .tf-availability-form { padding: 16px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface-2); }
    .tf-availability-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    time { font-variant-numeric: tabular-nums; }
    @media (max-width: 760px) {
      .tf-availability-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .tf-availability-list li { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .tf-availability-list .tf-cluster { grid-column: 1 / -1; justify-content: flex-start; }
    }
  `
})
export class TeacherAvailabilityPageComponent {
  private readonly loadProfile = inject(LoadOwnProfile);
  private readonly availability = inject(ManageAvailability);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  readonly days = DAYS_OF_WEEK;
  readonly slots = SLOT_CHOICES;
  readonly slotRange = SLOT_RANGE;
  readonly reasonMax = REASON_MAX;
  readonly deviceZone = browserTimeZone();

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly profile = signal<OwnProfile | null>(null);
  /** `''` while adding; the rule id while editing; null when the form is closed. */
  readonly editing = signal<string | null>(null);
  readonly rule = signal<RuleDraft>(Availability.emptyRule(this.deviceZone));
  readonly ruleAttempted = signal(false);
  readonly ruleError = signal('');
  readonly exception = signal<ExceptionDraft>(Availability.emptyException());
  readonly exceptionAttempted = signal(false);
  readonly exceptionError = signal('');
  readonly busy = signal('');

  readonly rules = computed(() => Availability.sorted(this.profile()?.rules ?? []));
  readonly exceptions = computed(() => Availability.sortedExceptions(this.profile()?.exceptions ?? []));
  readonly defaultZone = computed(() => this.profile()?.timeZoneId || this.deviceZone);
  readonly zones = computed(() => timeZoneChoices(this.defaultZone(), this.rule().timeZoneId, ...this.rules().map(r => r.timeZoneId)));
  readonly ruleProblems = computed<readonly RuleProblem[]>(() =>
    this.ruleAttempted() ? Availability.ruleProblems(this.rule(), this.profile()?.rules ?? [], this.editing() ?? '') : []);
  readonly exceptionProblems = computed<readonly ExceptionProblem[]>(() =>
    this.exceptionAttempted() ? Availability.exceptionProblems(this.exception()) : []);

  constructor() {
    inject(Title).setTitle(`${this.t('setup_availability_title', 'Availability')} — Tafseel`);
    void this.refresh();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }

  dayName(day: number): string {
    // 1 January 2023 was a Sunday, which is day 0 for the API.
    return new Intl.DateTimeFormat(this.locale.lang(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + day)));
  }

  instant(value: string): string {
    return this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short', timeZone: this.deviceZone });
  }

  ruleProblem(problem: RuleProblem): string {
    return this.locale.format(`setup_rule_${problem}`, { min: SLOT_RANGE.min, max: SLOT_RANGE.max }, problem);
  }

  exceptionProblem(problem: ExceptionProblem): string {
    return this.locale.format(`setup_exception_${problem}`, { max: REASON_MAX }, problem);
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try { this.profile.set(await this.loadProfile.execute()); }
    catch (error) { this.loadError.set(problemMessage(error, (k, f) => this.t(k, f)).text); }
    finally { this.loading.set(false); }
  }

  openAdd(): void {
    this.editing.set('');
    this.rule.set(Availability.emptyRule(this.defaultZone()));
    this.ruleAttempted.set(false);
    this.ruleError.set('');
  }

  openEdit(rule: WeeklyRule): void {
    this.editing.set(rule.id);
    this.rule.set(Availability.ruleDraft(rule));
    this.ruleAttempted.set(false);
    this.ruleError.set('');
  }

  closeRule(): void { this.editing.set(null); this.ruleError.set(''); }

  toggleDay(day: number, on: boolean): void {
    this.rule.update(r => ({ ...r, days: on ? [...new Set([...r.days, day])] : r.days.filter(d => d !== day) }));
  }

  /** Editing moves one window, so it has one day. */
  setDay(day: number): void { this.rule.update(r => ({ ...r, days: [Number(day)] })); }

  setRule(field: 'start' | 'end' | 'timeZoneId' | 'slotMinutes', value: unknown): void {
    this.rule.update(r => ({ ...r, [field]: field === 'slotMinutes' ? (value === null || value === '' ? null : Number(value)) : String(value ?? '') }));
  }

  setException(field: keyof ExceptionDraft, value: string): void {
    this.exception.update(e => ({ ...e, [field]: value ?? '' }));
  }

  async saveRule(): Promise<void> {
    const profile = this.profile(), editing = this.editing();
    if (!profile || editing === null || this.busy()) return;
    this.ruleAttempted.set(true);
    this.ruleError.set('');
    if (Availability.ruleProblems(this.rule(), profile.rules, editing).length) return;
    await this.run('rule', async () => {
      await this.availability.saveRule(profile.rules, this.rule(), editing);
      this.closeRule();
      this.toasts.show(this.t('setup_rule_saved', 'Weekly availability saved.'));
    }, text => this.ruleError.set(text));
  }

  async removeRule(rule: WeeklyRule): Promise<void> {
    if (this.busy() || !await this.dialogs.confirm({
      body: this.locale.format('setup_rule_remove_confirm', { day: this.dayName(rule.dayOfWeek), start: rule.start, end: rule.end }, 'Remove {day} {start}–{end}?'),
      confirmLabel: this.t('common_remove', 'Remove'), cancelLabel: this.t('common_cancel', 'Cancel'), destructive: true
    })) return;
    await this.run(`rule:${rule.id}`, async () => {
      await this.availability.removeRule(rule.id);
      if (this.editing() === rule.id) this.closeRule();
      this.toasts.show(this.t('setup_rule_removed', 'Window removed.'));
    }, text => this.ruleError.set(text));
  }

  async addException(): Promise<void> {
    if (this.busy()) return;
    this.exceptionAttempted.set(true);
    this.exceptionError.set('');
    if (Availability.exceptionProblems(this.exception()).length) return;
    await this.run('exception', async () => {
      await this.availability.addException(this.exception());
      this.exception.set(Availability.emptyException());
      this.exceptionAttempted.set(false);
      this.toasts.show(this.t('setup_exception_saved', 'Time off added.'));
    }, text => this.exceptionError.set(text));
  }

  async removeException(item: AvailabilityException): Promise<void> {
    if (this.busy() || !await this.dialogs.confirm({
      body: this.t('setup_exception_remove_confirm', 'Remove this time off? Students can book these hours again.'),
      confirmLabel: this.t('common_remove', 'Remove'), cancelLabel: this.t('common_cancel', 'Cancel'), destructive: true
    })) return;
    await this.run(`exception:${item.id}`, async () => {
      await this.availability.removeException(item.id);
      this.toasts.show(this.t('setup_exception_removed', 'Time off removed.'));
    }, text => this.exceptionError.set(text));
  }

  private async run(key: string, work: () => Promise<void>, fail: (text: string) => void): Promise<void> {
    this.busy.set(key);
    try {
      await work();
      await this.refresh();
    } catch (error) {
      if (!(error instanceof FormInvalid)) fail(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.busy.set('');
    }
  }
}
