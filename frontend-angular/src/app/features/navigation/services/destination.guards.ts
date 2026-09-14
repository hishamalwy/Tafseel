import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Role } from '@core/auth/models/role';
import { SignalSessionStore } from '@core/auth/services/session.store';
import {
  Destination, RequestSourcing, conversationDestination, disputeDestination, liveSessionDestination,
  requestDestination, teacherReviewDestination
} from '../models/destinations';

/**
 * Guards for link-only routes such as `/live-sessions/:sessionId`. They never render
 * anything: they send the reader to the screen for their role, keeping the id. Each runs
 * after `authenticatedGuard`, so a signed-out reader is asked to sign in first and returns here.
 */
function redirect(router: Router, destination: Destination): UrlTree {
  return router.createUrlTree([destination.path], { queryParams: destination.query ?? {} });
}

function destinationGuard(
  resolve: (roles: readonly Role[], route: ActivatedRouteSnapshot) => Destination | Promise<Destination>
): CanActivateFn {
  return async route => {
    const router = inject(Router);
    const roles = inject(SignalSessionStore).roles();
    return redirect(router, await resolve(roles, route));
  };
}

export const liveSessionLinkGuard: CanActivateFn = destinationGuard((roles, route) =>
  liveSessionDestination(roles, route.paramMap.get('sessionId') ?? ''));

export const conversationLinkGuard: CanActivateFn = destinationGuard((roles, route) =>
  conversationDestination(roles, route.paramMap.get('conversationId') ?? undefined));

export const disputeLinkGuard: CanActivateFn = destinationGuard((_, route) =>
  disputeDestination(route.paramMap.get('disputeId') ?? ''));

export const teacherReviewLinkGuard: CanActivateFn = destinationGuard((_, route) =>
  teacherReviewDestination(route.paramMap.get('reviewId') ?? ''));

/** `/admin/operations/:tab`, the older spelling of a tab on the operations screen. */
export const adminOperationsTabGuard: CanActivateFn = destinationGuard((_, route) =>
  ({ path: '/admin/operations', query: { tab: route.paramMap.get('tab') ?? '' } }));

/** `/requests/:requestId` and `/requests/:requestId/offers`. */
export function requestLinkGuard(offers: boolean): CanActivateFn {
  return destinationGuard(async (roles, route) => {
    const requestId = route.paramMap.get('requestId') ?? '';
    const http = inject(HttpClient);
    return requestDestination(roles, requestId, offers ? 'open' : await sourcingOf(http, requestId), offers);
  });
}

/**
 * Which kind of request an id names. A reader who cannot see the request (a teacher who has
 * not been assigned it, or a request that no longer exists) gets `unknown`, and the rules
 * send them to the list where it would appear.
 */
async function sourcingOf(http: HttpClient, requestId: string): Promise<RequestSourcing> {
  try {
    const request = await firstValueFrom(
      http.get<{ sourcingMode?: number }>(`/api/v1/learning-requests/${encodeURIComponent(requestId)}`));
    return Number(request.sourcingMode) === 1 ? 'open' : 'direct';
  } catch {
    return 'unknown';
  }
}
