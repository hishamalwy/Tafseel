import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { SupportCase, SupportWords, helpShellRole } from '../models/support';
import { SupportGateway } from '../services/support.gateway';
import { SUPPORT_STYLES } from './support-shared';

/** One report, as its reporter follows it: the reference to quote, Tafseel's replies, files, and the outcome. */
@Component({
  selector: 'tf-help-case-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, WorkspaceShellComponent],
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
          @if (c.outcome) {
            <div class="tf-help-outcome" data-testid="help-case-outcome"><strong>{{ t('help_outcome', 'What Tafseel did') }}</strong>{{ c.outcome }}</div>
          }
          <section class="tf-help-card" aria-labelledby="help-case-report">
            <h2 id="help-case-report">{{ t('help_your_report', 'Your report') }}</h2>
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
                  <textarea id="help-reply" name="reply" maxlength="4000" data-testid="help-reply" [ngModel]="reply()" (ngModelChange)="reply.set($event)"></textarea>
                </div>
                <div class="tf-field">
                  <label for="help-file">{{ t('help_attach', 'Add a screenshot or file (PDF, PNG, JPEG, TXT; up to 5)') }}</label>
                  <input id="help-file" type="file" accept="image/png,image/jpeg,application/pdf,text/plain" (change)="attach(c, $event)" [disabled]="busy()" data-testid="help-file">
                </div>
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
    .tf-fin-muted { margin: 0; color: var(--text-2); font-size: 14px; line-height: 1.6; }
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

  async send(c: SupportCase): Promise<void> {
    if (!this.reply().trim() || this.busy()) return;
    await this.run(async () => { this.item.set(await this.gateway.message(c.id, this.reply().trim(), c.version)); this.reply.set(''); });
  }

  async attach(c: SupportCase, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.run(async () => { this.item.set(await this.gateway.attach(c.id, file, c.version)); });
    input.value = '';
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
