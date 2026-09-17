import { inject } from '@angular/core';
import { CanActivateFn, Route, Router, Routes } from '@angular/router';
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
 *   Tafseel-Open-Marketplace   /requests/  → /requests/new (student), /teacher/opportunities (teacher)
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
 *
 * A few workspace sections are their own screens rather than the generic dashboard, and
 * are declared ahead of `:section`: the teacher's profile, services, availability and
 * publication, and the reviewer's application queue and review. Messages are one screen
 * for every role (`/messages`, `/conversations/:conversationId`).
 *   Tafseel-Disputes           /disputes/
 *   Tafseel-Payment            /checkout/                     (?orderId= / ?bookingId=)
 *   Tafseel-Mock-Checkout      /checkout/simulator/
 *
 * The server links to what a notification or email is about, without knowing who
 * will open it: `/orders/:orderId`, `/live-sessions/:sessionId`,
 * `/conversations/:conversationId`, `/requests/:requestId`, `/disputes/:disputeId`.
 * Orders, sessions, conversations and requests have their own participant-aware pages
 * (a teacher's link to an open request lands on `/teacher/opportunities/:requestId`).
 * Disputes and reviews still have no single-item screen, so a guard sends the reader to
 * the screen for their role with the id kept in the query, and that screen opens on it. Old `/app/*.dc.html` links are redirected by the server.
 * Anything else is `**`: a real not-found page, never an empty shell.
 */
type LinkTables = typeof import('@features/navigation/link.routes');

/** A signed-in link that only forwards the reader; its rules load with the first such link. */
function link(path: string, table: (tables: LinkTables) => Routes): Route {
  return {
    path,
    canActivate: [authenticatedGuard],
    loadChildren: () => import('@features/navigation/link.routes').then(table)
  };
}

/** A `?tab=` that moved to another section keeps working from links stored before the move. */
function movedTab(target: string, tabs: readonly string[]): CanActivateFn {
  return route => tabs.includes(route.queryParamMap.get('tab') ?? '')
    ? inject(Router).createUrlTree([target], { queryParams: route.queryParams })
    : true;
}

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
    path: 'requests/new/open',
    canActivate: [authenticatedGuard, roleGuard('Student')],
    loadChildren: () => import('@features/demand/demand.routes').then(m => m.OPEN_REQUEST_ROUTES)
  },
  {
    path: 'requests/:requestId/offers',
    canActivate: [authenticatedGuard, roleGuard('Student')],
    loadChildren: () => import('@features/demand/demand.routes').then(m => m.OFFERS_ROUTES)
  },
  {
    path: 'requests/:requestId',
    canActivate: [authenticatedGuard],
    loadChildren: () => import('@features/demand/demand.routes').then(m => m.REQUEST_ROUTES)
  },
  // The Wave 2 inline marketplace is retired (UX-05): `/requests` only forwards to the canonical
  // screen for the reader's role, keeping a `?requestId=` from a stored link.
  { ...link('requests', m => m.MARKETPLACE_LINK), pathMatch: 'full' },
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
  // Messages are one screen for every role.
  { path: 'student/messages', pathMatch: 'full', redirectTo: '/messages' },
  // The student's home is its own action-first screen (UX-01), ahead of the generic dashboard sections.
  // "My requests & orders" (UX-03): requests, orders and live sessions in one place.
  {
    path: 'student/requests',
    canActivate: [authenticatedGuard, roleGuard('Student')],
    loadChildren: () => import('@features/work-list/work-list.routes').then(m => m.STUDENT_WORK_ROUTES)
  },
  // Retired student destinations. The capability is not gone — it moved to where it belongs — so the
  // stored links keep working (UX-03 redirect table).
  { path: 'student/sessions', pathMatch: 'full', redirectTo: '/student/requests' },
  { path: 'student/payments', pathMatch: 'full', redirectTo: '/student/requests' },
  { path: 'student/reviews', pathMatch: 'full', redirectTo: '/student/requests' },
  // Saved teachers is a filter on Find a teacher now, so the old address carries the filter with it
  // (a string redirectTo is a path only — the query needs a UrlTree).
  {
    path: 'student/saved',
    pathMatch: 'full',
    redirectTo: () => inject(Router).createUrlTree(['/teachers'], { queryParams: { saved: '1' } })
  },
  { path: 'student/notifications', pathMatch: 'full', redirectTo: '/student/overview' },
  {
    path: 'student/overview',
    canActivate: [authenticatedGuard, roleGuard('Student')],
    loadChildren: () => import('@features/student-home/student-home.routes').then(m => m.STUDENT_HOME_ROUTES)
  },
  { path: 'teacher/messages', pathMatch: 'full', redirectTo: '/messages' },
  {
    path: 'student/:section',
    canActivate: [authenticatedGuard, roleGuard('Student')],
    data: { role: 'Student' },
    loadComponent: () => import('@features/dashboards/pages/dashboard-page.component').then(m => m.DashboardPageComponent)
  },
  { path: 'student', pathMatch: 'full', redirectTo: 'student/overview' },
  {
    path: 'teacher/opportunities/:requestId',
    canActivate: [authenticatedGuard, roleGuard('Teacher')],
    loadChildren: () => import('@features/demand/demand.routes').then(m => m.OPPORTUNITY_ROUTES)
  },

  // ---- teacher supply: each section is its own screen, ahead of the generic dashboard ----
  {
    path: 'teacher/profile',
    canActivate: [authenticatedGuard, roleGuard('Teacher'), movedTab('/teacher/qualifications', ['qualifications', 'videos', 'reviews'])],
    loadChildren: () => import('@features/teacher-setup/teacher-setup.routes').then(m => m.PROFILE_ROUTES)
  },
  {
    path: 'teacher/services',
    canActivate: [authenticatedGuard, roleGuard('Teacher'), movedTab('/teacher/availability', ['availability'])],
    loadChildren: () => import('@features/teacher-setup/teacher-setup.routes').then(m => m.SERVICES_ROUTES)
  },
  {
    path: 'teacher/availability',
    canActivate: [authenticatedGuard, roleGuard('Teacher')],
    loadChildren: () => import('@features/teacher-setup/teacher-setup.routes').then(m => m.AVAILABILITY_ROUTES)
  },
  {
    path: 'teacher/earnings',
    canActivate: [authenticatedGuard, roleGuard('Teacher')],
    loadChildren: () => import('@features/earnings/earnings.routes').then(m => m.EARNINGS_ROUTES)
  },
  // "Work" (UX-03): the teacher's assigned requests, orders and live sessions in one place.
  {
    path: 'teacher/work',
    canActivate: [authenticatedGuard, roleGuard('Teacher')],
    loadChildren: () => import('@features/work-list/work-list.routes').then(m => m.TEACHER_WORK_ROUTES)
  },
  // Hidden in V1: the quality team reviews showcases again in B11-05.
  { path: 'quality/showcases', pathMatch: 'full', redirectTo: '/quality/applications' },
  // Admin areas that V1 does not expose; the routes stay guarded, the tabs are simply not offered.
  { path: 'admin/insights', pathMatch: 'full', redirectTo: '/admin/home' },
  // The teacher's home is its own action-first screen (UX-02), ahead of the generic dashboard sections.
  {
    path: 'teacher/home',
    canActivate: [authenticatedGuard, roleGuard('Teacher')],
    loadChildren: () => import('@features/teacher-home/teacher-home.routes').then(m => m.TEACHER_HOME_ROUTES)
  },
  {
    path: 'teacher/publication',
    canActivate: [authenticatedGuard, roleGuard('Teacher')],
    loadChildren: () => import('@features/teacher-setup/teacher-setup.routes').then(m => m.PUBLICATION_ROUTES)
  },
  {
    path: 'teacher/:section',
    canActivate: [authenticatedGuard, roleGuard('Teacher')],
    data: { role: 'Teacher' },
    loadComponent: () => import('@features/dashboards/pages/dashboard-page.component').then(m => m.DashboardPageComponent)
  },
  { path: 'teacher', pathMatch: 'full', redirectTo: 'teacher/home' },
  {
    path: 'quality/applications/:applicationId',
    canActivate: [authenticatedGuard, roleGuard('QualityReviewer')],
    loadChildren: () => import('@features/quality/quality.routes').then(m => m.REVIEW_ROUTES)
  },
  {
    path: 'quality/applications',
    canActivate: [authenticatedGuard, roleGuard('QualityReviewer')],
    loadChildren: () => import('@features/quality/quality.routes').then(m => m.QUEUE_ROUTES)
  },
  // The review area was split into applications and showcases; stored links still name it.
  {
    path: 'quality/review',
    pathMatch: 'full',
    redirectTo: ({ queryParams }) => {
      const router = inject(Router), selectedId = queryParams['selectedId'];
      if (queryParams['tab'] === 'showcases')
        return router.createUrlTree(['/quality/showcases'], { queryParams: selectedId ? { selectedId } : {} });
      return router.createUrlTree(selectedId ? ['/quality/applications', selectedId] : ['/quality/applications']);
    }
  },
  {
    path: 'quality/:section',
    canActivate: [authenticatedGuard, roleGuard('QualityReviewer')],
    data: { role: 'QualityReviewer' },
    loadComponent: () => import('@features/dashboards/pages/dashboard-page.component').then(m => m.DashboardPageComponent)
  },
  { path: 'quality', pathMatch: 'full', redirectTo: 'quality/applications' },
  {
    path: 'admin/:section',
    canActivate: [authenticatedGuard, roleGuard('Admin')],
    data: { role: 'Admin' },
    loadComponent: () => import('@features/dashboards/pages/dashboard-page.component').then(m => m.DashboardPageComponent)
  },
  { path: 'admin', pathMatch: 'full', redirectTo: 'admin/home' },

  // ---- links the server hands out ----
  {
    path: 'orders/:orderId',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('@features/orders/pages/order-detail-page.component')
      .then(m => m.OrderDetailPageComponent)
  },
  {
    path: 'live-sessions/:sessionId',
    canActivate: [authenticatedGuard],
    loadChildren: () => import('@features/live-sessions/live-sessions.routes').then(m => m.LIVE_SESSION_ROUTES)
  },
  {
    path: 'conversations/:conversationId',
    canActivate: [authenticatedGuard],
    loadChildren: () => import('@features/messages/messages.routes').then(m => m.MESSAGES_ROUTES)
  },
  {
    path: 'messages',
    canActivate: [authenticatedGuard],
    loadChildren: () => import('@features/messages/messages.routes').then(m => m.MESSAGES_ROUTES)
  },
  link('disputes/:disputeId', m => m.DISPUTE_LINK),
  link('teacher/reviews/:reviewId', m => m.TEACHER_REVIEW_LINK),
  link('admin/operations/:tab', m => m.ADMIN_OPERATIONS_TAB_LINK),

  {
    path: '**',
    loadComponent: () => import('@features/navigation/pages/not-found-page.component')
      .then(m => m.NotFoundPageComponent)
  }
];
