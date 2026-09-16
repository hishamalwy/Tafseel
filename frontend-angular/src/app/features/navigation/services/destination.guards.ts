import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from '@angular/router';
import { Role } from '@core/auth/models/role';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { Destination, disputeDestination, marketplaceDestination, teacherReviewDestination } from '../models/destinations';

/**
 * Guards for link-only routes such as `/disputes/:disputeId`. They never render
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

export const disputeLinkGuard: CanActivateFn = destinationGuard((_, route) =>
  disputeDestination(route.paramMap.get('disputeId') ?? ''));

export const teacherReviewLinkGuard: CanActivateFn = destinationGuard((_, route) =>
  teacherReviewDestination(route.paramMap.get('reviewId') ?? ''));

/** `/requests` and `/requests?requestId=`: the retired inline marketplace, forwarded to the role's canonical screen. */
export const marketplaceLinkGuard: CanActivateFn = destinationGuard((roles, route) =>
  marketplaceDestination(roles, route.queryParamMap.get('requestId')));

/** `/admin/operations/:tab`, the older spelling of a tab on the operations screen. */
export const adminOperationsTabGuard: CanActivateFn = destinationGuard((_, route) =>
  ({ path: '/admin/operations', query: { tab: route.paramMap.get('tab') ?? '' } }));

