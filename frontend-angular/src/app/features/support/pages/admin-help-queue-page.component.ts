import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { SUPPORT_CATEGORIES, SupportCaseSummary, SupportCategory, SupportStatus, SupportWords } from '../models/support';
import { SupportGateway } from '../services/support.gateway';
import { SUPPORT_STYLES } from './support-shared';

const STATUS_FILTERS: readonly (readonly [SupportStatus | null, string, string])[] = [
  [null, 'help_filter_waiting', 'Not resolved'],
  [0, 'help_status_open', 'Received'],
  [1, 'help_status_in_progress', 'Being handled'],
  [2, 'help_status_resolved', 'Resolved']
];

/** The help and abuse queue, owned by named Admins at launch. The oldest unowned report comes first. */
@Component({
  selector: 'tf-admin-help-queue-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, WorkspaceShellComponent],
  template: `
    <tf-workspace-shell role="Admin" section="attention">
      <div class="tf-help tf-help--wide">
        <header class="tf-help-head">
          <h1>{{ t('help_queue_title', 'Help and reports') }}</h1>
          <p>{{ t('help_queue_intro', 'Reports from students, teachers and people who cannot sign in. Take a report to own it, answer the reporter here, and resolve it with what was done.') }}</p>
        </header>
        <form class="tf-help-toolbar" (ngSubmit)="load()" role="search" [attr.aria-label]="t('help_queue_search', 'Search reports')">
          <div class="tf-field">
            <label for="help-q">{{ t('help_queue_query', 'Reference, name or e-mail') }}</label>
            <input id="help-q" name="q" type="search" maxlength="200" [ngModel]="query()" (ngModelChange)="query.set($event)">
          </div>
          <div class="tf-field">
            <label for="help-status">{{ t('fin_col_status', 'Status') }}</label>
            <select id="help-status" name="status" [ngModel]="status()" (ngModelChange)="status.set($event); load()">
              @for (f of statuses; track $index) { <option [ngValue]="f[0]">{{ t(f[1], f[2]) }}</option> }
            </select>
          </div>
          <div class="tf-field">
            <label for="help-category">{{ t('help_queue_category', 'About') }}</label>
            <select id="help-category" name="category" [ngModel]="category()" (ngModelChange)="category.set($event); load()">
              <option [ngValue]="null">{{ t('help_queue_all', 'Everything') }}</option>
              @for (c of categories; track c.value) { <option [ngValue]="c.value">{{ t(c.titleKey, c.title) }}</option> }
            </select>
          </div>
          <button type="submit" class="tf-button">{{ t('common_search', 'Search') }}</button>
        </form>
        @if (loading()) {
          <div class="tf-state" data-state="loading" role="status">{{ t('common_loading', 'Loading…') }}</div>
        } @else if (error()) {
          <div class="tf-state" data-state="error" role="alert"><p class="tf-state-title">{{ error() }}</p></div>
        } @else if (items().length) {
          <div class="tf-table-wrap">
            <table class="tf-table" data-density="dense" data-testid="help-queue">
              <thead><tr>
                <th scope="col">{{ t('help_queue_reference', 'Reference') }}</th>
                <th scope="col">{{ t('help_queue_category', 'About') }}</th>
                <th scope="col">{{ t('help_queue_from', 'From') }}</th>
                <th scope="col">{{ t('help_queue_received', 'Received') }}</th>
                <th scope="col">{{ t('fin_col_status', 'Status') }}</th>
              </tr></thead>
              <tbody>
                @for (c of items(); track c.id) {
                  <tr data-testid="help-queue-row">
                    <td><a [routerLink]="['/admin/help', c.id]" class="tf-help-ref" data-testid="help-queue-open">{{ c.reference }}</a></td>
                    <td>{{ categoryLabel(c.category) }}<br><small class="tf-fin-muted">{{ c.summary }}</small></td>
                    <td>{{ c.reporterName || '—' }}@if (c.fromSignedOutReporter) { <br><small class="tf-fin-muted">{{ t('help_signed_out', 'Could not sign in') }}</small> }</td>
                    <td>{{ when(c.createdAt) }}</td>
                    <td><span class="tf-badge" [attr.data-tone]="words(c.status).tone">{{ t(words(c.status).labelKey, words(c.status).fallback) }}</span>
                      @if (c.ownerName) { <br><small class="tf-fin-muted">{{ c.ownerName }}</small> }</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="tf-fin-empty" data-testid="help-queue-empty">{{ t('help_queue_empty', 'No report is waiting.') }}</p>
        }
      </div>
    </tf-workspace-shell>
  `,
  styles: [SUPPORT_STYLES, `
    .tf-help--wide { max-width: none; }
    .tf-help-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
    .tf-help-toolbar .tf-field { display: grid; gap: 6px; flex: 1 1 200px; }
    .tf-fin-muted { color: var(--text-2); font-size: 13px; }
    .tf-fin-empty { margin: 0; padding: 24px 20px; border: 1px dashed var(--border-strong); border-radius: var(--r-lg); color: var(--text-2); text-align: center; }
  `]
})
export class AdminHelpQueuePageComponent {
  private readonly gateway = inject(SupportGateway);
  readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);
  readonly statuses = STATUS_FILTERS;
  readonly categories = SUPPORT_CATEGORIES;
  readonly query = signal('');
  readonly status = signal<SupportStatus | null>(null);
  readonly category = signal<SupportCategory | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly items = signal<readonly SupportCaseSummary[]>([]);

  constructor() {
    inject(Title).setTitle(`${this.t('help_queue_title', 'Help and reports')} — Tafseel`);
    void this.load();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  when(value: string): string { return this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }); }
  words(status: number) { return SupportWords.status(status); }
  categoryLabel(value: number): string { const w = SupportWords.category(value); return this.t(w.labelKey, w.fallback); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try { this.items.set(await this.gateway.queue(this.status(), this.category(), this.query())); }
    catch (error) { this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text); }
    finally { this.loading.set(false); }
  }
}
