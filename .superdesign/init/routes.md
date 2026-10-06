# Route map

Complete configured Angular route mapping, including redirects and role gates. `:section` routes use the generic role dashboard and their section content is data-driven. Alias/guard-only routes do not represent additional page implementations. All routed pages render inside the root `AppComponent` router outlet. Prepared 2026-10-05.

| URL | Component / redirect | Layout | Guards / role context |
| --- | --- | --- | --- |
| `/` | `frontend-angular/src/app/features/landing/pages/landing-page.component.ts` (LandingPageComponent) | landing-footer, public-header, skip-link | Public |
| `/about` | `frontend-angular/src/app/features/about/pages/about-page.component.ts` (AboutPageComponent) | landing-footer, public-header, skip-link | Public |
| `/requests/new` | `frontend-angular/src/app/features/requests/pages/new-request-page.component.ts` (NewRequestPageComponent) | skip-link, workflow-header | [authenticatedGuard, requestEntry] |
| `/requests/new/open` | `frontend-angular/src/app/features/demand/pages/open-request-page.component.ts` (OpenRequestPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Student')] |
| `/requests/:requestId/offers` | `frontend-angular/src/app/features/demand/pages/offers-page.component.ts` (OffersPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Student')] |
| `/requests/:requestId` | `frontend-angular/src/app/features/demand/pages/request-detail-page.component.ts` (RequestDetailPageComponent) | workspace-shell | [authenticatedGuard] |
| `/requests` | Guard redirect via `frontend-angular/src/app/features/navigation/link.routes.ts` | None / guard redirect | [authenticatedGuard] → [marketplaceLinkGuard] |
| `/teachers` | `frontend-angular/src/app/features/teachers/pages/browse-teachers-page.component.ts` (BrowseTeachersPageComponent) | public-header, skip-link | Public |
| `/teachers/:teacherId` | `frontend-angular/src/app/features/teachers/pages/teacher-profile-page.component.ts` (TeacherProfilePageComponent) | public-header, skip-link | Public |
| `/policies/:policy` | `frontend-angular/src/app/features/policies/pages/policies-page.component.ts` (PoliciesPageComponent) | skip-link, workflow-header | Public |
| `/policies` | Redirect: `'policies/terms'` | None / guard redirect | Public |
| `/auth` | `frontend-angular/src/app/features/auth/pages/auth-page.component.ts` (AuthPageComponent) | auth-shell | [guestOnlyGuard] |
| `/teach/apply` | `frontend-angular/src/app/features/teach/pages/teacher-apply-page.component.ts` (TeacherApplyPageComponent) | skip-link, workflow-header | [authenticatedGuard, roleGuard('Teacher')] |
| `/disputes` | `frontend-angular/src/app/features/disputes/pages/disputes-page.component.ts` (DisputesPageComponent) | skip-link, workflow-header | [authenticatedGuard] |
| `/sessions/book` | `frontend-angular/src/app/features/checkout/pages/book-session-page.component.ts` (BookSessionPageComponent) | skip-link, workflow-header | [authenticatedGuard] |
| `/checkout/simulator` | `frontend-angular/src/app/features/checkout/pages/payment-simulator-page.component.ts` (PaymentSimulatorPageComponent) | skip-link, workflow-header | [authenticatedGuard] |
| `/checkout` | `frontend-angular/src/app/features/checkout/pages/payment-page.component.ts` (PaymentPageComponent) | skip-link, workflow-header | [authenticatedGuard] |
| `/auth/confirm-email` | `frontend-angular/src/app/features/auth/pages/confirm-email-page.component.ts` (ConfirmEmailPageComponent) | auth-shell | Public |
| `/student/messages` | Redirect: `'/messages'` | None / guard redirect | Public |
| `/student/requests` | `frontend-angular/src/app/features/work-list/pages/work-list-page.component.ts` (WorkListPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Student')] { viewer: 'student' } |
| `/student/sessions` | Redirect: `'/student/requests'` | None / guard redirect | Public |
| `/student/payments` | Redirect: `'/student/requests'` | None / guard redirect | Public |
| `/student/reviews` | Redirect: `'/student/requests'` | None / guard redirect | Public |
| `/student/saved` | Redirect: `() => inject(Router).createUrlTree(['/teachers'], { queryParams: { saved: '1' } })` | None / guard redirect | Public |
| `/student/notifications` | Redirect: `'/student/overview'` | None / guard redirect | Public |
| `/student/overview` | `frontend-angular/src/app/features/student-home/pages/student-home-page.component.ts` (StudentHomePageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Student')] |
| `/teacher/messages` | Redirect: `'/messages'` | None / guard redirect | Public |
| `/student/settings` | Redirect: `'/account'` | None / guard redirect | Public |
| `/student/:section` | `frontend-angular/src/app/features/dashboards/pages/dashboard-page.component.ts` (DashboardPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Student')] { role: 'Student' } |
| `/student` | Redirect: `'student/overview'` | None / guard redirect | Public |
| `/teacher/offers` | `frontend-angular/src/app/features/demand/pages/my-offers-page.component.ts` (MyOffersPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Teacher')] |
| `/teacher/opportunities/:requestId` | `frontend-angular/src/app/features/demand/pages/opportunity-page.component.ts` (OpportunityPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Teacher')] |
| `/teacher/profile` | `frontend-angular/src/app/features/teacher-setup/pages/teacher-profile-editor-page.component.ts` (TeacherProfileEditorPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Teacher'), movedTab('/teacher/qualifications', ['qualifications', 'videos', 'reviews'])] |
| `/teacher/services` | `frontend-angular/src/app/features/teacher-setup/pages/teacher-services-page.component.ts` (TeacherServicesPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Teacher'), movedTab('/teacher/availability', ['availability'])] |
| `/teacher/availability` | `frontend-angular/src/app/features/teacher-setup/pages/teacher-availability-page.component.ts` (TeacherAvailabilityPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Teacher')] |
| `/teacher/earnings` | `frontend-angular/src/app/features/earnings/pages/teacher-earnings-page.component.ts` (TeacherEarningsPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Teacher')] |
| `/teacher/work` | `frontend-angular/src/app/features/work-list/pages/work-list-page.component.ts` (WorkListPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Teacher')] { viewer: 'teacher' } |
| `/quality/showcases` | Redirect: `'/quality/applications'` | None / guard redirect | Public |
| `/admin/insights` | Redirect: `'/admin/home'` | None / guard redirect | Public |
| `/teacher/home` | `frontend-angular/src/app/features/teacher-home/pages/teacher-home-page.component.ts` (TeacherHomePageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Teacher')] |
| `/teacher/publication` | `frontend-angular/src/app/features/teacher-setup/pages/teacher-publication-page.component.ts` (TeacherPublicationPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Teacher')] |
| `/teacher/settings` | Redirect: `'/account'` | None / guard redirect | Public |
| `/teacher/:section` | `frontend-angular/src/app/features/dashboards/pages/dashboard-page.component.ts` (DashboardPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Teacher')] { role: 'Teacher' } |
| `/teacher` | Redirect: `'teacher/home'` | None / guard redirect | Public |
| `/quality/applications/:applicationId` | `frontend-angular/src/app/features/quality/pages/application-review-page.component.ts` (ApplicationReviewPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('QualityReviewer')] |
| `/quality/applications` | `frontend-angular/src/app/features/quality/pages/application-queue-page.component.ts` (ApplicationQueuePageComponent) | workspace-shell | [authenticatedGuard, roleGuard('QualityReviewer')] |
| `/quality/review` | Redirect: `({ queryParams }) => { const router = inject(Router), selectedId = queryParams['selectedId']; if (queryParams['tab'] === 'showcases') return router.createUrlTree(['/quality/showcases'], { queryParams: selectedId ? { selectedId } : {} }); return router.createUrlTree(selectedId ? ['/quality/applications', selectedId] : ['/quality/applications']); }` | None / guard redirect | Public |
| `/quality/account` | Redirect: `'/account'` | None / guard redirect | Public |
| `/quality/:section` | `frontend-angular/src/app/features/dashboards/pages/dashboard-page.component.ts` (DashboardPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('QualityReviewer')] { role: 'QualityReviewer' } |
| `/quality` | Redirect: `'quality/applications'` | None / guard redirect | Public |
| `/admin/marketplace` | `frontend-angular/src/app/features/admin/pages/admin-catalog-page.component.ts` (AdminCatalogPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Admin')] |
| `/admin/marketing` | Redirect: `'admin/marketing/coupons'` | None / guard redirect | Public |
| `/admin/marketing/:tab` | `frontend-angular/src/app/features/admin-marketing/pages/admin-marketing-page.component.ts` (AdminMarketingPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Admin')] |
| `/account` | `frontend-angular/src/app/features/account/pages/account-settings-page.component.ts` (AccountSettingsPageComponent) | workspace-shell | [authenticatedGuard] |
| `/help/account-access` | `frontend-angular/src/app/features/support/pages/account-access-page.component.ts` (AccountAccessPageComponent) | public-header, skip-link | Public |
| `/help` | `frontend-angular/src/app/features/support/pages/help-page.component.ts` (HelpPageComponent) | workspace-shell | [authenticatedGuard] |
| `/help/cases/:id` | `frontend-angular/src/app/features/support/pages/help-case-page.component.ts` (HelpCasePageComponent) | workspace-shell | [authenticatedGuard] |
| `/admin/help` | `frontend-angular/src/app/features/support/pages/admin-help-queue-page.component.ts` (AdminHelpQueuePageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Admin')] |
| `/admin/help/:id` | `frontend-angular/src/app/features/support/pages/admin-help-case-page.component.ts` (AdminHelpCasePageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Admin')] |
| `/admin/finance` | Redirect: `'finance/home'` | None / guard redirect | Public |
| `/finance` | Redirect: `'finance/home'` | None / guard redirect | Public |
| `/finance/home` | `frontend-angular/src/app/features/finance/pages/finance-home-page.component.ts` (FinanceHomePageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Finance', 'Admin')] |
| `/finance/payments` | `frontend-angular/src/app/features/finance/pages/finance-payments-page.component.ts` (FinancePaymentsPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Finance', 'Admin')] |
| `/finance/payments/:id` | `frontend-angular/src/app/features/finance/pages/finance-payment-page.component.ts` (FinancePaymentPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Finance', 'Admin')] |
| `/finance/withdrawals` | `frontend-angular/src/app/features/finance/pages/finance-withdrawals-page.component.ts` (FinanceWithdrawalsPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Finance', 'Admin')] |
| `/finance/payout-profiles` | `frontend-angular/src/app/features/finance/pages/finance-payout-profiles-page.component.ts` (FinancePayoutProfilesPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Finance', 'Admin')] |
| `/finance/reconciliation` | `frontend-angular/src/app/features/finance/pages/finance-reconciliation-page.component.ts` (FinanceReconciliationPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Finance', 'Admin')] |
| `/finance/audit` | `frontend-angular/src/app/features/finance/pages/finance-audit-page.component.ts` (FinanceAuditPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Finance', 'Admin')] |
| `/admin/:section` | `frontend-angular/src/app/features/dashboards/pages/dashboard-page.component.ts` (DashboardPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Admin')] { role: 'Admin' } |
| `/admin` | Redirect: `'admin/home'` | None / guard redirect | Public |
| `/orders/:orderId` | `frontend-angular/src/app/features/orders/pages/order-detail-page.component.ts` (OrderDetailPageComponent) | workspace-shell | [authenticatedGuard] |
| `/live-sessions/:sessionId` | `frontend-angular/src/app/features/live-sessions/pages/live-session-page.component.ts` (LiveSessionPageComponent) | workspace-shell | [authenticatedGuard] |
| `/conversations/:conversationId` | `frontend-angular/src/app/features/messages/pages/messages-page.component.ts` (MessagesPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Student', 'Teacher')] |
| `/messages` | `frontend-angular/src/app/features/messages/pages/messages-page.component.ts` (MessagesPageComponent) | workspace-shell | [authenticatedGuard, roleGuard('Student', 'Teacher')] |
| `/disputes/:disputeId` | Guard redirect via `frontend-angular/src/app/features/navigation/link.routes.ts` | None / guard redirect | [authenticatedGuard] → [disputeLinkGuard] |
| `/teacher/reviews/:reviewId` | Guard redirect via `frontend-angular/src/app/features/navigation/link.routes.ts` | None / guard redirect | [authenticatedGuard] → [teacherReviewLinkGuard] |
| `/admin/operations/:tab` | Guard redirect via `frontend-angular/src/app/features/navigation/link.routes.ts` | None / guard redirect | [authenticatedGuard] → [adminOperationsTabGuard] |
| `/**` | `frontend-angular/src/app/features/navigation/pages/not-found-page.component.ts` (NotFoundPageComponent) | skip-link, workflow-header | Public |

## Key page summaries

- `/`: two-sided learning marketplace introduction, teacher search/upload request entry, Saudi regional visual, interactive request demonstration, subjects, real featured teachers, services, escrow explanation, final conversion and campaign dialog.
- `/teachers`: teacher discovery, search/filter/saved results and profile navigation.
- `/teachers/:teacherId`: public teacher profile and service/request entry.
- `/requests/new/open`: authenticated Student explanation request workflow.
- `/student/overview`: current Student work and next required actions.
- `/teacher/home`: Teacher workspace summary and action priorities.
- `/checkout`: order/session payment workflow.
- `/messages`, `/conversations/:conversationId`: role-neutral inbox/conversation workspace.
- `/account`: shared authenticated account settings.
- `/auth`: login, registration and account recovery.

## Full route configuration

### frontend-angular/src/app/app.routes.server.ts

```ts
import { RenderMode, ServerRoute } from '@angular/ssr';
import { POLICY_ORDER } from '@features/policies/models/policy';

/**
 * Render mode per route — the answer to "SEO or engineering discipline".
 *
 * The split is the one the product already implies, and the one Phase 00 wrote
 * into the legacy pages as `robots` tags:
 *
 *  - Prerender  static marketing surfaces. Built once, served as HTML, no Node
 *               process at request time.
 *  - Server     data-driven public pages. These are the ones a crawler must see
 *               filled in, and their content changes per request.
 *  - Client     everything behind a login. Already `noindex`; rendering them on
 *               the server would leak nothing useful and cost a round trip.
 *
 * `/auth` is Client on purpose: it is a form with no indexable content, it reads
 * `localStorage` for theme and language before first paint, and server-rendering
 * a login screen invites caching a page that varies per visitor.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: 'policies/:policy',
    renderMode: RenderMode.Prerender,
    // The set is closed and known at build time, so every document becomes a
    // real HTML file — indexable, and served without a Node process.
    getPrerenderParams: async () => POLICY_ORDER.map(policy => ({ policy }))
  },
  { path: 'policies', renderMode: RenderMode.Prerender },

  { path: 'about', renderMode: RenderMode.Prerender },

  // The home page is public, data-driven and the one page a crawler reaches
  // first, so it renders on the server with real teachers and subjects in it.
  { path: '', renderMode: RenderMode.Server },

  // Public and data-driven: exactly the pages a crawler must see filled in, and
  // their content changes per request, so they render on the server.
  { path: 'teachers', renderMode: RenderMode.Server },
  { path: 'teachers/:teacherId', renderMode: RenderMode.Server },

  // Forms behind no index value: they read localStorage before first paint and
  // vary per visitor, so there is nothing to gain from rendering them upstream.
  { path: 'auth', renderMode: RenderMode.Client },
  { path: 'auth/confirm-email', renderMode: RenderMode.Client },
  { path: 'disputes', renderMode: RenderMode.Client },
  { path: 'checkout', renderMode: RenderMode.Client },
  { path: 'checkout/simulator', renderMode: RenderMode.Client },
  { path: 'sessions/book', renderMode: RenderMode.Client },
  { path: 'requests/new', renderMode: RenderMode.Client },
  { path: 'requests', renderMode: RenderMode.Client },
  { path: 'teach/apply', renderMode: RenderMode.Client },
  { path: 'student/**', renderMode: RenderMode.Client },
  { path: 'teacher/**', renderMode: RenderMode.Client },
  { path: 'quality/**', renderMode: RenderMode.Client },
  { path: 'admin/**', renderMode: RenderMode.Client },

  // Links the server hands out, all behind a login.
  { path: 'orders/:orderId', renderMode: RenderMode.Client },
  { path: 'live-sessions/:sessionId', renderMode: RenderMode.Client },
  { path: 'conversations/:conversationId', renderMode: RenderMode.Client },
  { path: 'messages', renderMode: RenderMode.Client },
  { path: 'requests/**', renderMode: RenderMode.Client },
  { path: 'disputes/**', renderMode: RenderMode.Client },

  // Unknown addresses render the not-found page in the browser; there is nothing to
  // prerender for a path nobody defined.
  { path: '**', renderMode: RenderMode.Client }
];
```

### frontend-angular/src/app/app.routes.ts

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Route, Router, Routes } from '@angular/router';
import { authenticatedGuard, guestOnlyGuard, roleGuard } from '@core/auth/guards/auth.guards';
import { unsavedChangesGuard } from '@shared/utils/unsaved-changes';

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

// A generic “Post a request” opens the explanation form. Teacher-specific
// links retain their existing direct-request wizard and context.
const requestEntry: CanActivateFn = route => route.queryParamMap.get('teacherId')?.trim()
  ? true
  : inject(Router).createUrlTree(['/requests/new/open'], { queryParams: route.queryParams });

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
    canActivate: [authenticatedGuard, requestEntry],
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
  // PRODUCT-P1: account settings live on /account for every role.
  { path: 'student/settings', pathMatch: 'full', redirectTo: '/account' },
  {
    path: 'student/:section',
    canActivate: [authenticatedGuard, roleGuard('Student')],
    data: { role: 'Student' },
    loadComponent: () => import('@features/dashboards/pages/dashboard-page.component').then(m => m.DashboardPageComponent)
  },
  { path: 'student', pathMatch: 'full', redirectTo: 'student/overview' },
  {
    path: 'teacher/offers',
    canActivate: [authenticatedGuard, roleGuard('Teacher')],
    loadChildren: () => import('@features/demand/demand.routes').then(m => m.MY_OFFERS_ROUTES)
  },
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
  // PRODUCT-P1: account settings live on /account for every role.
  { path: 'teacher/settings', pathMatch: 'full', redirectTo: '/account' },
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
  // PRODUCT-P1: account settings live on /account for every role.
  { path: 'quality/account', pathMatch: 'full', redirectTo: '/account' },
  {
    path: 'quality/:section',
    canActivate: [authenticatedGuard, roleGuard('QualityReviewer')],
    data: { role: 'QualityReviewer' },
    loadComponent: () => import('@features/dashboards/pages/dashboard-page.component').then(m => m.DashboardPageComponent)
  },
  { path: 'quality', pathMatch: 'full', redirectTo: 'quality/applications' },
  // Catalog & pricing is its own screen: subjects, qualification topics and the service price policy are
  // created and edited here (J13-03, PROD-01, OPS-04), which the generic list could not do.
  {
    path: 'admin/marketplace',
    canActivate: [authenticatedGuard, roleGuard('Admin')],
    loadChildren: () => import('@features/admin/admin.routes').then(m => m.CATALOG_ROUTES)
  },
  { path: 'admin/marketing', pathMatch: 'full', redirectTo: 'admin/marketing/coupons' },
  {
    path: 'admin/marketing/:tab',
    canActivate: [authenticatedGuard, roleGuard('Admin')],
    loadChildren: () => import('@features/admin-marketing/admin-marketing.routes').then(m => m.ADMIN_MARKETING_ROUTES)
  },
  // PRODUCT-P1: one account page for every role (name, photo, password, devices, notifications, data, deletion).
  {
    path: 'account',
    canDeactivate: [unsavedChangesGuard],
    canActivate: [authenticatedGuard],
    loadComponent: () => import('@features/account/pages/account-settings-page.component').then(m => m.AccountSettingsPageComponent)
  },
  // Help and abuse reports outside paid purchases. Signed-out people can report an account-access problem.
  {
    path: 'help/account-access',
    loadComponent: () => import('@features/support/pages/account-access-page.component').then(m => m.AccountAccessPageComponent)
  },
  {
    path: 'help',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('@features/support/pages/help-page.component').then(m => m.HelpPageComponent)
  },
  {
    path: 'help/cases/:id',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('@features/support/pages/help-case-page.component').then(m => m.HelpCasePageComponent)
  },
  {
    path: 'admin/help',
    canActivate: [authenticatedGuard, roleGuard('Admin')],
    loadComponent: () => import('@features/support/pages/admin-help-queue-page.component').then(m => m.AdminHelpQueuePageComponent)
  },
  {
    path: 'admin/help/:id',
    canActivate: [authenticatedGuard, roleGuard('Admin')],
    loadComponent: () => import('@features/support/pages/admin-help-case-page.component').then(m => m.AdminHelpCasePageComponent)
  },
  // The Finance workspace (money duties only). Finance staff live here; Admin reaches it as owner access.
  { path: 'admin/finance', pathMatch: 'full', redirectTo: 'finance/home' },
  { path: 'finance', pathMatch: 'full', redirectTo: 'finance/home' },
  { path: 'finance/home', canActivate: [authenticatedGuard, roleGuard('Finance', 'Admin')],
    loadComponent: () => import('@features/finance/pages/finance-home-page.component').then(m => m.FinanceHomePageComponent) },
  { path: 'finance/payments', canActivate: [authenticatedGuard, roleGuard('Finance', 'Admin')],
    loadComponent: () => import('@features/finance/pages/finance-payments-page.component').then(m => m.FinancePaymentsPageComponent) },
  { path: 'finance/payments/:id', canActivate: [authenticatedGuard, roleGuard('Finance', 'Admin')],
    loadComponent: () => import('@features/finance/pages/finance-payment-page.component').then(m => m.FinancePaymentPageComponent) },
  { path: 'finance/withdrawals', canActivate: [authenticatedGuard, roleGuard('Finance', 'Admin')],
    loadComponent: () => import('@features/finance/pages/finance-withdrawals-page.component').then(m => m.FinanceWithdrawalsPageComponent) },
  { path: 'finance/payout-profiles', canActivate: [authenticatedGuard, roleGuard('Finance', 'Admin')],
    loadComponent: () => import('@features/finance/pages/finance-payout-profiles-page.component').then(m => m.FinancePayoutProfilesPageComponent) },
  { path: 'finance/reconciliation', canActivate: [authenticatedGuard, roleGuard('Finance', 'Admin')],
    loadComponent: () => import('@features/finance/pages/finance-reconciliation-page.component').then(m => m.FinanceReconciliationPageComponent) },
  { path: 'finance/audit', canActivate: [authenticatedGuard, roleGuard('Finance', 'Admin')],
    loadComponent: () => import('@features/finance/pages/finance-audit-page.component').then(m => m.FinanceAuditPageComponent) },
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
    canActivate: [authenticatedGuard, roleGuard('Student', 'Teacher')],
    loadChildren: () => import('@features/messages/messages.routes').then(m => m.MESSAGES_ROUTES)
  },
  {
    path: 'messages',
    canActivate: [authenticatedGuard, roleGuard('Student', 'Teacher')],
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
```

### frontend-angular/src/app/features/admin-marketing/admin-marketing.routes.ts

```ts
import { Routes } from '@angular/router';
import { ADMIN_MARKETING_GATEWAY } from './services/admin-marketing.ports';
import { HttpAdminMarketingGateway } from './services/http-admin-marketing.gateway';
import { AdminMarketing } from './services/admin-marketing.use-cases';

export const ADMIN_MARKETING_ROUTES: Routes = [{
  path: '',
  providers: [HttpAdminMarketingGateway,
    { provide: ADMIN_MARKETING_GATEWAY, useExisting: HttpAdminMarketingGateway }, AdminMarketing],
  loadComponent: () => import('./pages/admin-marketing-page.component').then(m => m.AdminMarketingPageComponent)
}];
```

### frontend-angular/src/app/features/admin/admin.routes.ts

```ts
import { Provider } from '@angular/core';
import { Routes } from '@angular/router';
import { ADMIN_CATALOG_GATEWAY } from './services/admin-catalog.ports';
import { HttpAdminCatalogGateway } from './services/http-admin-catalog.gateway';
import { LoadCatalog, ManageCatalog } from './services/admin-catalog.use-cases';

/**
 * The Admin catalog (J13-01..03): services and their price policy, subjects, qualification topics,
 * specialist topics, education levels and teaching languages. The parent route requires the Admin role;
 * the API authorizes every call with Subjects.Manage / Topics.Manage regardless.
 */
const providers: Provider[] = [
  HttpAdminCatalogGateway,
  { provide: ADMIN_CATALOG_GATEWAY, useExisting: HttpAdminCatalogGateway },
  LoadCatalog,
  ManageCatalog
];

export const CATALOG_ROUTES: Routes = [{
  path: '',
  providers,
  loadComponent: () => import('./pages/admin-catalog-page.component').then(m => m.AdminCatalogPageComponent)
}];
```

### frontend-angular/src/app/features/demand/demand.routes.ts

```ts
import { Provider } from '@angular/core';
import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '@shared/utils/unsaved-changes';
import { DEMAND_GATEWAY } from './services/demand.ports';
import { HttpDemandGateway } from './services/http-demand.gateway';
import {
  LoadMyOffers, LoadOffers, LoadOpenRequestForm, LoadOpportunity, LoadRequest, ManageOffer, ManageRequest, OpenRequestDrafts,
  PublishOpenRequest, SelectOffer
} from './services/demand.use-cases';

/**
 * Learning requests and the open marketplace (J4-01, J4-05, J4-07, J4-08 entry). Bindings load
 * with the screens; the parent routes require a signed-in user of the right role and the API
 * authorizes every call.
 */
const providers: Provider[] = [HttpDemandGateway, { provide: DEMAND_GATEWAY, useExisting: HttpDemandGateway }];

export const OPEN_REQUEST_ROUTES: Routes = [{
  path: '',
  canDeactivate: [unsavedChangesGuard],
  providers: [...providers, LoadOpenRequestForm, PublishOpenRequest, OpenRequestDrafts],
  loadComponent: () => import('./pages/open-request-page.component').then(m => m.OpenRequestPageComponent)
}];

export const REQUEST_ROUTES: Routes = [{
  path: '',
  providers: [...providers, LoadRequest, ManageRequest],
  loadComponent: () => import('./pages/request-detail-page.component').then(m => m.RequestDetailPageComponent)
}];

export const OFFERS_ROUTES: Routes = [{
  path: '',
  providers: [...providers, LoadOffers, SelectOffer],
  loadComponent: () => import('./pages/offers-page.component').then(m => m.OffersPageComponent)
}];

export const MY_OFFERS_ROUTES: Routes = [{
  path: '',
  providers: [...providers, LoadMyOffers],
  loadComponent: () => import('./pages/my-offers-page.component').then(m => m.MyOffersPageComponent)
}];

export const OPPORTUNITY_ROUTES: Routes = [{
  path: '',
  providers: [...providers, LoadOpportunity, ManageOffer],
  loadComponent: () => import('./pages/opportunity-page.component').then(m => m.OpportunityPageComponent)
}];
```

### frontend-angular/src/app/features/earnings/earnings.routes.ts

```ts
import { Routes } from '@angular/router';
import { HttpEarningsGateway } from './services/http-earnings.gateway';
import { EARNINGS_GATEWAY } from './services/earnings.ports';
import { LoadEarnings, LoadPayouts, LoadStatement, RequestWithdrawal, SavePayoutDetails } from './services/earnings.use-cases';

/**
 * The teacher's earnings screen (FIN-01). The parent route requires the Teacher role; the API
 * authorizes every call to the signed-in teacher's own balances regardless.
 */
export const EARNINGS_ROUTES: Routes = [{
  path: '',
  providers: [
    HttpEarningsGateway,
    { provide: EARNINGS_GATEWAY, useExisting: HttpEarningsGateway },
    LoadEarnings, LoadPayouts, LoadStatement, SavePayoutDetails, RequestWithdrawal
  ],
  loadComponent: () => import('./pages/teacher-earnings-page.component').then(m => m.TeacherEarningsPageComponent)
}];
```

### frontend-angular/src/app/features/live-sessions/live-sessions.routes.ts

```ts
import { Routes } from '@angular/router';
import { LiveSessionGateway } from './services/live-session.gateway';

/** A live session for its participants (J8-02, J8-05, J8-06). The API authorizes every call. */
export const LIVE_SESSION_ROUTES: Routes = [{
  path: '',
  providers: [LiveSessionGateway],
  loadComponent: () => import('./pages/live-session-page.component').then(m => m.LiveSessionPageComponent)
}];
```

### frontend-angular/src/app/features/messages/messages.routes.ts

```ts
import { Routes } from '@angular/router';
import { MessagesGateway } from './services/messages.gateway';
import { MessagesRealtime } from './services/messages-realtime.service';

/** The inbox and a conversation (J9-02). The API and the hub check participation on every call. */
export const MESSAGES_ROUTES: Routes = [{
  path: '',
  providers: [MessagesGateway, MessagesRealtime],
  loadComponent: () => import('./pages/messages-page.component').then(m => m.MessagesPageComponent)
}];
```

### frontend-angular/src/app/features/navigation/link.routes.ts

```ts
import { Routes } from '@angular/router';
import { adminOperationsTabGuard, disputeLinkGuard, marketplaceLinkGuard, teacherReviewLinkGuard } from './services/destination.guards';

/**
 * Child route tables for the link-only routes, loaded on demand so the redirect rules stay
 * out of the initial bundle. Each empty child inherits its parent's `:id` parameter.
 */
export const DISPUTE_LINK: Routes = [{ path: '', canActivate: [disputeLinkGuard], children: [] }];
export const TEACHER_REVIEW_LINK: Routes = [{ path: '', canActivate: [teacherReviewLinkGuard], children: [] }];
export const MARKETPLACE_LINK: Routes = [{ path: '', canActivate: [marketplaceLinkGuard], children: [] }];
export const ADMIN_OPERATIONS_TAB_LINK: Routes = [{ path: '', canActivate: [adminOperationsTabGuard], children: [] }];
```

### frontend-angular/src/app/features/quality/quality.routes.ts

```ts
import { Provider } from '@angular/core';
import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '@shared/utils/unsaved-changes';
import { QUALITY_REVIEW_GATEWAY } from './services/quality-review.ports';
import { HttpQualityReviewGateway } from './services/http-quality-review.gateway';
import {
  DecideApplication, LoadApplicationReview, LoadReviewQueue, OpenApplicationDemo, RevokeQualification, StartApplicationReview
} from './services/quality-review.use-cases';

/**
 * The teacher application queue and review (J11-05). Bindings live with the routes so the
 * reviewer's code loads only for reviewers; the parent routes require the role, and the API
 * authorizes every call regardless.
 */
const providers: Provider[] = [
  HttpQualityReviewGateway,
  { provide: QUALITY_REVIEW_GATEWAY, useExisting: HttpQualityReviewGateway }
];

export const QUEUE_ROUTES: Routes = [{
  path: '',
  providers: [...providers, LoadReviewQueue],
  loadComponent: () => import('./pages/application-queue-page.component').then(m => m.ApplicationQueuePageComponent)
}];

export const REVIEW_ROUTES: Routes = [{
  path: '',
  canDeactivate: [unsavedChangesGuard],
  providers: [...providers, LoadApplicationReview, StartApplicationReview, DecideApplication, OpenApplicationDemo, RevokeQualification],
  loadComponent: () => import('./pages/application-review-page.component').then(m => m.ApplicationReviewPageComponent)
}];
```

### frontend-angular/src/app/features/student-home/student-home.routes.ts

```ts
import { Routes } from '@angular/router';
import { HttpStudentHomeGateway } from './services/http-student-home.gateway';
import { STUDENT_HOME_GATEWAY } from './services/student-home.ports';
import { LoadStudentHome } from './services/student-home.use-cases';

/**
 * The student's home (UX-01). The parent route requires the Student role; every list the page reads is
 * authorized by the API to the signed-in student's own items regardless.
 */
export const STUDENT_HOME_ROUTES: Routes = [{
  path: '',
  providers: [
    HttpStudentHomeGateway,
    { provide: STUDENT_HOME_GATEWAY, useExisting: HttpStudentHomeGateway },
    LoadStudentHome
  ],
  loadComponent: () => import('./pages/student-home-page.component').then(m => m.StudentHomePageComponent)
}];
```

### frontend-angular/src/app/features/teacher-home/teacher-home.routes.ts

```ts
import { Routes } from '@angular/router';
import { HttpTeacherHomeGateway } from './services/http-teacher-home.gateway';
import { TEACHER_HOME_GATEWAY } from './services/teacher-home.ports';
import { LoadTeacherHome } from './services/teacher-home.use-cases';

/**
 * The teacher's home (UX-02). The parent route requires the Teacher role; every read the page makes is
 * authorized by the API to the signed-in teacher's own assignments regardless.
 */
export const TEACHER_HOME_ROUTES: Routes = [{
  path: '',
  providers: [
    HttpTeacherHomeGateway,
    { provide: TEACHER_HOME_GATEWAY, useExisting: HttpTeacherHomeGateway },
    LoadTeacherHome
  ],
  loadComponent: () => import('./pages/teacher-home-page.component').then(m => m.TeacherHomePageComponent)
}];
```

### frontend-angular/src/app/features/teacher-setup/teacher-setup.routes.ts

```ts
import { Provider } from '@angular/core';
import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '@shared/utils/unsaved-changes';
import { HttpTeacherSetupGateway } from './services/http-teacher-setup.gateway';
import { TEACHER_SETUP_GATEWAY } from './services/teacher-setup.ports';
import {
  LoadOwnProfile, LoadProfileWorkspace, LoadPublication, LoadServicesWorkspace, ManageAvailability, ManageCredentials,
  LoadSetupProgress, ManagePublicVideo, ManageServices, SaveTeacherProfile, SaveTeachingChoices, SetPublication
} from './services/teacher-setup.use-cases';

/**
 * The teacher's marketplace setup: profile (J11-06), services and prices (J11-07),
 * availability (J11-08) and publication (J11-09). Each is its own section of the teacher
 * workspace; the bindings load with them. The parent routes require the Teacher role, and the
 * API authorizes every call to the signed-in teacher's own data regardless.
 */
const providers: Provider[] = [
  HttpTeacherSetupGateway,
  { provide: TEACHER_SETUP_GATEWAY, useExisting: HttpTeacherSetupGateway },
  LoadSetupProgress
];

export const PROFILE_ROUTES: Routes = [{
  path: '',
  canDeactivate: [unsavedChangesGuard],
  providers: [...providers, LoadProfileWorkspace, SaveTeacherProfile, SaveTeachingChoices, ManageCredentials],
  loadComponent: () => import('./pages/teacher-profile-editor-page.component').then(m => m.TeacherProfileEditorPageComponent)
}];

export const SERVICES_ROUTES: Routes = [{
  path: '',
  canDeactivate: [unsavedChangesGuard],
  providers: [...providers, LoadServicesWorkspace, ManageServices],
  loadComponent: () => import('./pages/teacher-services-page.component').then(m => m.TeacherServicesPageComponent)
}];

export const AVAILABILITY_ROUTES: Routes = [{
  path: '',
  providers: [...providers, LoadOwnProfile, ManageAvailability],
  loadComponent: () => import('./pages/teacher-availability-page.component').then(m => m.TeacherAvailabilityPageComponent)
}];

export const PUBLICATION_ROUTES: Routes = [{
  path: '',
  providers: [...providers, LoadPublication, SetPublication, ManagePublicVideo],
  loadComponent: () => import('./pages/teacher-publication-page.component').then(m => m.TeacherPublicationPageComponent)
}];
```

### frontend-angular/src/app/features/work-list/work-list.routes.ts

```ts
import { Routes } from '@angular/router';

/**
 * "My requests & orders" (student) and "Work" (teacher) — one screen, two viewers (UX-03). Each parent
 * route already requires the right role; the API returns only the caller's own items regardless.
 */
export const STUDENT_WORK_ROUTES: Routes = [{
  path: '',
  data: { viewer: 'student' },
  loadComponent: () => import('./pages/work-list-page.component').then(m => m.WorkListPageComponent)
}];

export const TEACHER_WORK_ROUTES: Routes = [{
  path: '',
  data: { viewer: 'teacher' },
  loadComponent: () => import('./pages/work-list-page.component').then(m => m.WorkListPageComponent)
}];
```
