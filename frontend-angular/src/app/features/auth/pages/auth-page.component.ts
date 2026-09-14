import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthFailure } from '@core/auth/models/auth-failure';
import { EmailAddress } from '@shared/models/email-address';
import { PasswordPolicy, PasswordRuleId } from '@shared/models/password-policy';
import { LogIn } from '@core/auth/services/log-in.use-case';
import { RegisterAccount } from '@core/auth/services/register-account.use-case';
import {
  ConfirmEmail, RequestPasswordReset, ResendConfirmation, ResetPassword
} from '@core/auth/services/recover-password.use-case';
import { ResolveLandingRoute } from '@core/auth/services/resolve-landing-route.use-case';
import { LocaleService } from '@core/i18n/locale.service';
import { ThemeService } from '@core/theme/theme.service';
import { safeReturnUrl } from '@core/auth/guards/auth.guards';
import { AuthShellComponent } from '@shared/layouts/auth-shell.component';
import { IconComponent } from '@shared/components/icon.component';
import { TextFieldComponent } from '@shared/components/text-field.component';
import { PasswordFieldComponent } from '@shared/components/password-field.component';
import { PasswordRulesComponent, PasswordRuleView } from '@shared/components/password-rules.component';
import { ToastComponent } from '@shared/components/toast.component';

type Mode = 'login' | 'register' | 'reset';
type RoleChoice = 'student' | 'teacher';

/**
 * Log in, sign up, reset — ported from `Tafseel-Auth.dc.html`.
 *
 * The markup, `tf-*` class names and inline styles are carried over unchanged so
 * the screen renders from `css/tafseel.css` exactly as it did. What moved is the
 * logic: the 30-key `state` object is individual signals, everything derived is a
 * `computed` rather than a branch inside a 228-line `renderVals`, and the actual
 * rules live in use cases this component only calls.
 *
 * This class holds view concerns only — which mode is showing, which fields have
 * been touched, what the toast says. It contains no HTTP, no routing rules and no
 * password policy of its own.
 */
@Component({
  selector: 'tf-auth-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, RouterLink, AuthShellComponent, IconComponent, TextFieldComponent,
    PasswordFieldComponent, PasswordRulesComponent, ToastComponent
  ],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.css'
})
export class AuthPageComponent {
  private readonly logIn = inject(LogIn);
  private readonly registerAccount = inject(RegisterAccount);
  private readonly requestReset = inject(RequestPasswordReset);
  private readonly resetPasswordUseCase = inject(ResetPassword);
  private readonly confirmEmailUseCase = inject(ConfirmEmail);
  private readonly resendConfirmationUseCase = inject(ResendConfirmation);
  private readonly landing = inject(ResolveLandingRoute);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly locale = inject(LocaleService);
  readonly theme = inject(ThemeService);

  readonly policyVersion = '2026-08-12';

  readonly mode = signal<Mode>('login');
  readonly role = signal<RoleChoice>('student');
  readonly toast = signal('');

  // --- login ---
  readonly email = signal('');
  readonly password = signal('');
  readonly mfaCode = signal('');
  readonly needsMfa = signal(false);
  readonly remember = signal(true);
  readonly loginError = signal('');
  readonly loggingIn = signal(false);
  readonly emailTouched = signal(false);
  readonly passwordTouched = signal(false);
  readonly needsConfirmationResend = signal(false);
  readonly resendingConfirmation = signal(false);

  // --- register ---
  readonly fullName = signal('');
  readonly regEmail = signal('');
  readonly regPassword = signal('');
  readonly regConfirm = signal('');
  readonly agreeTerms = signal(false);
  readonly regError = signal('');
  readonly registering = signal(false);
  readonly regShowPassword = signal(false);
  readonly fullNameTouched = signal(false);
  readonly regEmailTouched = signal(false);
  readonly regPasswordTouched = signal(false);
  readonly regPasswordFocused = signal(false);
  readonly regConfirmTouched = signal(false);

