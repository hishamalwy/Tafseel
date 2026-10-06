import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { LocaleService } from '@core/i18n/locale.service';
import { PublicHeaderComponent } from '@shared/layouts/public-header.component';
import { SkipLinkComponent } from '@shared/layouts/skip-link.component';
import { SupportGateway } from '../services/support.gateway';
import { SUPPORT_STYLES } from './support-shared';

/**
 * For someone who cannot sign in. The self-service fixes come first (reset the password, confirm the e-mail);
 * only what they cannot fix becomes a report, answered by e-mail.
 */
@Component({
  selector: 'tf-account-access-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, PublicHeaderComponent, SkipLinkComponent],
  template: `
    <tf-skip-link />
    <tf-public-header menuId="help-public-menu" />
    <main id="main" class="tf-shell tf-help-public">
      <div class="tf-help">
        <header class="tf-help-head">
          <h1>{{ t('help_access_title', 'I can’t get into my account') }}</h1>
          <p>{{ t('help_access_intro', 'Most sign-in problems are fixed in a minute on the sign-in page. If yours is not, tell us here and a person will answer by e-mail.') }}</p>
        </header>
        <ul class="tf-help-steps">
          <li><a routerLink="/auth">{{ t('help_access_forgot', 'I forgot my password: on the sign-in page, type your e-mail and choose “Forgot password?”') }}</a></li>
          <li><a routerLink="/auth">{{ t('help_access_confirm', 'I did not get the confirmation e-mail — sign in and ask for it again') }}</a></li>
        </ul>
        @if (reference()) {
          <p class="tf-help-received" role="status" data-testid="help-access-received">{{ locale.format('help_access_received', { reference: reference() },
            'We received your message. Its reference is {reference}. We will answer at the e-mail address you gave.') }}</p>
        } @else {
          <section class="tf-help-card" aria-labelledby="help-access-form">
            <h2 id="help-access-form">{{ t('help_access_form', 'Tell us what happens') }}</h2>
            <form class="tf-help-form" (ngSubmit)="submit()" novalidate>
              <div class="tf-field">
                <label for="help-access-email">{{ t('help_access_email', 'The e-mail of your Tafseel account') }}</label>
                <input id="help-access-email" type="email" name="email" autocomplete="email" dir="ltr" required data-testid="help-access-email"
                       [ngModel]="email()" (ngModelChange)="email.set($event)">
              </div>
              <div class="tf-field">
                <label for="help-access-name">{{ t('help_access_name', 'Your name (optional)') }}</label>
                <input id="help-access-name" name="name" autocomplete="name" maxlength="150" [ngModel]="name()" (ngModelChange)="name.set($event)">
              </div>
              <div class="tf-field">
                <label for="help-access-description">{{ t('help_description', 'What happened?') }}</label>
                <textarea autocomplete="off" id="help-access-description" name="description" maxlength="4000" required data-testid="help-access-description"
                          [ngModel]="description()" (ngModelChange)="description.set($event)"></textarea>
              </div>
              <p class="tf-help-privacy">{{ t('help_access_privacy', 'Never send your password. Tafseel will never ask for it.') }}</p>
              @if (error()) { <p class="tf-field-error" role="alert">{{ error() }}</p> }
              <div class="tf-help-actions"><button type="submit" class="tf-button" [disabled]="busy()" data-testid="help-access-submit">{{ t('help_submit', 'Send the report') }}</button></div>
            </form>
          </section>
        }
      </div>
    </main>
  `,
  styles: [SUPPORT_STYLES, `
    .tf-help-public { padding-block: 40px 64px; }
    .tf-help-steps { display: grid; gap: 6px; margin: 0; padding-inline-start: 20px; line-height: 1.8; }
    .tf-help-steps a { font-weight: 700; }
    .tf-help-privacy { margin: 0; color: var(--text-2); font-size: var(--type-label-size); }
  `]
})
export class AccountAccessPageComponent {
  private readonly gateway = inject(SupportGateway);
  readonly locale = inject(LocaleService);
  readonly email = signal('');
  readonly name = signal('');
  readonly description = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly reference = signal('');

  constructor() { inject(Title).setTitle(`${this.t('help_access_title', 'I can’t get into my account')} — Tafseel`); }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }

  async submit(): Promise<void> {
    this.error.set('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim())) {
      this.error.set(this.t('err_support_contact_email_invalid', 'Enter the e-mail address of your Tafseel account.'));
      return;
    }
    if (this.description().trim().length < 10) {
      this.error.set(this.t('err_support_description_invalid', 'Describe what happened in 10 to 4000 characters.'));
      return;
    }
    this.busy.set(true);
    try { this.reference.set(await this.gateway.accountAccess(this.email().trim(), this.name().trim(), this.description().trim())); }
    catch (error) { this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text); }
    finally { this.busy.set(false); }
  }
}
