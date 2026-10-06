import { SkeletonComponent } from '@shared/components/skeleton.component';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { injectListContext } from '@shared/utils/list-context';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
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
  imports: [SkeletonComponent, FormsModule, RouterLink, WorkspaceShellComponent],
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
            <input autocomplete="off" id="help-q" name="q" type="search" maxlength="200" [ngModel]="query()" (ngModelChange)="query.set($event)">
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
          <tf-skeleton kind="queue" [label]="t('common_loading', 'Loading…')" />
        } @else if (error()) {
          <div class="tf-state" data-state="error" role="alert"><p class="tf-state-title">{{ error() }}</p></div>
        } @else if (items().length) {
          <div class="tf-table-wrap">
            <table class="tf-table" data-density="dense" data-phone="cards" data-testid="help-queue">
              <thead><tr>
                <th scope="col">{{ t('help_queue_reference', 'Reference') }}</th>
                <th scope="col">{{ t('help_queue_category', 'About') }}</th>
                <th scope="col">{{ t('help_queue_from', 'From') }}</th>
                <th scope="col">{{ t('help_queue_received', 'Received') }}</th>
                <th scope="col">{{ t('fin_col_status', 'Status') }}</th>
                <th scope="col" class="tf-table__actions"><span class="tf-sr-only">{{ t('fin_col_actions', 'Actions') }}</span></th>
              </tr></thead>
              <tbody>
                @for (c of items(); track c.id) {
                  <tr data-testid="help-queue-row" class="tf-help-row" (click)="open(c, $event)">
                    <td [attr.data-label]="t('help_queue_reference', 'Reference')"><a [id]="'help-row-' + c.id" [routerLink]="['/admin/help', c.id]" [queryParams]="contextParams(c.id)" class="tf-help-ref" data-testid="help-queue-open">{{ c.reference }}</a></td>
                    <td [attr.data-label]="t('help_queue_category', 'About')"><span>{{ categoryLabel(c.category) }}<small class="tf-fin-muted tf-help-summary">{{ c.summary }}</small></span></td>
                    <td [attr.data-label]="t('help_queue_from', 'From')"><span>{{ c.reporterName || '—' }}@if (c.fromSignedOutReporter) { <br><small class="tf-fin-muted">{{ t('help_signed_out', 'Could not sign in') }}</small> }</span></td>
                    <td [attr.data-label]="t('help_queue_received', 'Received')">{{ when(c.createdAt) }}</td>
                    <td [attr.data-label]="t('fin_col_status', 'Status')"><span class="tf-help-state">
                      <span class="tf-badge" [attr.data-tone]="words(c.status).tone">{{ t(words(c.status).labelKey, words(c.status).fallback) }}</span>
                      @if (c.ownerName) { <small>{{ locale.format('help_owned_by', { name: c.ownerName }, 'Owned by {name}') }}</small> }</span></td>
                    <td class="tf-table__actions"><div>
                      <a class="tf-button" [class.tf-button-secondary]="c.status !== 0" [routerLink]="['/admin/help', c.id]" [queryParams]="contextParams(c.id)" data-testid="help-queue-action">{{
                        c.status === 0 ? t('help_queue_open_take', 'Open and take') : c.status === 1 ? t('help_queue_open_reply', 'Open and answer') : t('help_queue_open_view', 'View') }}</a>
                    </div></td>
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
    .tf-help-row { cursor: pointer; }
    .tf-help-row .tf-help-ref { white-space: nowrap; }
    .tf-help-state { display: grid; justify-items: start; gap: 4px; }
    .tf-help-state small { color: var(--text-2); font-size: var(--type-meta-size); font-weight: 500; line-height: 1.3; white-space: nowrap; }
    .tf-help-row td { overflow-wrap: normal; }
    .tf-table[data-testid='help-queue'] th, .tf-help-row td:nth-child(4) { white-space: nowrap; }
    @media (max-width: 720px) { .tf-help-summary { max-width: 100%; } }
    @media (hover:hover) and (pointer:fine) { .tf-help-row:hover > td { background: color-mix(in oklab, var(--surface-2) 60%, transparent); } }
    .tf-help-summary { display: block; max-width: 40ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
    .tf-table__actions a.tf-button { min-height: 44px; text-decoration: none; white-space: nowrap; }
    .tf-help-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
    .tf-help-toolbar .tf-field { display: grid; gap: 6px; flex: 1 1 200px; }
    .tf-fin-muted { color: var(--text-2); font-size: var(--type-label-size); }
    .tf-fin-empty { margin: 0; padding: 24px 20px; border: 1px dashed var(--border-strong); border-radius: var(--r-lg); color: var(--text-2); text-align: center; }
  `]
})
export class AdminHelpQueuePageComponent {
  private readonly gateway = inject(SupportGateway);
  private readonly router = inject(Router);
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
  private request = 0;
  private readonly context = injectListContext(params => {
    this.query.set((params.get('q') ?? '').slice(0, 200));
    this.status.set(this.statuses.find(f => f[0] !== null && String(f[0]) === params.get('status'))?.[0] ?? null);
    this.category.set(this.categories.find(c => String(c.value) === params.get('category'))?.value ?? null);
  }, () => { void this.fetchQueue(); });

  constructor() {
    inject(Title).setTitle(`${this.t('help_queue_title', 'Help and reports')} — Tafseel`);
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  when(value: string): string { return this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }); }
  words(status: number) { return SupportWords.status(status); }
  categoryLabel(value: number): string { const w = SupportWords.category(value); return this.t(w.labelKey, w.fallback); }

  /** The whole row opens the report; a click on its own link or button is left to that control. */
  open(c: SupportCaseSummary, event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('a, button')) return;
    void this.router.navigate(['/admin/help', c.id], { queryParams: this.contextParams(c.id) });
  }

  async load(): Promise<void> {
    this.context.commit(this.contextParams());
  }

  contextParams(focus: string | null = null) {
    return { q: this.query() || null, status: this.status(), category: this.category(), focus };
  }

  private async fetchQueue(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    try { const items = await this.gateway.queue(this.status(), this.category(), this.query()); if (request === this.request) this.items.set(items); }
    catch (error) { if (request === this.request) this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text); }
    finally { if (request === this.request) { this.loading.set(false); this.context.restoreFocus('help-row-'); } }
  }
}