  // --- reset ---
  readonly resetPassword = signal('');
  readonly resetConfirm = signal('');
  readonly resetError = signal('');
  readonly resetting = signal(false);
  readonly resetShowPassword = signal(false);
  readonly resetPasswordTouched = signal(false);
  readonly resetPasswordFocused = signal(false);
  readonly resetConfirmTouched = signal(false);
  private readonly resetEmail = signal('');
  private readonly resetToken = signal('');

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    const token = q.get('token');
    const emailParam = q.get('email');
    // Both emails link here carrying a token and an address, so the token alone
    // cannot say which flow this is - only ?mode= can. Confirmation used to be
    // handled by the legacy page; without this branch a confirmation link would
    // be read as a reset and offer to change a password nobody asked about.
    if (token && emailParam && q.get('mode') === 'confirm') {
      this.email.set(emailParam);
      void this.confirmAddress(emailParam, token);
    } else if (token && emailParam) {
      this.resetToken.set(token);
      this.resetEmail.set(emailParam);
      this.mode.set('reset');
    } else if (q.get('mode') === 'register') {
      this.mode.set('register');
    }
    const roleParam = q.get('role');
    if (roleParam === 'teacher' || roleParam === 'student') this.role.set(roleParam);
  }

  t(key: string, fallback = ''): string {
    return this.locale.t(key, fallback);
  }

  readonly langSwitchLabel = computed(() =>
    this.locale.lang() === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');

  readonly modeTabs = computed(() => [
    { mode: 'login' as const, label: this.t('auth_login', 'Log in'), active: this.mode() === 'login' },
    { mode: 'register' as const, label: this.t('auth_signup', 'Sign up'), active: this.mode() === 'register' }
  ]);

  readonly roleCards = computed(() => [
    {
      role: 'student' as const, active: this.role() === 'student',
      label: this.t('auth_role_student', 'Student'),
      desc: this.t('auth_role_student_desc', 'Post requests and book teachers.')
    },
    {
      role: 'teacher' as const, active: this.role() === 'teacher',
      label: this.t('auth_role_teacher', 'Teacher'),
      desc: this.t('auth_role_teacher_desc', 'Offer services and teach students.')
    }
  ]);

  // ---- derived validity ----
  readonly loginEmailInvalid = computed(() =>
    this.emailTouched() && !EmailAddress.isValid(this.email()));
  readonly loginEmailError = computed(() =>
    this.loginEmailInvalid() ? this.t('auth_email_invalid', 'Enter a valid email address.') : '');

  readonly loginPasswordInvalid = computed(() =>
    this.passwordTouched() && this.password().length === 0);
  readonly loginPasswordError = computed(() =>
    this.loginPasswordInvalid() ? this.t('auth_password_required', 'Enter your password.') : '');

  readonly loginSubmitDisabled = computed(() =>
    this.loggingIn()
    || !EmailAddress.isValid(this.email())
    || this.password().length === 0
    || (this.needsMfa() && this.mfaCode().trim().length < 6));

  readonly fullNameInvalid = computed(() =>
    this.fullNameTouched() && this.fullName().trim().length === 0);
  readonly fullNameError = computed(() =>
    this.fullNameInvalid() ? this.t('auth_name_required', 'Enter your full name.') : '');

  readonly regEmailInvalid = computed(() =>
    this.regEmailTouched() && !EmailAddress.isValid(this.regEmail()));
  readonly regEmailError = computed(() =>
    this.regEmailInvalid() ? this.t('auth_email_invalid', 'Enter a valid email address.') : '');

  readonly regPasswordInvalid = computed(() =>
    this.regPasswordTouched() && !PasswordPolicy.isSatisfiedBy(this.regPassword()));
  readonly regConfirmInvalid = computed(() =>
    this.regConfirmTouched() && this.regConfirm() !== this.regPassword());
  readonly showRegPasswordHints = computed(() =>
    this.regPasswordFocused()
    || (this.regPasswordTouched() && !PasswordPolicy.isSatisfiedBy(this.regPassword())));
  readonly regPasswordRules = computed(() => this.decorate(this.regPassword()));
  readonly regConfirmMatch = computed(() =>
    this.matchHint(this.regPassword(), this.regConfirm(), this.regConfirmTouched()));

  readonly registerSubmitDisabled = computed(() =>
    this.registering()
    || this.fullName().trim().length === 0
    || !EmailAddress.isValid(this.regEmail())
    || !PasswordPolicy.isSatisfiedBy(this.regPassword())
    || this.regConfirm() !== this.regPassword()
    || !this.agreeTerms());

  readonly resetPasswordInvalid = computed(() =>
    this.resetPasswordTouched() && !PasswordPolicy.isSatisfiedBy(this.resetPassword()));
  readonly resetConfirmInvalid = computed(() =>
    this.resetConfirmTouched() && this.resetConfirm() !== this.resetPassword());
  readonly showResetPasswordHints = computed(() =>
    this.resetPasswordFocused()
    || (this.resetPasswordTouched() && !PasswordPolicy.isSatisfiedBy(this.resetPassword())));
  readonly resetPasswordRules = computed(() => this.decorate(this.resetPassword()));
  readonly resetConfirmMatch = computed(() =>
    this.matchHint(this.resetPassword(), this.resetConfirm(), this.resetConfirmTouched()));
  readonly resetSubmitDisabled = computed(() =>
    this.resetting()
    || !PasswordPolicy.isSatisfiedBy(this.resetPassword())
    || this.resetConfirm() !== this.resetPassword());

  goMode(mode: Mode): void {
    this.mode.set(mode);
    this.loginError.set('');
    this.regError.set('');
    this.resetError.set('');
    this.needsConfirmationResend.set(false);
  }

  // ---- actions ----
  async onLogin(): Promise<void> {
    if (this.loginSubmitDisabled()) return;
    this.loggingIn.set(true);
    this.loginError.set('');
    this.needsConfirmationResend.set(false);

    try {
      const session = await this.logIn.execute({
        email: this.email(),
        password: this.password(),
        ...(this.needsMfa() && this.mfaCode().trim() ? { mfaCode: this.mfaCode().trim() } : {})
      });
      const requested = safeReturnUrl(this.route.snapshot.queryParamMap.get('return'));
      await this.router.navigateByUrl(await this.landing.execute(session.roles, requested));
    } catch (error) {
      const failure = error as AuthFailure;
      if (failure.reason === 'mfa-required') {
        this.needsMfa.set(true);
        this.loginError.set(this.t('auth_mfa_required', 'Enter the code from your authenticator app.'));
      } else if (failure.reason === 'email-not-confirmed') {
        this.needsConfirmationResend.set(true);
        this.loginError.set(this.t('auth_confirm_required', 'Confirm your email address before logging in.'));
      } else {
        this.loginError.set(this.describe(failure));
      }
    } finally {
      this.loggingIn.set(false);
    }
  }

  async onRegister(): Promise<void> {
    if (this.registerSubmitDisabled()) return;
    this.registering.set(true);
    this.regError.set('');

    try {
      await this.registerAccount.execute({
        email: this.regEmail(),
        password: this.regPassword(),
        fullName: this.fullName(),
        role: this.role() === 'teacher' ? 'Teacher' : 'Student',
        lang: this.locale.lang()
      });
      await this.router.navigate(['/auth/confirm-email'], {
        queryParams: { email: this.regEmail().trim(), role: this.role() }
      });
    } catch (error) {
      const failure = error as AuthFailure;
      if (failure.reason === 'confirmation-not-sent') {
        // The account exists; only the mail failed. Send them on with a marker
        // rather than stranding them on a form they cannot usefully resubmit.
        await this.router.navigate(['/auth/confirm-email'], {
          queryParams: { email: this.regEmail().trim(), role: this.role(), delivery: 'failed' }
        });
        return;
      }
      this.regError.set(this.describe(failure));
    } finally {
      this.registering.set(false);
    }
  }

  /**
   * Runs on arrival from the welcome email; the visitor is then on the login
   * form with their address filled in, which is the next thing they need.
   */
  private async confirmAddress(email: string, token: string): Promise<void> {
    try {
      await this.confirmEmailUseCase.execute(email, token);
      this.flash(this.t('auth_email_confirmed', 'Your email is confirmed. You can log in now.'));
    } catch {
      this.loginError.set(this.t(
        'auth_confirm_link_invalid',
        'That confirmation link is invalid or has expired. Log in to request a new one.'));
      this.needsConfirmationResend.set(true);
    }
  }

  async onReset(): Promise<void> {
    if (this.resetSubmitDisabled()) return;
    this.resetting.set(true);
    this.resetError.set('');
    try {
      await this.resetPasswordUseCase.execute({
        email: this.resetEmail(),
        token: this.resetToken(),
        newPassword: this.resetPassword()
      });
      this.flash(this.t('auth_password_updated', 'Password updated. You can log in now.'));
      this.email.set(this.resetEmail());
      this.goMode('login');
    } catch (error) {
      this.resetError.set(this.describe(error as AuthFailure));
    } finally {
      this.resetting.set(false);
    }
  }

  async onForgot(): Promise<void> {
    if (!EmailAddress.isValid(this.email())) {
      this.emailTouched.set(true);
      return;
    }
    await this.requestReset.execute(this.email(), this.locale.lang());
    // Same message whether or not the address exists — the endpoint is designed
    // not to confirm that, and neither should the UI.
    this.flash(this.t('auth_reset_sent', 'If that email has an account, a reset link is on its way.'));
  }

  async onResendConfirmation(): Promise<void> {
    if (!EmailAddress.isValid(this.email())) return;
    this.resendingConfirmation.set(true);
    try {
      await this.resendConfirmationUseCase.execute(this.email(), this.locale.lang());
      this.flash(this.t('auth_confirmation_resent', 'Confirmation email sent.'));
    } catch (error) {
      this.loginError.set(this.describe(error as AuthFailure));
    } finally {
      this.resendingConfirmation.set(false);
    }
  }

  // ---- presentation helpers ----

  /** Domain rule results, labelled for display. Styling belongs to the component. */
  private decorate(password: string): readonly PasswordRuleView[] {
    const labels: Readonly<Record<PasswordRuleId, [string, string]>> = {
      length: ['auth_password_rule_length', '10-128 characters'],
      upper: ['auth_password_rule_upper', 'An uppercase letter'],
      lower: ['auth_password_rule_lower', 'A lowercase letter'],
      digit: ['auth_password_rule_digit', 'A number'],
      special: ['auth_password_rule_special', 'A symbol']
    };

    return PasswordPolicy.evaluate(password).map(rule => {
      const [key, fallback] = labels[rule.id];
      return { label: this.t(key, fallback), satisfied: rule.satisfied };
    });
  }

  private matchHint(password: string, confirm: string, touched: boolean) {
    if (!confirm || !touched) return null;
    return password === confirm
      ? { text: this.t('auth_passwords_match', 'Passwords match'), ok: true }
      : { text: this.t('auth_passwords_differ', 'Passwords do not match'), ok: false };
  }

  /** Domain reason to a sentence the user can act on. */
  private describe(failure: AuthFailure): string {
    switch (failure.reason) {
      case 'invalid-credentials':
        return this.t('auth_invalid_credentials', 'Incorrect email or password.');
      case 'invalid-mfa-code':
        return this.t('auth_invalid_mfa', 'That authenticator code is not right.');
      case 'account-suspended':
        return this.t('auth_suspended', 'This account is suspended. Contact support.');
      case 'email-unavailable':
        return this.t('auth_registration_failed', 'That email cannot be registered. Try logging in instead.');
      case 'policy-outdated':
        return this.t('auth_policy_changed', 'The terms have changed. Reload the page and try again.');
      case 'reset-link-invalid':
        return this.t('auth_reset_link_invalid', 'That reset link has expired. Request a new one.');
      case 'session-expired':
        return this.t('auth_session_expired', 'Your session ended. Please log in again.');
      case 'offline':
        return this.t('auth_offline', 'Could not reach Tafseel. Check your connection.');
      case 'server-fault':
        return this.t('auth_server_error', 'Tafseel is having trouble. Try again in a moment.');
      default:
        return failure.message;
    }
  }

  private flash(message: string): void {
    this.toast.set(message);
    setTimeout(() => this.toast.set(''), 4000);
  }
}
