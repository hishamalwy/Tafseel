import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Session } from '@core/auth/models/session';
import { EmailAddress } from '@shared/models/email-address';
import { AuthFailure } from '@core/auth/models/auth-failure';
import { Credentials, SESSION_GATEWAY, SESSION_STORE } from './auth.ports';

/**
 * Sign a user in and adopt the resulting session.
 *
 * One reason to change: the rules of logging in. It does not know about routing,
 * forms, or HTTP — the caller decides where to go next, and the gateway decides
 * how the request is made.
 */
@Injectable({ providedIn: 'root' })
export class LogIn {
  private readonly gateway = inject(SESSION_GATEWAY);
  private readonly store = inject(SESSION_STORE);

  async execute(credentials: Credentials): Promise<Session> {
    if (!EmailAddress.isValid(credentials.email)) {
      throw new AuthFailure('invalid-credentials', 'Enter a valid email address.');
    }
    if (!credentials.password) {
      throw new AuthFailure('invalid-credentials', 'Enter your password.');
    }

    const session = await firstValueFrom(this.gateway.authenticate({
      ...credentials,
      email: credentials.email.trim()
    }));
    this.store.set(session);
    return session;
  }
}
