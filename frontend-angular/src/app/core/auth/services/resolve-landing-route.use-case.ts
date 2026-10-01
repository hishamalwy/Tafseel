import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Role, primaryRole } from '@core/auth/models/role';
import { TEACHER_LIFECYCLE_GATEWAY } from './auth.ports';

/** Home surface per role, in one place rather than scattered across guards. */
const HOME_BY_ROLE: Readonly<Record<Role, string>> = {
  Admin: '/admin',
  Finance: '/finance',
  QualityReviewer: '/quality',
  Teacher: '/teacher',
  Student: '/student'
};

/**
 * Where a user goes after signing in.
 *
 * Ported from `destination()` in the original Auth page, including its one
 * exception: a Teacher who has not finished onboarding goes to their lifecycle
 * step even when a destination was requested, because an unpublished Teacher
 * cannot use the workspace that destination points at.
 */
@Injectable({ providedIn: 'root' })
export class ResolveLandingRoute {
  private readonly lifecycle = inject(TEACHER_LIFECYCLE_GATEWAY);

  async execute(roles: readonly Role[], requested: string | null): Promise<string> {
    if (roles.includes('Teacher')) {
      try {
        const status = await firstValueFrom(this.lifecycle.onboardingStatus());
        if (!status.isPublished && status.nextUrl) return status.nextUrl;
      } catch {
        // Status unknown: send them to the application rather than a workspace
        // that may reject them.
        return '/teach/apply';
      }
    }
    return requested ?? this.homeFor(roles);
  }

  homeFor(roles: readonly Role[]): string {
    const role = primaryRole(roles);
    return role ? HOME_BY_ROLE[role] : '/';
  }
}
