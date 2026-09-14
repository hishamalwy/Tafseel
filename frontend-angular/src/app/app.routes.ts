import { Routes } from '@angular/router';
import { authenticatedGuard, guestOnlyGuard, roleGuard } from '@core/auth/guards/auth.guards';

/**
 * The route table for the whole app.
 *
 * Naming follows the resource, not the old file. Where the legacy page carried
 * its identity in a query string, it becomes a path segment — `?id=` and
 * `?policy=` and `?section=` name *which* thing is being shown, so they belong in
 * the path where they can be linked, prerendered and indexed separately.
 * Genuine modifiers (`?tab=`, `?chatWith=`, `?ref=`) stay query parameters.
 *
 *   Tafseel-Landing            /
 *   Tafseel-Browse-Teachers    /teachers/
 *   Tafseel-Teacher-Profile    /teachers/:teacherId/          (was ?id=)
 *   Tafseel-Open-Marketplace   /requests/
 *   Tafseel-Request            /requests/new/
 *   Tafseel-Book-Session       /sessions/book/                (?teacherId= is a modifier)
 *   Tafseel-Auth               /auth/
 *   Tafseel-Confirm-Email      /auth/confirm-email/
 *   Tafseel-About              /about/
 *   Tafseel-Policies           /policies/:policy/             (was ?policy=)
 *   Tafseel-Teacher-Apply      /teach/apply/
 *   Tafseel-Student-Dashboard  /student/:section/             (was ?section=)
 *   Tafseel-Teacher-Dashboard  /teacher/:section/
 *   Tafseel-Quality-Dashboard  /quality/:section/
 *   Tafseel-Admin-Dashboard    /admin/:section/
 *   Tafseel-Disputes           /disputes/
 *   Tafseel-Payment            /checkout/                     (?orderId= / ?bookingId=)
 *   Tafseel-Mock-Checkout      /checkout/simulator/
 *
 * Screens not yet migrated are absent rather than stubbed: an absent route falls
 * through to the legacy page, which is the behaviour that keeps the site working
 * mid-migration. Adding a placeholder component would break that.
 */
export const routes: Routes = [
  // ---- public ----
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('@features/landing/pages/landing-page.component')
        .then(m => m.LandingPageComponent)
  },
  {
    path: 'about',
    loadComponent: () =>
      import('@features/about/pages/about-page.component')
        .then(m => m.AboutPageComponent)
  },
  {
    path: 'requests/new',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('@features/requests/pages/new-request-page.component')
        .then(m => m.NewRequestPageComponent)
  },
  {
    path: 'requests',
    pathMatch: 'full',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('@features/requests/pages/marketplace-page.component')
        .then(m => m.MarketplacePageComponent)
  },
  {
    path: 'teachers',
    pathMatch: 'full',
    loadComponent: () =>
      import('@features/teachers/pages/browse-teachers-page.component')
        .then(m => m.BrowseTeachersPageComponent)
  },
  {
    path: 'teachers/:teacherId',
    loadComponent: () =>
      import('@features/teachers/pages/teacher-profile-page.component')
        .then(m => m.TeacherProfilePageComponent)
  },
  {
    path: 'policies/:policy',
    loadComponent: () =>
      import('@features/policies/pages/policies-page.component')
        .then(m => m.PoliciesPageComponent)
  },
  { path: 'policies', pathMatch: 'full', redirectTo: 'policies/terms' },

  // ---- authentication ----
  {
    path: 'auth',
    canActivate: [guestOnlyGuard],
    loadComponent: () =>
      import('@features/auth/pages/auth-page.component')
        .then(m => m.AuthPageComponent),
    title: 'Log in — Tafseel'
  },
  {
    path: 'teach/apply',
    canActivate: [authenticatedGuard, roleGuard('Teacher')],
    loadComponent: () => import('@features/teach/pages/teacher-apply-page.component')
      .then(m => m.TeacherApplyPageComponent)
  },
  {
    path: 'disputes',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('@features/disputes/pages/disputes-page.component')
        .then(m => m.DisputesPageComponent)
  },
  {
    path: 'sessions/book',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('@features/checkout/pages/book-session-page.component')
        .then(m => m.BookSessionPageComponent)
  },
  {
    path: 'checkout/simulator',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('@features/checkout/pages/payment-simulator-page.component')
        .then(m => m.PaymentSimulatorPageComponent)
  },
  {
    path: 'checkout',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('@features/checkout/pages/payment-page.component')
        .then(m => m.PaymentPageComponent)
  },
  {
    path: 'auth/confirm-email',
    loadComponent: () =>
      import('@features/auth/pages/confirm-email-page.component')
        .then(m => m.ConfirmEmailPageComponent),
    title: 'Confirm your email — Tafseel'
  },
  {
    path: 'student/:section',
    canActivate: [authenticatedGuard, roleGuard('Student')],
    data: { role: 'Student' },
    loadComponent: () => import('@features/dashboards/pages/dashboard-page.component').then(m => m.DashboardPageComponent)
  },
  { path: 'student', pathMatch: 'full', redirectTo: 'student/overview' },
  {
    path: 'teacher/:section',
    canActivate: [authenticatedGuard, roleGuard('Teacher')],
    data: { role: 'Teacher' },
    loadComponent: () => import('@features/dashboards/pages/dashboard-page.component').then(m => m.DashboardPageComponent)
  },
  { path: 'teacher', pathMatch: 'full', redirectTo: 'teacher/home' },
  {
    path: 'quality/:section',
    canActivate: [authenticatedGuard, roleGuard('QualityReviewer')],
    data: { role: 'QualityReviewer' },
    loadComponent: () => import('@features/dashboards/pages/dashboard-page.component').then(m => m.DashboardPageComponent)
  },
  { path: 'quality', pathMatch: 'full', redirectTo: 'quality/review' },
  {
    path: 'admin/:section',
    canActivate: [authenticatedGuard, roleGuard('Admin')],
    data: { role: 'Admin' },
    loadComponent: () => import('@features/dashboards/pages/dashboard-page.component').then(m => m.DashboardPageComponent)
  },
  { path: 'admin', pathMatch: 'full', redirectTo: 'admin/home' }
];
