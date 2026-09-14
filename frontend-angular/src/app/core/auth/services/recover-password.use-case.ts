import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EmailAddress } from '@shared/models/email-address';
import { PasswordPolicy } from '@shared/models/password-policy';
import { AuthFailure } from '@core/auth/models/auth-failure';
import { ACCOUNT_GATEWAY, PasswordReset } from './auth.ports';

/** Ask for a reset link. */
@Injectable({ providedIn: 'root' })
export class RequestPasswordReset {
  private readonly gateway = inject(ACCOUNT_GATEWAY);

  /**
   * Never reports whether the address exists. The endpoint answers identically
   * either way so it cannot be used to enumerate accounts, and this swallows
   * transport failures for the same reason.
   */
  async execute(email: string, lang: 'ar' | 'en'): Promise<void> {
    if (!EmailAddress.isValid(email)) {
      throw new AuthFailure('unknown', 'Enter a valid email address.');
    }
    try {
      await firstValueFrom(this.gateway.requestPasswordReset(email.trim(), lang));
    } catch {
      // deliberate — see above
    }
  }
}

/** Complete the reset with the token from the emailed link. */
@Injectable({ providedIn: 'root' })
export class ResetPassword {
  private readonly gateway = inject(ACCOUNT_GATEWAY);

  async execute(reset: PasswordReset): Promise<void> {
    if (!PasswordPolicy.isSatisfiedBy(reset.newPassword)) {
      throw new AuthFailure('unknown', 'That password does not meet the requirements.');
    }
    await firstValueFrom(this.gateway.resetPassword(reset));
  }
}

/** Re-send the address-confirmation mail after a failed or missed delivery. */
@Injectable({ providedIn: 'root' })
export class ResendConfirmation {
  private readonly gateway = inject(ACCOUNT_GATEWAY);

  async execute(email: string, lang: 'ar' | 'en'): Promise<void> {
    if (!EmailAddress.isValid(email)) {
      throw new AuthFailure('unknown', 'Enter a valid email address.');
    }
    await firstValueFrom(this.gateway.resendConfirmation(email.trim(), lang));
  }
}

/**
 * Spend the token in a welcome email's link.
 *
 * The address in the link is what the account was registered with, so it is not
 * revalidated here: rejecting it locally would only turn a server answer the
 * user can act on into a client-side error they cannot.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmEmail {
  private readonly gateway = inject(ACCOUNT_GATEWAY);

  async execute(email: string, token: string): Promise<void> {
    await firstValueFrom(this.gateway.confirmEmail(email.trim(), token));
  }
}
