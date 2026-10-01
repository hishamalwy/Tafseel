import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { SUPPORT_CATEGORIES, SupportCaseSummary, SupportCategory, SupportWords, helpShellRole } from '../models/support';
import { SupportGateway } from '../services/support.gateway';
import { SUPPORT_STYLES } from './support-shared';

/**
 * "Get help / report a problem" for anyone signed in. A paid purchase goes to its dispute (money rules); anything
 * else becomes a case with a reference, followed below. A screen that knows what the report is about (a
 * conversation, a session, a profile) links here with `?category=` and `?about=`.
 */
@Component({
  selector: 'tf-help-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, WorkspaceShellComponent],
  template: `
    <tf-workspace-shell [role]="shellRole()" section="help">
      <div class="tf-help">
        <header class="tf-help-head">
          <h1>{{ t('help_title', 'Help and reports') }}</h1>
          <p>{{ t('help_intro', 'Tell Tafseel about a problem or about someone’s behaviour. A person on the team reads every report, answers you here, and writes down what was done.') }}</p>
        </header>

        <p class="tf-help-note" data-testid="help-purchase-note">
          <span>{{ t('help_purchase_note', 'A problem with something you paid for (a delivery, a session, a refund)? Open a dispute: it can hold or return the money.') }}</span>
          <a routerLink="/disputes">{{ t('help_open_dispute', 'Open a dispute') }}</a>
        </p>

        <section class="tf-help-card" aria-labelledby="help-new-title">
          <h2 id="help-new-title">{{ t('help_new_title', 'What is the report about?') }}</h2>
          <form class="tf-help-form" (ngSubmit)="submit()" novalidate data-testid="help-form">
            <fieldset class="tf-help-choices">
              <legend class="tf-sr-only">{{ t('help_new_title', 'What is the report about?') }}</legend>
              @for (c of categories; track c.value) {
                <label class="tf-help-choice" [attr.data-testid]="'help-category-' + c.key">
                  <input type="radio" name="category" [value]="c.value" [ngModel]="category()" (ngModelChange)="category.set($event)">
                  <strong>{{ t(c.titleKey, c.title) }}</strong>
                  <span>{{ t(c.hintKey, c.hint) }}</span>
                </label>
              }
            </fieldset>
            @if (about()) {
              <p class="tf-fin-muted" data-testid="help-about">{{ locale.format('help_about', { what: aboutLabel() }, 'About: {what}') }}</p>
            }
            <div class="tf-field">
              <label for="help-description">{{ t('help_description', 'What happened?') }}</label>
              <textarea id="help-description" name="description" maxlength="4000" data-testid="help-description"
                        [ngModel]="description()" (ngModelChange)="description.set($event)" aria-describedby="help-description-hint"></textarea>
              <small id="help-description-hint" class="tf-fin-muted">{{ t('help_description_hint', 'Say what happened, when, and who was involved. You can add screenshots after sending.') }}</small>
            </div>
            @if (formError()) { <p class="tf-field-error" role="alert">{{ formError() }}</p> }
            <div class="tf-help-actions">
              <button type="submit" class="tf-button" [disabled]="busy()" data-testid="help-submit">{{ busy() ? t('common_sending', 'Sending…') : t('help_submit', 'Send the report') }}</button>
            </div>
          </form>
        </section>

        <section aria-labelledby="help-mine-title" class="tf-help">
          <h2 id="help-mine-title" class="tf-help-subtitle">{{ t('help_mine_title', 'Your reports') }}</h2>
          @if (loading()) {
            <div class="tf-state" data-state="loading" role="status">{{ t('common_loading', 'Loading…') }}</div>
          } @else if (mine().length) {
            <ul class="tf-help-list" data-testid="help-mine">
              @for (c of mine(); track c.id) {
                <li><a [routerLink]="['/help/cases', c.id]" data-testid="help-case-link">
                  <strong>{{ categoryLabel(c.category) }}</strong>
                  <span class="tf-badge" [attr.data-tone]="status(c.status).tone">{{ t(status(c.status).labelKey, status(c.status).fallback) }}</span>
                  <small><span class="tf-help-ref">{{ c.reference }}</span> · {{ when(c.updatedAt) }} · {{ c.summary }}</small>
                </a></li>
              }
            </ul>
          } @else {
            <p class="tf-fin-empty">{{ t('help_mine_empty', 'You have not sent a report.') }}</p>
          }
        </section>
      </div>
    </tf-workspace-shell>
  `,
  styles: [SUPPORT_STYLES, `
    .tf-help-subtitle { margin: 0; font-size: var(--type-section-title-size); font-weight: 800; }
    .tf-fin-muted { margin: 0; color: var(--text-2); font-size: 13px; line-height: 1.6; }
    .tf-fin-empty { margin: 0; padding: 24px 20px; border: 1px dashed var(--border-strong); border-radius: var(--r-lg); color: var(--text-2); text-align: center; font-size: 14px; }
  `]
})
export class HelpPageComponent {
  private readonly gateway = inject(SupportGateway);
  private readonly session = inject(SESSION_STORE);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);
  readonly categories = SUPPORT_CATEGORIES;
  readonly shellRole = computed(() => helpShellRole(this.session.current()?.roles));
  readonly category = signal<SupportCategory | null>(SupportWords.categoryFromKey(this.route.snapshot.queryParamMap.get('category')));
  readonly about = signal(this.route.snapshot.queryParamMap.get('about') ?? '');
  readonly description = signal('');
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly formError = signal('');
  readonly mine = signal<readonly SupportCaseSummary[]>([]);
  readonly aboutLabel = computed(() => {
    const [kind] = this.about().split(':');
    switch (kind) {
      case 'conversation': return this.t('help_about_conversation', 'a conversation');
      case 'session': return this.t('help_about_session', 'a live session');
      case 'teacher': return this.t('help_about_teacher', 'a teacher’s profile');
      default: return this.t('help_about_page', 'a page on Tafseel');
    }
  });

  constructor() {
    inject(Title).setTitle(`${this.t('help_title', 'Help and reports')} — Tafseel`);
    void this.load();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  when(value: string): string { return this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }); }
  status(value: number) { return SupportWords.status(value); }
  categoryLabel(value: number): string { const w = SupportWords.category(value); return this.t(w.labelKey, w.fallback); }

  async load(): Promise<void> {
    this.loading.set(true);
    try { this.mine.set(await this.gateway.mine()); } catch { this.mine.set([]); } finally { this.loading.set(false); }
  }

  async submit(): Promise<void> {
    this.formError.set('');
    const category = this.category();
    if (category === null) { this.formError.set(this.t('help_pick_category', 'Choose what the report is about.')); return; }
    if (this.description().trim().length < 10) {
      this.formError.set(this.t('err_support_description_invalid', 'Describe what happened in 10 to 4000 characters.'));
      return;
    }
    this.busy.set(true);
    try {
      const created = await this.gateway.create(category, this.description().trim(), this.about() || null);
      await this.router.navigate(['/help/cases', created.id], { queryParams: { sent: 1 } });
    } catch (error) {
      this.formError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.busy.set(false);
    }
  }
}
