import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import { SupportCase, SupportWords } from '../models/support';
import { SupportGateway } from '../services/support.gateway';
import { SUPPORT_STYLES } from './support-shared';

/**
 * One report, as its owner handles it: who sent it and how to reach them, the conversation, the files, and the
 * outcome. Taking a report makes it yours; only its owner resolves it.
 */
@Component({
  selector: 'tf-admin-help-case-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, WorkspaceShellComponent],
  template: `
    <tf-workspace-shell role="Admin" section="attention">
      <a class="tf-back-link" routerLink="/admin/help">{{ t('help_queue_title', 'Help and reports') }}</a>
      @if (loading()) {
        <div class="tf-state" data-state="loading" role="status">{{ t('common_loading', 'Loading…') }}</div>
      } @else if (error()) {
        <div class="tf-state" data-state="error" role="alert"><p class="tf-state-title">{{ error() }}</p></div>
      } @else if (item(); as c) {
        <div class="tf-help" data-testid="admin-help-case">
          <header class="tf-help-head">
            <h1>{{ category(c.category) }} · <span class="tf-help-ref">{{ c.reference }}</span></h1>
            <p><span class="tf-badge" [attr.data-tone]="status().tone" data-testid="admin-help-status">{{ t(status().labelKey, status().fallback) }}</span>
              @if (c.ownerName) { · {{ locale.format('help_owned_by', { name: c.ownerName }, 'Owned by {name}') }} }</p>
          </header>
          <section class="tf-help-card" aria-labelledby="admin-help-who">
            <h2 id="admin-help-who">{{ t('help_reporter', 'Reporter') }}</h2>
            <dl class="tf-help-kv">
              @if (c.reporterName) { <dt>{{ t('help_reporter_name', 'Name') }}</dt><dd>{{ c.reporterName }}</dd> }
              @if (c.reporterEmail || c.contactEmail) { <dt>{{ t('help_reporter_email', 'E-mail') }}</dt><dd class="tf-help-ref" data-testid="admin-help-email">{{ c.reporterEmail || c.contactEmail }}</dd> }
              @if (c.contactName) { <dt>{{ t('help_reporter_name', 'Name') }}</dt><dd>{{ c.contactName }}</dd> }
              @if (c.relatedReference) { <dt>{{ t('help_related', 'About') }}</dt><dd class="tf-help-ref">{{ c.relatedReference }}</dd> }
              <dt>{{ t('help_queue_received', 'Received') }}</dt><dd>{{ when(c.createdAt) }}</dd>
            </dl>
            @if (!c.reporterName) { <p class="tf-fin-muted">{{ t('help_signed_out_reply', 'This person could not sign in. Reply by e-mail, then record what you did in the outcome.') }}</p> }
            <p class="tf-help-body">{{ c.description }}</p>
            @if (c.attachments.length) {
              <div class="tf-help-files">
                @for (a of c.attachments; track a.id) {
                  <button type="button" class="tf-button tf-button-secondary" (click)="download(a.id, a.fileName)">{{ a.fileName }}</button>
                }
              </div>
            }
          </section>
          @if (c.outcome) {
            <div class="tf-help-outcome"><strong>{{ t('help_outcome', 'What Tafseel did') }}</strong>{{ c.outcome }}</div>
          }
          <section class="tf-help-card" aria-labelledby="admin-help-thread">
            <h2 id="admin-help-thread">{{ t('help_conversation_staff', 'Conversation with the reporter') }}</h2>
            @if (c.messages.length) {
              <ol class="tf-help-thread">
                @for (m of c.messages; track m.id) {
                  <li [attr.data-mine]="m.mine" [attr.data-staff]="m.fromStaff">
                    <strong>{{ m.fromStaff ? (m.authorName || t('help_team', 'Tafseel team')) : t('help_reporter', 'Reporter') }}</strong>
                    <p>{{ m.body }}</p><time>{{ when(m.createdAt) }}</time>
                  </li>
                }
              </ol>
            }
            @if (c.status !== 2) {
              <div class="tf-help-actions">
                @if (c.status === 0) { <button type="button" class="tf-button" (click)="take(c)" [disabled]="busy()" data-testid="admin-help-take">{{ t('help_take', 'Take this report') }}</button> }
              </div>
              @if (c.reporterName) {
                <form class="tf-help-form" (ngSubmit)="reply(c)" novalidate>
                  <div class="tf-field">
                    <label for="admin-help-reply">{{ t('help_reply_staff', 'Answer the reporter (they are notified)') }}</label>
                    <textarea id="admin-help-reply" name="reply" maxlength="4000" data-testid="admin-help-reply" [ngModel]="message()" (ngModelChange)="message.set($event)"></textarea>
                  </div>
                  <div class="tf-help-actions"><button type="submit" class="tf-button tf-button-secondary" [disabled]="busy()" data-testid="admin-help-send">{{ t('help_send', 'Send') }}</button></div>
                </form>
              }
              <form class="tf-help-form" (ngSubmit)="resolve(c)" novalidate>
                <div class="tf-field">
                  <label for="admin-help-outcome">{{ t('help_outcome_label', 'Outcome the reporter will read') }}</label>
                  <textarea id="admin-help-outcome" name="outcome" maxlength="2000" data-testid="admin-help-outcome" [ngModel]="outcome()" (ngModelChange)="outcome.set($event)"></textarea>
                </div>
                <div class="tf-help-actions"><button type="submit" class="tf-button" [disabled]="busy()" data-testid="admin-help-resolve">{{ t('help_resolve', 'Resolve the report') }}</button></div>
              </form>
            }
            @if (actionError()) { <p class="tf-field-error" role="alert" data-testid="admin-help-error">{{ actionError() }}</p> }
          </section>
        </div>
      }
    </tf-workspace-shell>
  `,
  styles: [SUPPORT_STYLES, `
    .tf-help-body { margin: 0; white-space: pre-line; line-height: 1.7; }
    .tf-fin-muted { margin: 0; color: var(--text-2); font-size: 13px; line-height: 1.6; }
    .tf-help-head h1 .tf-help-ref { font-size: .6em; }
  `]
})
export class AdminHelpCasePageComponent implements OnInit {
  private readonly gateway = inject(SupportGateway);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);
  readonly id = input.required<string>();
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly actionError = signal('');
  readonly message = signal('');
  readonly outcome = signal('');
  readonly item = signal<SupportCase | null>(null);
  readonly status = computed(() => SupportWords.status(this.item()?.status ?? 0));

  constructor() { inject(Title).setTitle(`${this.t('help_queue_title', 'Help and reports')} — Tafseel`); }
  ngOnInit(): void { void this.load(); }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  when(value: string): string { return this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }); }
  category(value: number): string { const w = SupportWords.category(value); return this.t(w.labelKey, w.fallback); }

  async load(): Promise<void> {
    this.loading.set(true);
    try { this.item.set(await this.gateway.find(this.id())); }
    catch (error) { this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text); }
    finally { this.loading.set(false); }
  }

  async take(c: SupportCase): Promise<void> {
    await this.run(async () => { this.item.set(await this.gateway.take(c.id, c.version)); });
  }

  async reply(c: SupportCase): Promise<void> {
    if (!this.message().trim()) return;
    await this.run(async () => { this.item.set(await this.gateway.message(c.id, this.message().trim(), c.version)); this.message.set(''); });
  }

  async resolve(c: SupportCase): Promise<void> {
    if (this.outcome().trim().length < 10) {
      this.actionError.set(this.t('err_support_outcome_required', 'Write the outcome the reporter will read (10 to 2000 characters).'));
      return;
    }
    if (!await this.dialogs.confirm({
      body: this.t('help_resolve_confirm', 'Resolve this report? The reporter reads your outcome and the case closes.'),
      confirmLabel: this.t('help_resolve', 'Resolve the report'), cancelLabel: this.t('common_cancel', 'Cancel')
    })) return;
    await this.run(async () => {
      this.item.set(await this.gateway.resolve(c.id, this.outcome().trim(), c.version));
      this.toasts.show(this.t('help_resolved_done', 'Report resolved.'));
    });
  }

  async download(id: string, name: string): Promise<void> {
    try { await this.gateway.download(id, name); }
    catch (error) { this.actionError.set(problemMessage(error, (k, f) => this.t(k, f)).text); }
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.actionError.set('');
    try { await action(); }
    catch (error) { this.actionError.set(problemMessage(error, (k, f) => this.t(k, f)).text); }
    finally { this.busy.set(false); }
  }
}
