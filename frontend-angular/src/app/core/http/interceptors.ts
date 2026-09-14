import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { RestoreSession } from '@core/auth/services/restore-session.use-case';
import { SignalSessionStore } from '@core/auth/services/session.store';

/** These endpoints *are* the auth flow; retrying them would loop. */
const NO_RETRY = ['/api/v1/auth/refresh', '/api/v1/auth/login', '/api/v1/auth/register'];

/** Attach the bearer token and always send cookies on API calls. */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);

  const token = inject(SignalSessionStore).accessToken();
  return next(req.clone({
    withCredentials: true,
    setHeaders: token ? { Authorization: `Bearer ${token}` } : {}
  }));
};

/**
 * On a 401, refresh once and replay.
 *
 * The shared in-flight refresh lives in the use case, so a burst of parallel
 * 401s costs one round trip and every request replays with the new token.
 */
export const authRetryInterceptor: HttpInterceptorFn = (req, next) => {
  const restore = inject(RestoreSession);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) return throwError(() => error);

      const retriable = error.status === 401
        && req.url.startsWith('/api/')
        && !NO_RETRY.some(path => req.url.startsWith(path));

      if (!retriable) return throwError(() => error);

      return restore.forRetry().pipe(
        switchMap(session => next(req.clone({
          withCredentials: true,
          setHeaders: { Authorization: `Bearer ${session.accessToken}` }
        }))),
        catchError(() => throwError(() => error))
      );
    })
  );
};
