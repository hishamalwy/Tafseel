import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SESSION_GATEWAY, SESSION_STORE } from './auth.ports';

/**
 * End the session.
 *
 * The local clear happens whether or not the server call succeeds: a user who
 * pressed "log out" must end up logged out of this tab regardless of the network.
 */
@Injectable({ providedIn: 'root' })
export class LogOut {
  private readonly gateway = inject(SESSION_GATEWAY);
  private readonly store = inject(SESSION_STORE);

  async execute(): Promise<void> {
    try {
      await firstValueFrom(this.gateway.revoke());
    } catch {
      // deliberate — see above
    } finally {
      this.store.set(null);
    }
  }
}
