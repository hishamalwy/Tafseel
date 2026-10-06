import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { problemMessage } from '@core/http/problem-message';
import { LocaleService } from '@core/i18n/locale.service';
import { DialogService } from '@shared/services/dialog.service';
import { injectFocusFirstInvalid } from '@shared/utils/form-focus';
import {
  CREDENTIAL_LIMITS, Credential, CredentialDraft, CredentialForm, CredentialKind, FieldProblem
} from '../models/teacher-profile';
import { FormInvalid, ManageCredentials } from '../services/teacher-setup.use-cases';

/** Certifications or work experience: the saved entries, and a form to add one. */
@Component({
  selector: 'tf-credential-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="tf-profile-editor-card" [attr.aria-labelledby]="kind() + '-title'" [attr.data-testid]="kind() + '-card'">
      <div>
        <h2 [id]="kind() + '-title'">{{ kind() === 'certifications' ? t('setup_certifications', 'Certifications') : t('setup_experience', 'Experience') }}</h2>
        <p>{{ kind() === 'certifications' ? t('setup_certifications_intro', 'Degrees, licences and courses students can trust.') : t('setup_experience_intro', 'Where you have taught or worked in your subject.') }}</p>
      </div>
      @if (items().length) {
        <ul class="tf-credential-items">
          @for (item of items(); track item.id) {
            <li>
              <span><strong>{{ item.title }}</strong><small>{{ item.organization }}@if (item.from || item.to) { · {{ item.from || '…' }} – {{ item.to || t('setup_present', 'present') }} }</small></span>
              <button type="button" class="tf-button tf-button-ghost tf-button-sm" (click)="remove(item)" [disabled]="busy()"
                      [attr.aria-label]="t('common_remove', 'Remove') + ': ' + item.title">{{ t('common_remove', 'Remove') }}</button>
            </li>
          }
        </ul>
      } @else {
        <p class="tf-muted">{{ t('setup_credentials_empty', 'Nothing added yet.') }}</p>
      }
      <form class="tf-form" (ngSubmit)="add()" novalidate>
        <div class="tf-grid-2">
          <div class="tf-field">
            <label [for]="kind() + '-title-input'">{{ t('setup_credential_title', 'Title') }}</label>
            <input autocomplete="off" [id]="kind() + '-title-input'" name="title" [ngModel]="draft().title" (ngModelChange)="set('title', $event)"
                   [attr.maxlength]="limits.title" [attr.aria-invalid]="!!problems().title">
            @if (problems().title) { <span class="tf-field-error">{{ problem(problems().title!) }}</span> }
          </div>
          <div class="tf-field">
            <label [for]="kind() + '-org-input'">{{ t('setup_credential_organization', 'Organization') }}</label>
            <input autocomplete="off" [id]="kind() + '-org-input'" name="organization" [ngModel]="draft().organization" (ngModelChange)="set('organization', $event)"
                   [attr.maxlength]="limits.organization" [attr.aria-invalid]="!!problems().organization">
            @if (problems().organization) { <span class="tf-field-error">{{ problem(problems().organization!) }}</span> }
          </div>
          <div class="tf-field">
            <label [for]="kind() + '-from-input'">{{ t('setup_credential_from', 'From (optional)') }}</label>
            <input autocomplete="off" [id]="kind() + '-from-input'" name="from" type="date" [ngModel]="draft().from" (ngModelChange)="set('from', $event)">
          </div>
          <div class="tf-field">
            <label [for]="kind() + '-to-input'">{{ t('setup_credential_to', 'To (optional)') }}</label>
            <input autocomplete="off" [id]="kind() + '-to-input'" name="to" type="date" [ngModel]="draft().to" (ngModelChange)="set('to', $event)" [attr.aria-invalid]="!!problems().to">
            @if (problems().to) { <span class="tf-field-error">{{ problem(problems().to!) }}</span> }
          </div>
        </div>
        @if (error()) { <div class="tf-alert" data-kind="error" role="alert">{{ error() }}</div> }
        <div class="tf-form-actions"><button type="submit" class="tf-button tf-button-secondary" [disabled]="busy()">{{ busy() ? t('common_saving', 'Saving…') : t('common_add', 'Add') }}</button></div>
      </form>
    </section>
  `,
  styles: `
    .tf-credential-items { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .tf-credential-items li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--r-sm); }
    .tf-credential-items span { display: grid; gap: 2px; min-width: 0; }
    .tf-credential-items small { color: var(--muted); }
  `
})
export class CredentialListComponent {
  readonly kind = input.required<CredentialKind>();
  readonly items = input.required<readonly Credential[]>();
  readonly changed = output<void>();
  private readonly credentials = inject(ManageCredentials);
  private readonly dialogs = inject(DialogService);
  private readonly locale = inject(LocaleService);
  readonly limits = CREDENTIAL_LIMITS;

  readonly draft = signal<CredentialDraft>(CredentialForm.empty());
  readonly attempted = signal(false);
  private readonly focusFirstInvalid = injectFocusFirstInvalid();
  readonly busy = signal(false);
  readonly error = signal('');
  readonly problems = computed(() => this.attempted() ? CredentialForm.problems(this.draft()) : {});

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  problem(problem: FieldProblem): string { return this.locale.format(`setup_problem_${problem}`, { max: CREDENTIAL_LIMITS.title }, problem); }
  set(field: keyof CredentialDraft, value: string): void { this.draft.update(d => ({ ...d, [field]: value ?? '' })); }

  async add(): Promise<void> {
    if (this.busy()) return;
    this.attempted.set(true);
    this.error.set('');
    if (Object.keys(CredentialForm.problems(this.draft())).length) return this.focusFirstInvalid();
    this.busy.set(true);
    try {
      await this.credentials.add(this.kind(), this.draft());
      this.draft.set(CredentialForm.empty());
      this.attempted.set(false);
      this.changed.emit();
    } catch (error) {
      if (!(error instanceof FormInvalid)) this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.busy.set(false);
    }
  }

  async remove(item: Credential): Promise<void> {
    if (this.busy() || !await this.dialogs.confirm({
      body: this.locale.format('setup_remove_confirm', { name: item.title }, 'Remove “{name}”?'),
      confirmLabel: this.t('common_remove', 'Remove'), cancelLabel: this.t('common_cancel', 'Cancel'), destructive: true
    })) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.credentials.remove(this.kind(), item.id);
      this.changed.emit();
    } catch (error) {
      this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.busy.set(false);
    }
  }
}
