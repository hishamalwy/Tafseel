import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, from, map } from 'rxjs';
import { Session } from '@core/auth/models/session';
import { RefreshThrottled, SESSION_GATEWAY, SESSION_STORE } from './auth.ports';

interface Attempt {
  readonly session: Session | null;
  /** Set when the refresh endpoint throttled; the session above is the one already held. */
  readonly throttled: RefreshThrottled | null;
}

/**
 * Re-establish the session from the refresh cookie.
 *
 * Runs at boot and again whenever a request comes back 401. The attempt is
 * shared (single flight), so a page that fires eight requests and gets eight 401s
 * costs one refresh rather than eight — the behaviour the old client got by
 * threading a `noRefresh` flag through every call site.
 *
 * The share is a memoised promise, not a `shareReplay` observable. With
 * `shareReplay` the pipeline runs to completion inside the first `subscribe()`
 * whenever the gateway answers synchronously, clearing the in-flight handle
 * before the second caller ever subscribes — so three concurrent calls made
 * three requests. A promise is created once per tick and every caller in that
 * tick joins the same one, whether the gateway is sync or async.
 *
 * A throttled refresh (429, G-19) is not a sign-out: the cookie is still good, so the
 * session already held is kept and only the request that needed a new token fails.
 */
@Injectable({ providedIn: 'root' })
export class RestoreSession {
  private readonly gateway = inject(SESSION_GATEWAY);
  private readonly store = inject(SESSION_STORE);

  private inFlight: Promise<Attempt> | null = null;
  private settled = false;

  /** True once the first attempt has finished, so guards can wait rather than guess. */
  get isSettled(): boolean {
    return this.settled;
  }

  execute(): Observable<Session | null> {
    return from(this.attempt()).pipe(map(attempt => attempt.session));
  }

  /**
   * Same shared attempt, for the 401 retry path: "no session" and "throttled" both become
   * errors, so the original request fails — but only "no session" cleared the store.
   */
  forRetry(): Observable<Session> {
    return from(this.attempt()).pipe(
      map(attempt => {
        if (attempt.throttled) throw attempt.throttled;
        if (!attempt.session) throw new Error('session-expired');
        return attempt.session;
      })
    );
  }

  /** Lets the next call start a fresh attempt — used after logging out. */
  reset(): void {
    this.inFlight = null;
    this.settled = false;
  }

  private attempt(): Promise<Attempt> {
    this.inFlight ??= this.begin();
    return this.inFlight;
  }

  private begin(): Promise<Attempt> {
    return firstValueFrom(this.gateway.restore())
      .then(
        (session): Attempt => {
          this.store.set(session);
          return { session, throttled: null };
        },
        (error: unknown): Attempt => {
          if (error instanceof RefreshThrottled) {
            return { session: this.store.current(), throttled: error };
          }
          // No session is an answer, not a failure.
          this.store.set(null);
          return { session: null, throttled: null };
        })
      .then(attempt => {
        this.settled = true;
        // Released after the current tick so everyone who asked during this one
        // shares the result, while the next caller gets a fresh attempt.
        queueMicrotask(() => { this.inFlight = null; });
        return attempt;
      });
  }
}
