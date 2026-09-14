import { Injectable, computed, signal } from '@angular/core';
import { Session } from '@core/auth/models/session';
import { Role } from '@core/auth/models/role';
import { SessionStore } from '@core/auth/services/auth.ports';

/**
 * The session, held in memory for the life of the tab.
 *
 * In memory on purpose: the access token is short-lived and the refresh token is
 * an HttpOnly cookie, so nothing here needs to survive a reload — a reload
 * re-derives the session from the cookie. Putting the access token in
 * localStorage would make it readable by any script on the origin for no gain.
 */
@Injectable()
export class SignalSessionStore implements SessionStore {
  private readonly session = signal<Session | null>(null);

  readonly value = this.session.asReadonly();
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly roles = computed<readonly Role[]>(() => this.session()?.roles ?? []);
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);

  readonly current = () => this.session();

  set(session: Session | null): void {
    this.session.set(session);
  }
}
