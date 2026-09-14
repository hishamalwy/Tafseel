import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { LocaleService } from '@core/i18n/locale.service';
import { AuthShellComponent } from '@shared/layouts/auth-shell.component';

/**
 * The page a new account lands on: check your inbox.
 *
 * It has two faces, chosen by `?delivery=failed` — the confirmation was sent, or
 * the account exists but the mail did not go out. Same layout, different copy.
 */
@Component({
  selector: 'tf-confirm-email-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AuthShellComponent],
  templateUrl: './confirm-email-page.component.html'
})
export class ConfirmEmailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  readonly locale = inject(LocaleService);

  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap
  });

  readonly email = computed(() => (this.query().get('email') ?? '').trim());
  readonly deliveryFailed = computed(() => this.query().get('delivery') === 'failed');
  private readonly role = computed(() =>
    this.query().get('role') === 'teacher' ? 'teacher' : 'student');

  /**
   * A student who confirms is most usefully dropped into Browse; a teacher's next
   * step is decided by their onboarding state, so no destination is pinned here.
   */
  readonly loginQuery = computed(() =>
    this.role() === 'student' ? { return: '/teachers/' } : {});

  readonly heading = computed(() => this.t(
    this.deliveryFailed() ? 'confirm_email_failed_title' : 'confirm_email_title',
    this.deliveryFailed() ? 'We could not send your confirmation email' : 'Confirm your email'));

  readonly body = computed(() => this.t(
    this.deliveryFailed() ? 'confirm_email_failed_body' : 'confirm_email_body',
    this.deliveryFailed()
      ? 'Your account was created, but the confirmation email did not go out.'
      : 'We sent a confirmation link. Open it to activate your account.'));

  readonly help = computed(() => this.t(
    this.deliveryFailed() ? 'confirm_email_failed_help' : 'confirm_email_help',
    this.deliveryFailed()
      ? 'Try logging in to request a new confirmation email.'
      : 'The link expires shortly. Check your spam folder if it has not arrived.'));

  readonly loginLabel = computed(() => this.t('confirm_email_login', 'Go to login'));

  constructor() {
    queueMicrotask(() =>
      this.title.setTitle(this.t('confirm_email_document_title', 'Confirm your email — Tafseel')));
  }

  t(key: string, fallback = ''): string {
    return this.locale.t(key, fallback);
  }
}
