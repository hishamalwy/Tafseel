import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EmailAddress } from '@shared/models/email-address';
import { PasswordPolicy } from '@shared/models/password-policy';
import { AuthFailure } from '@core/auth/models/auth-failure';
import { ACCOUNT_GATEWAY, Registration } from './auth.ports';

/**
 * Create an account. The API answers 202 and sends a confirmation mail; there is
 * no session yet, which is why nothing here touches the session store.
 */
@Injectable({ providedIn: 'root' })
export class RegisterAccount {
  private readonly gateway = inject(ACCOUNT_GATEWAY);

  async execute(registration: Registration): Promise<void> {
    if (!registration.fullName.trim()) {
      throw new AuthFailure('unknown', 'Enter your full name.');
    }
    if (!EmailAddress.isValid(registration.email)) {
      throw new AuthFailure('unknown', 'Enter a valid email address.');
    }
    // Checked here as well as in the form: a use case cannot assume its caller
    // validated, and this is the boundary the server contract is mirrored at.
    if (!PasswordPolicy.isSatisfiedBy(registration.password)) {
      throw new AuthFailure('unknown', 'That password does not meet the requirements.');
    }

    await firstValueFrom(this.gateway.register({
      ...registration,
      email: registration.email.trim(),
      fullName: registration.fullName.trim()
    }));
  }
}
