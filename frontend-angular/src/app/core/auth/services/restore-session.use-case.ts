import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, from, map } from 'rxjs';
import { Session } from '@core/auth/models/session';
import { SESSION_GATEWAY, SESSION_STORE } from './auth.ports';

/**
 * Re-establish the session from the refresh cookie.
 *
 * Runs at boot and again whenever a request comes back 401. The attempt is
 * shared, so a page that fires eight requests and gets eight 401s costs one
 * refresh rather than eight — the behaviour the old client got by threading a
 * `noRefresh` flag through every call site.
 *
 * The share is a memoised promise, not a `shareReplay` observable. With
 * `shareReplay` the pipeline runs to completion inside the first `subscribe()`
 * whenever the gateway answers synchronously, clearing the in-flight handle
 * before the second caller ever subscribes — so three concurrent calls made
 * three requests. A promise is created once per tick and every caller in that
 * tick joins the same one, whether the gateway is sync or async.
 */
@Injectable({ providedIn: 'root' })
export class RestoreSession {
  private readonly gateway = inject(SESSION_GATEWAY);
  private readonly store = inject(SESSION_STORE);

  private inFlight: Promise<Session | null> | null = null;
  private settled = false;

  /** True once the first attempt has finished, so guards can wait rather than guess. */
  get isSettled(): boolean {
    return this.settled;
  }

  execute(): Observable<Session | null> {
    this.inFlight ??= this.begin();
    return from(this.inFlight);
  }

  /** Same shared attempt, but "no session" becomes an error the retry path can catch. */
  forRetry(): Observable<Session> {
    return this.execute().pipe(
      map(session => {
        if (!session) throw new Error('session-expired');
        return session;
      })
    );
  }

  /** Lets the next call start a fresh attempt — used after logging out. */
  reset(): void {
    this.inFlight = null;
    this.settled = false;
  }

  private begin(): Promise<Session | null> {
    return firstValueFrom(this.gateway.restore())
      .catch(() => null)          // no session is an answer, not a failure
      .then(session => {
        this.store.set(session);
        this.settled = true;
        // Released after the current tick so everyone who asked during this one
        // shares the result, while the next caller gets a fresh attempt.
        queueMicrotask(() => { this.inFlight = null; });
        return session;
      });
  }
}
