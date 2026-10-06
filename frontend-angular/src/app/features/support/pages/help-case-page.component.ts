import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { FilePickerComponent } from '@shared/components/file-picker.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { SupportCase, SupportWords, helpShellRole } from '../models/support';
import { SupportGateway } from '../services/support.gateway';
import { SUPPORT_STYLES } from './support-shared';

/** One report, as its reporter follows it: the reference to quote, Tafseel's replies, files, and the outcome. */
@Component({
  selector: 'tf-help-case-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, FilePickerComponent, WorkspaceShellComponent],
  template: `
    <tf-workspace-shell [role]="shellRole()" section="help">
      <a class="tf-back-link" routerLink="/help">{{ t('help_back', 'Help and reports') }}</a>
      @if (loading()) {
        <div class="tf-state" data-state="loading" role="status">{{ t('common_loading', 'Loading…') }}</div>
      } @else if (error()) {
        <div class="tf-state" data-state="error" role="alert"><p class="tf-state-title">{{ error() }}</p></div>
      } @else if (item(); as c) {
        <div class="tf-help" data-testid="help-case">
          @if (sent()) {
            <p class="tf-help-received" role="status" data-testid="help-received">{{ locale.format('help_received', { reference: c.reference },
              'Your report was received. Its reference is {reference}. We will answer here and e-mail you.') }}</p>
          }
          <header class="tf-help-head">
            <h1>{{ category(c.category) }}</h1>
            <p><span class="tf-badge" [attr.data-tone]="status().tone" data-testid="help-case-status">{{ t(status().labelKey, status().fallback) }}</span>
              · <span class="tf-help-ref" data-testid="help-case-reference">{{ c.reference }}</span> · {{ when(c.createdAt) }}</p>
          </header>
          <section class="tf-help-card" aria-labelledby="help-next-title" data-testid="help-next">
            <h2 id="help-next-title">{{ t('help_next_title', 'What happens next') }}</h2>
            <ol class="tf-help-steps">
              @for (step of steps; track step.status) {
                <li [attr.data-state]="c.status > step.status ? 'done' : c.status === step.status ? 'current' : 'next'"
                    [attr.aria-current]="c.status === step.status ? 'step' : null">
                  <strong>{{ t(step.titleKey, step.title) }}</strong>
                  <span>{{ t(step.bodyKey, step.body) }}</span>
                </li>
              }
            </ol>
            <div class="tf-help-actions">
              @if (c.status !== 2) {
                <a class="tf-button" href="#help-reply" (click)="focusReply($event)" data-testid="help-add-info">{{ t('help_add_info', 'Add information or a screenshot') }}</a>
              }
              <a class="tf-button tf-button-secondary" routerLink="/help">{{ t('help_all_reports', 'All my reports') }}</a>
              @if (c.category === 3) {
                <a class="tf-button tf-button-ghost" routerLink="/disputes">{{ t('help_money_dispute', 'Money back for a session or order? Open a dispute') }}</a>
              }
            </div>
          </section>
          @if (c.outcome) {
            <div class="tf-help-outcome" data-testid="help-case-outcome"><strong>{{ t('help_outcome', 'What Tafseel did') }}</strong>{{ c.outcome }}</div>
          }
          <section class="tf-help-card" aria-labelledby="help-case-report">
            <h2 id="help-case-report">{{ t('help_your_report', 'Your report') }}</h2>
            <dl class="tf-help-kv" data-testid="help-case-details">
              <dt>{{ t('help_detail_category', 'About') }}</dt><dd>{{ category(c.category) }}</dd>
              <dt>{{ t('help_detail_reference', 'Reference') }}</dt><dd><span class="tf-help-ref">{{ c.reference }}</span></dd>
              <dt>{{ t('help_detail_sent', 'Sent') }}</dt><dd>{{ when(c.createdAt) }}</dd>
              @if (c.relatedReference) { <dt>{{ t('help_related', 'About') }}</dt><dd><span class="tf-help-ref">{{ c.relatedReference }}</span></dd> }
              <dt>{{ t('help_detail_updated', 'Last update') }}</dt><dd>{{ when(c.updatedAt) }}</dd>
              @if (c.resolvedAt) { <dt>{{ t('help_detail_resolved', 'Resolved') }}</dt><dd>{{ when(c.resolvedAt) }}</dd> }
              <dt>{{ t('help_detail_files', 'Files') }}</dt><dd>{{ c.attachments.length ? fmt.number(c.attachments.length) : t('help_detail_no_files', 'None yet') }}</dd>
            </dl>
            <p class="tf-help-body">{{ c.description }}</p>
            @if (c.attachments.length) {
              <div class="tf-help-files">
                @for (a of c.attachments; track a.id) {
                  <button type="button" class="tf-button tf-button-secondary" (click)="download(a.id, a.fileName)">{{ a.fileName }}</button>
                }
              </div>
            }
          </section>
          <section class="tf-help-card" aria-labelledby="help-case-thread">
            <h2 id="help-case-thread">{{ t('help_conversation', 'Conversation with Tafseel') }}</h2>
            @if (c.messages.length) {
              <ol class="tf-help-thread" data-testid="help-thread">
                @for (m of c.messages; track m.id) {
                  <li [attr.data-mine]="m.mine" [attr.data-staff]="m.fromStaff" data-testid="help-message">
                    <strong>{{ m.mine ? t('help_you', 'You') : t('help_team', 'Tafseel team') }}</strong>
                    <p>{{ m.body }}</p><time>{{ when(m.createdAt) }}</time>
                  </li>
                }
              </ol>
            } @else {
              <p class="tf-fin-muted">{{ c.status === 0 ? t('help_waiting', 'A person on the Tafseel team will read your report and answer here.') : t('help_no_messages', 'No messages yet.') }}</p>
            }
            @if (c.status !== 2) {
              <form class="tf-help-form" (ngSubmit)="send(c)" novalidate>
                <div class="tf-field">
                  <label for="help-reply">{{ t('help_reply', 'Add to your report') }}</label>
                  <textarea autocomplete="off" id="help-reply" name="reply" maxlength="4000" data-testid="help-reply" [ngModel]="reply()" (ngModelChange)="reply.set($event)"></textarea>
                </div>
                <tf-file-picker inputId="help-file" testId="help-file" [compact]="true" [removable]="false"
                                accept="image/png,image/jpeg,application/pdf,text/plain" [busy]="busy()"
                                [title]="t('help_attach', 'Add a screenshot or file (PDF, PNG, JPEG, TXT; up to 5)')"
                                (picked)="attach(c, $event)" />
                @if (actionError()) { <p class="tf-field-error" role="alert" data-testid="help-error">{{ actionError() }}</p> }
                <div class="tf-help-actions"><button type="submit" class="tf-button" [disabled]="busy()" data-testid="help-send">{{ t('help_send', 'Send') }}</button></div>
              </form>
            }
          </section>
        </div>
      }
    </tf-workspace-shell>
  `,
  styles: [SUPPORT_STYLES, `
    .tf-help-body { margin: 0; white-space: pre-line; line-height: 1.7; }
    .tf-fin-muted { margin: 0; color: var(--text-2); font-size: var(--type-body-sm-size); line-height: 1.6; }
    .tf-help-steps { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; counter-reset: step; }
    .tf-help-steps li { position: relative; display: grid; gap: 2px; padding-block: 0 16px; padding-inline-start: 36px; counter-increment: step; }
    .tf-help-steps li:last-child { padding-block-end: 0; }
    .tf-help-steps li::before { content: counter(step); position: absolute; inset-inline-start: 0; inset-block-start: 0; display: grid; place-items: center;
      inline-size: 24px; block-size: 24px; border-radius: 999px; border: 1px solid var(--border-strong); background: var(--surface);
      color: var(--text-2); font-size: var(--type-meta-size); font-weight: 700; }
    .tf-help-steps li:not(:last-child)::after { content: ""; position: absolute; inset-inline-start: 11px; inset-block: 26px 2px; border-inline-start: 2px solid var(--border); }
    .tf-help-steps li[data-state='done']::before { content: "✓"; background: var(--success-soft); border-color: var(--success); color: var(--success); }
    .tf-help-steps li[data-state='current']::before { background: var(--primary); border-color: var(--primary); color: var(--primary-ink); }
    .tf-help-steps li[data-state='next'] { color: var(--text-2); }
    .tf-help-steps strong { font-size: var(--type-body-size); }
    .tf-help-steps span { color: var(--text-2); font-size: var(--type-body-sm-size); line-height: 1.6; }
    .tf-help-actions a.tf-button { min-height: 44px; text-decoration: none; }
  `]
})
export class HelpCasePageComponent implements OnInit {
  private readonly gateway = inject(SupportGateway);
  private readonly session = inject(SESSION_STORE);
  private readonly route = inject(ActivatedRoute);
  readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);
  readonly id = input.required<string>();
  readonly shellRole = computed(() => helpShellRole(this.session.current()?.roles));
  readonly sent = signal(this.route.snapshot.queryParamMap.get('sent') === '1');
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly actionError = signal('');
  readonly reply = signal('');
  readonly item = signal<SupportCase | null>(null);
  readonly status = computed(() => SupportWords.status(this.item()?.status ?? 0));
  /** The reporter's three steps, keyed by the case status that each one is. */
  readonly steps = [
    { status: 0, titleKey: 'help_step_received', title: 'Received',
      bodyKey: 'help_step_received_body', body: 'Your report is in the Tafseel team’s queue with its reference. Nobody else can see it.' },
    { status: 1, titleKey: 'help_step_handling', title: 'Being handled',
      bodyKey: 'help_step_handling_body', body: 'A person on the team has taken it. They may ask you a question here; you are notified and e-mailed.' },
    { status: 2, titleKey: 'help_step_resolved', title: 'Resolved',
      bodyKey: 'help_step_resolved_body', body: 'You read here what Tafseel did about it. You can still open a new report at any time.' }
  ] as const;

  constructor() { inject(Title).setTitle(`${this.t('help_title', 'Help and reports')} — Tafseel`); }
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

  focusReply(event: Event): void {
    event.preventDefault();
    const field = document.getElementById('help-reply');
    field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field?.focus({ preventScroll: true });
  }

  async send(c: SupportCase): Promise<void> {
    if (!this.reply().trim() || this.busy()) return;
    await this.run(async () => { this.item.set(await this.gateway.message(c.id, this.reply().trim(), c.version)); this.reply.set(''); });
  }

  async attach(c: SupportCase, files: readonly File[]): Promise<void> {
    const file = files[0];
    if (!file) return;
    await this.run(async () => { this.item.set(await this.gateway.attach(c.id, file, c.version)); });
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
