import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Role } from '@core/auth/models/role';
import { RestoreSession } from '@core/auth/services/restore-session.use-case';
import { ResolveLandingRoute } from '@core/auth/services/resolve-landing-route.use-case';
import { SignalSessionStore } from '@core/auth/services/session.store';

/** Control characters and DEL, written as escapes so this file stays plain text. */
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]');

/**
 * Only same-origin application routes may be used as a post-login destination.
 *
 * The Angular equivalent of `Tafseel.safeAppReturnHref`, with the one behaviour
 * that made it fragile removed: the original required a literal `/app/` prefix
 * and silently dropped the destination anywhere else, so the return-to feature
 * quietly stopped working outside production's mount point. The test here is
 * structural — a rooted, single-slash path that is not itself the auth route —
 * so it holds wherever the app is served from.
 */
export function safeReturnUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let value: string;
  try {
    value = decodeURIComponent(String(raw)).trim();
  } catch {
    return null;
  }
  if (!value) return null;

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;       // absolute URL
  if (value.startsWith('//') || value.includes('\\')) return null;
  if (CONTROL_CHARS.test(value)) return null;
  if (!value.startsWith('/')) return null;

  const path = value.split('#')[0]!.split('?')[0]!;
  if (path.includes('//')) return null;                       // normalises to a host
  if (path === '/auth' || path.startsWith('/auth/')) return null;

  return value;
}

/** Wait for the one-shot session probe before deciding anything. */
async function settled(restore: RestoreSession): Promise<void> {
  if (!restore.isSettled) await firstValueFrom(restore.execute());
}

export const authenticatedGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const restore = inject(RestoreSession);
  const store = inject(SignalSessionStore);
  const router = inject(Router);

  await settled(restore);
  if (store.isAuthenticated()) return true;

  return router.createUrlTree(['/auth'], { queryParams: { return: state.url } });
};

/**
 * Role gate. An authenticated user without the role goes to their own home, not
 * the login form — being signed in as the wrong role is not an authentication
 * failure, and logging in again would not fix it.
 */
export function roleGuard(...allowed: readonly Role[]): CanActivateFn {
  return async (_route, state): Promise<boolean | UrlTree> => {
    const restore = inject(RestoreSession);
    const store = inject(SignalSessionStore);
    const landing = inject(ResolveLandingRoute);
    const router = inject(Router);

    await settled(restore);
    if (!store.isAuthenticated()) {
      return router.createUrlTree(['/auth'], { queryParams: { return: state.url } });
    }

    const roles = store.roles();
    if (allowed.some(r => roles.includes(r))) return true;

    return router.parseUrl(landing.homeFor(roles));
  };
}

/** Keeps a signed-in user off the login form; sends them where they were headed. */
export const guestOnlyGuard: CanActivateFn = async (route): Promise<boolean | UrlTree> => {
  const restore = inject(RestoreSession);
  const store = inject(SignalSessionStore);
  const landing = inject(ResolveLandingRoute);
  const router = inject(Router);

  await settled(restore);
  if (!store.isAuthenticated()) return true;

  // A reset link carries its own token and must stay reachable even when signed
  // in: the whole point is changing the password of the account you hold.
  if (route.queryParamMap.get('token')) return true;

  const target = safeReturnUrl(route.queryParamMap.get('return')) ?? landing.homeFor(store.roles());
  return router.parseUrl(target);
};
