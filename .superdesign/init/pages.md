# Key page dependency trees

Ten key page trees. Every local static, dynamic, re-export and type import is traced recursively; external HTML templates and CSS style files are included. External npm/Angular modules are omitted. Each file expands only once per page; an explicit reference marks subsequent appearances and cycles without hiding dependencies. Global bootstrapping/providers and `css/tafseel.css` are separate app-wide context (see layouts/theme/routes). This discovery list is not a ready-to-send design payload.

## /

Entry: `frontend-angular/src/app/features/landing/pages/landing-page.component.ts`

Dependencies:

- `frontend-angular/src/app/core/a11y/reduced-motion.service.ts`
- `frontend-angular/src/app/core/auth/services/resolve-landing-route.use-case.ts`
  - `frontend-angular/src/app/core/auth/models/role.ts`
  - `frontend-angular/src/app/core/auth/services/auth.ports.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/models/session.ts`
      - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/models/teacher-onboarding.ts`
- `frontend-angular/src/app/core/auth/services/session.store.ts`
  - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/models/session.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/core/i18n/format.service.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts`
    - `frontend-angular/src/app/core/storage/browser-preferences.ts`
  - `frontend-angular/src/app/shared/models/display-name.ts`
  - `frontend-angular/src/app/shared/models/money.ts`
- `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/landing/components/hero-rotator.component.ts`
  - `frontend-angular/src/app/core/a11y/reduced-motion.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/landing/components/journey-strip.component.ts`
  - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/landing/components/journey-strip.component.html`
  - `frontend-angular/src/app/features/landing/content/landing.copy.ts`
  - `frontend-angular/src/app/features/landing/services/landing.ports.ts`
    - `frontend-angular/src/app/features/landing/models/featured.ts`
    - `frontend-angular/src/app/features/landing/models/promotion.ts`
    - `frontend-angular/src/app/shared/models/student-journey.ts`
  - `frontend-angular/src/app/shared/components/price.component.ts`
    - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/models/student-journey.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/landing/components/kingdom-map.component.ts`
  - `frontend-angular/src/app/core/a11y/reduced-motion.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/landing/components/landing-sprite.component.ts`
- `frontend-angular/src/app/features/landing/components/product-story.component.ts`
  - `frontend-angular/src/app/core/a11y/reduced-motion.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/landing/components/product-story.component.html`
  - `frontend-angular/src/app/features/landing/content/landing.copy.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/landing/models/featured.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/landing/components/promo-wizard.component.ts`
  - `frontend-angular/src/app/core/a11y/reduced-motion.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/landing/components/promo-wizard.component.html`
  - `frontend-angular/src/app/features/landing/content/landing.copy.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/landing/models/promotion.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/promotion-content.component.ts`
  - `frontend-angular/src/app/shared/utils/modal-focus.ts`
- `frontend-angular/src/app/features/landing/content/landing.copy.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/landing/models/featured.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/landing/models/promotion.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/landing/pages/landing-global.css`
- `frontend-angular/src/app/features/landing/pages/landing-page.component.css`
- `frontend-angular/src/app/features/landing/pages/landing-page.component.html`
- `frontend-angular/src/app/features/landing/services/landing.ports.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/landing/services/landing.use-cases.ts`
  - `frontend-angular/src/app/features/landing/models/featured.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/landing/models/promotion.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/landing/services/landing.ports.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/models/student-journey.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/price.component.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/toast.component.ts`
  - `frontend-angular/src/app/shared/services/toast.service.ts`
- `frontend-angular/src/app/shared/layouts/landing-footer.component.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/lang-toggle.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/layouts/landing-footer.component.html`
- `frontend-angular/src/app/shared/layouts/public-header.component.ts`
  - `frontend-angular/src/app/core/auth/services/resolve-landing-route.use-case.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/services/session.store.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/brand-mark.component.ts`
  - `frontend-angular/src/app/shared/components/lang-toggle.component.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/theme-toggle.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/theme/theme.service.ts`
      - `frontend-angular/src/app/core/storage/browser-preferences.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/layouts/public-header.component.html`
- `frontend-angular/src/app/shared/layouts/skip-link.component.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/models/student-journey.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/services/toast.service.ts` — reference; expanded elsewhere in this tree

Unique files including entry: 45.

## /teachers

Entry: `frontend-angular/src/app/features/teachers/pages/browse-teachers-page.component.ts`

Dependencies:

- `frontend-angular/src/app/core/auth/services/session.store.ts`
  - `frontend-angular/src/app/core/auth/models/role.ts`
  - `frontend-angular/src/app/core/auth/models/session.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/services/auth.ports.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/models/session.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/models/teacher-onboarding.ts`
- `frontend-angular/src/app/core/i18n/count-text.ts`
- `frontend-angular/src/app/core/i18n/format.service.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts`
    - `frontend-angular/src/app/core/storage/browser-preferences.ts`
  - `frontend-angular/src/app/shared/models/display-name.ts`
  - `frontend-angular/src/app/shared/models/money.ts`
- `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/teachers/models/teacher.ts`
- `frontend-angular/src/app/features/teachers/pages/browse-teachers-page.component.css`
- `frontend-angular/src/app/features/teachers/pages/browse-teachers-page.component.html`
- `frontend-angular/src/app/features/teachers/services/teacher.ports.ts`
  - `frontend-angular/src/app/features/teachers/models/teacher.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/teachers/services/teacher.use-cases.ts`
  - `frontend-angular/src/app/features/teachers/models/teacher.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/teachers/services/teacher.ports.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/lazy-feature-styles.component.ts`
  - `frontend-angular/src/generated/booking.css`
  - `frontend-angular/src/generated/teachers.css`
- `frontend-angular/src/app/shared/components/price.component.ts`
  - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/skeleton.component.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/skeleton.component.css`
- `frontend-angular/src/app/shared/components/toast.component.ts`
  - `frontend-angular/src/app/shared/services/toast.service.ts`
- `frontend-angular/src/app/shared/components/ui-state.component.ts`
  - `frontend-angular/src/app/shared/components/icon.component.ts`
  - `frontend-angular/src/app/shared/components/ui-state.component.css`
- `frontend-angular/src/app/shared/directives/teacher-transition.directive.ts`
  - `frontend-angular/src/app/core/a11y/interaction-motion.service.ts`
    - `frontend-angular/src/app/core/a11y/reduced-motion.service.ts`
- `frontend-angular/src/app/shared/layouts/public-header.component.ts`
  - `frontend-angular/src/app/core/auth/services/resolve-landing-route.use-case.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/services/session.store.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/brand-mark.component.ts`
  - `frontend-angular/src/app/shared/components/lang-toggle.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/theme-toggle.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/theme/theme.service.ts`
      - `frontend-angular/src/app/core/storage/browser-preferences.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/layouts/public-header.component.html`
- `frontend-angular/src/app/shared/layouts/skip-link.component.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/services/toast.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/utils/modal-focus.ts`

Unique files including entry: 40.

## /teachers/:teacherId

Entry: `frontend-angular/src/app/features/teachers/pages/teacher-profile-page.component.ts`

Dependencies:

- `frontend-angular/src/app/core/auth/services/session.store.ts`
  - `frontend-angular/src/app/core/auth/models/role.ts`
  - `frontend-angular/src/app/core/auth/models/session.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/services/auth.ports.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/models/session.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/models/teacher-onboarding.ts`
- `frontend-angular/src/app/core/i18n/count-text.ts`
- `frontend-angular/src/app/core/i18n/format.service.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts`
    - `frontend-angular/src/app/core/storage/browser-preferences.ts`
  - `frontend-angular/src/app/shared/models/display-name.ts`
  - `frontend-angular/src/app/shared/models/money.ts`
- `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/teachers/models/teacher.ts`
- `frontend-angular/src/app/features/teachers/pages/teacher-profile-page.component.css`
- `frontend-angular/src/app/features/teachers/pages/teacher-profile-page.component.html`
- `frontend-angular/src/app/features/teachers/services/teacher.use-cases.ts`
  - `frontend-angular/src/app/features/teachers/models/teacher.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/teachers/services/teacher.ports.ts`
    - `frontend-angular/src/app/features/teachers/models/teacher.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/lazy-feature-styles.component.ts`
  - `frontend-angular/src/generated/booking.css`
  - `frontend-angular/src/generated/teachers.css`
- `frontend-angular/src/app/shared/components/price.component.ts`
  - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/skeleton.component.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/skeleton.component.css`
- `frontend-angular/src/app/shared/components/toast.component.ts`
  - `frontend-angular/src/app/shared/services/toast.service.ts`
- `frontend-angular/src/app/shared/directives/teacher-transition.directive.ts`
  - `frontend-angular/src/app/core/a11y/interaction-motion.service.ts`
    - `frontend-angular/src/app/core/a11y/reduced-motion.service.ts`
- `frontend-angular/src/app/shared/layouts/public-header.component.ts`
  - `frontend-angular/src/app/core/auth/services/resolve-landing-route.use-case.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/services/session.store.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/brand-mark.component.ts`
  - `frontend-angular/src/app/shared/components/lang-toggle.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/theme-toggle.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/theme/theme.service.ts`
      - `frontend-angular/src/app/core/storage/browser-preferences.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/layouts/public-header.component.html`
- `frontend-angular/src/app/shared/layouts/skip-link.component.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/services/toast.service.ts` — reference; expanded elsewhere in this tree

Unique files including entry: 36.

## /auth

Entry: `frontend-angular/src/app/features/auth/pages/auth-page.component.ts`

Dependencies:

- `frontend-angular/src/app/core/auth/guards/auth.guards.ts`
  - `frontend-angular/src/app/core/auth/models/role.ts`
  - `frontend-angular/src/app/core/auth/services/resolve-landing-route.use-case.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts`
      - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
      - `frontend-angular/src/app/core/auth/models/session.ts`
        - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
      - `frontend-angular/src/app/core/auth/models/teacher-onboarding.ts`
  - `frontend-angular/src/app/core/auth/services/restore-session.use-case.ts`
    - `frontend-angular/src/app/core/auth/models/session.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/services/session.store.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/models/session.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/core/auth/models/auth-failure.ts`
- `frontend-angular/src/app/core/auth/services/log-in.use-case.ts`
  - `frontend-angular/src/app/core/auth/models/auth-failure.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/models/session.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/models/email-address.ts`
- `frontend-angular/src/app/core/auth/services/pending-return.store.ts`
  - `frontend-angular/src/app/core/auth/guards/auth.guards.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/storage/browser-preferences.ts`
- `frontend-angular/src/app/core/auth/services/recover-password.use-case.ts`
  - `frontend-angular/src/app/core/auth/models/auth-failure.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/models/email-address.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/models/password-policy.ts`
- `frontend-angular/src/app/core/auth/services/register-account.use-case.ts`
  - `frontend-angular/src/app/core/auth/models/auth-failure.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/models/email-address.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/models/password-policy.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/core/auth/services/resolve-landing-route.use-case.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/core/i18n/locale.service.ts`
  - `frontend-angular/src/app/core/storage/browser-preferences.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/core/theme/theme.service.ts`
  - `frontend-angular/src/app/core/storage/browser-preferences.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/auth/pages/auth-page.component.css`
- `frontend-angular/src/app/features/auth/pages/auth-page.component.html`
- `frontend-angular/src/app/shared/components/icon.component.ts`
- `frontend-angular/src/app/shared/components/password-field.component.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/password-rules.component.ts`
- `frontend-angular/src/app/shared/components/text-field.component.ts`
- `frontend-angular/src/app/shared/components/toast.component.ts`
  - `frontend-angular/src/app/shared/services/toast.service.ts`
- `frontend-angular/src/app/shared/components/ui-state.component.ts`
  - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/ui-state.component.css`
- `frontend-angular/src/app/shared/directives/action-feedback.directive.ts`
- `frontend-angular/src/app/shared/directives/segmented-control.directive.ts`
- `frontend-angular/src/app/shared/layouts/auth-shell.component.ts`
  - `frontend-angular/src/app/shared/components/brand-mark.component.ts`
  - `frontend-angular/src/app/shared/components/lang-toggle.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/theme-toggle.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/theme/theme.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/models/email-address.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/models/password-policy.ts` — reference; expanded elsewhere in this tree

Unique files including entry: 35.

## /requests/new/open

Entry: `frontend-angular/src/app/features/demand/pages/open-request-page.component.ts`

Dependencies:

- `frontend-angular/src/app/core/http/problem-message.ts`
  - `frontend-angular/src/app/core/http/api.dto.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts`
- `frontend-angular/src/app/core/i18n/locale.service.ts`
  - `frontend-angular/src/app/core/storage/browser-preferences.ts`
- `frontend-angular/src/app/features/demand/models/demand.ts`
  - `frontend-angular/src/app/shared/vocabulary/status-vocabulary.ts`
- `frontend-angular/src/app/features/demand/pages/open-request-page.component.css`
- `frontend-angular/src/app/features/demand/pages/open-request-page.component.html`
- `frontend-angular/src/app/features/demand/services/demand.use-cases.ts`
  - `frontend-angular/src/app/features/demand/models/demand.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/demand/services/demand.ports.ts`
    - `frontend-angular/src/app/features/demand/models/demand.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/file-picker.component.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/icon.component.ts`
- `frontend-angular/src/app/shared/components/skeleton.component.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/skeleton.component.css`
- `frontend-angular/src/app/shared/layouts/workspace-shell.component.ts`
  - `frontend-angular/src/app/core/auth/services/auth.ports.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/models/session.ts`
      - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/models/teacher-onboarding.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/dashboards/models/dashboard.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/pages/account-menu.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/services/log-out.use-case.ts`
      - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/pages/notification-bell.component.ts`
    - `frontend-angular/src/app/core/i18n/format.service.ts`
      - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
      - `frontend-angular/src/app/shared/models/display-name.ts`
      - `frontend-angular/src/app/shared/models/money.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/navigation/services/notifications.gateway.ts`
    - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/shared/vocabulary/status-vocabulary.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/pages/workspace-nav.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/navigation/models/primary-nav.ts`
      - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
      - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/navigation/services/unread-messages.ts`
    - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/services/unread-messages.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/brand-mark.component.ts`
  - `frontend-angular/src/app/shared/components/lang-toggle.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/theme-toggle.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/theme/theme.service.ts`
      - `frontend-angular/src/app/core/storage/browser-preferences.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/layouts/skip-link.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/styles/workspace-detail.css`
- `frontend-angular/src/app/shared/utils/form-focus.ts`
- `frontend-angular/src/app/shared/utils/time-zones.ts`
  - `frontend-angular/src/app/shared/utils/time-zone-cities.ts`
- `frontend-angular/src/app/shared/utils/unsaved-changes.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/services/dialog.service.ts`
    - `frontend-angular/src/app/core/a11y/interaction-motion.service.ts`
      - `frontend-angular/src/app/core/a11y/reduced-motion.service.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree

Unique files including entry: 44.

## /student/overview

Entry: `frontend-angular/src/app/features/student-home/pages/student-home-page.component.ts`

Dependencies:

- `frontend-angular/src/app/core/auth/services/auth.ports.ts`
  - `frontend-angular/src/app/core/auth/models/role.ts`
  - `frontend-angular/src/app/core/auth/models/session.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/models/teacher-onboarding.ts`
- `frontend-angular/src/app/core/http/problem-message.ts`
  - `frontend-angular/src/app/core/http/api.dto.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/core/i18n/format.service.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts`
    - `frontend-angular/src/app/core/storage/browser-preferences.ts`
  - `frontend-angular/src/app/shared/models/display-name.ts`
  - `frontend-angular/src/app/shared/models/money.ts`
- `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/student-home/models/student-home.ts`
  - `frontend-angular/src/app/shared/vocabulary/status-vocabulary.ts`
- `frontend-angular/src/app/features/student-home/pages/student-home-page.component.html`
- `frontend-angular/src/app/features/student-home/services/student-home.use-cases.ts`
  - `frontend-angular/src/app/features/student-home/models/student-home.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/student-home/services/student-home.ports.ts`
    - `frontend-angular/src/app/features/student-home/models/student-home.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/icon.component.ts`
- `frontend-angular/src/app/shared/components/price.component.ts`
  - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/skeleton.component.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/skeleton.component.css`
- `frontend-angular/src/app/shared/layouts/workspace-shell.component.ts`
  - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/dashboards/models/dashboard.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/pages/account-menu.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/services/log-out.use-case.ts`
      - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/pages/notification-bell.component.ts`
    - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/navigation/services/notifications.gateway.ts`
    - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/shared/vocabulary/status-vocabulary.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/pages/workspace-nav.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/navigation/models/primary-nav.ts`
      - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
      - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/navigation/services/unread-messages.ts`
    - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/services/unread-messages.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/brand-mark.component.ts`
  - `frontend-angular/src/app/shared/components/lang-toggle.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/theme-toggle.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/theme/theme.service.ts`
      - `frontend-angular/src/app/core/storage/browser-preferences.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/layouts/skip-link.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree

Unique files including entry: 35.

## /teacher/home

Entry: `frontend-angular/src/app/features/teacher-home/pages/teacher-home-page.component.ts`

Dependencies:

- `frontend-angular/src/app/core/auth/services/auth.ports.ts`
  - `frontend-angular/src/app/core/auth/models/role.ts`
  - `frontend-angular/src/app/core/auth/models/session.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/models/teacher-onboarding.ts`
- `frontend-angular/src/app/core/http/problem-message.ts`
  - `frontend-angular/src/app/core/http/api.dto.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/core/i18n/format.service.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts`
    - `frontend-angular/src/app/core/storage/browser-preferences.ts`
  - `frontend-angular/src/app/shared/models/display-name.ts`
  - `frontend-angular/src/app/shared/models/money.ts`
- `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/teacher-home/models/setup-card.ts`
  - `frontend-angular/src/app/features/teacher-setup/models/readiness.ts`
  - `frontend-angular/src/app/shared/vocabulary/status-vocabulary.ts`
- `frontend-angular/src/app/features/teacher-home/models/teacher-home.ts`
  - `frontend-angular/src/app/features/earnings/models/earnings.ts`
  - `frontend-angular/src/app/shared/vocabulary/status-vocabulary.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/teacher-home/pages/teacher-home-page.component.html`
- `frontend-angular/src/app/features/teacher-home/services/teacher-home.use-cases.ts`
  - `frontend-angular/src/app/features/earnings/models/earnings.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/teacher-home/models/setup-card.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/teacher-home/models/teacher-home.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/teacher-home/services/teacher-home.ports.ts`
    - `frontend-angular/src/app/features/earnings/models/earnings.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/teacher-home/models/teacher-home.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/teacher-setup/models/readiness.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/teacher-setup/models/readiness.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/price.component.ts`
  - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/skeleton.component.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/skeleton.component.css`
- `frontend-angular/src/app/shared/layouts/workspace-shell.component.ts`
  - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/dashboards/models/dashboard.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/pages/account-menu.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/services/log-out.use-case.ts`
      - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/pages/notification-bell.component.ts`
    - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/navigation/services/notifications.gateway.ts`
    - `frontend-angular/src/app/shared/components/icon.component.ts`
    - `frontend-angular/src/app/shared/vocabulary/status-vocabulary.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/pages/workspace-nav.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/navigation/models/primary-nav.ts`
      - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
      - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/navigation/services/unread-messages.ts`
    - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/services/unread-messages.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/brand-mark.component.ts`
  - `frontend-angular/src/app/shared/components/lang-toggle.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/theme-toggle.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/theme/theme.service.ts`
      - `frontend-angular/src/app/core/storage/browser-preferences.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/layouts/skip-link.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree

Unique files including entry: 38.

## /checkout

Entry: `frontend-angular/src/app/features/checkout/pages/payment-page.component.ts`

Dependencies:

- `frontend-angular/src/app/core/http/problem-message.ts`
  - `frontend-angular/src/app/core/http/api.dto.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts`
- `frontend-angular/src/app/core/i18n/format.service.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts`
    - `frontend-angular/src/app/core/storage/browser-preferences.ts`
  - `frontend-angular/src/app/shared/models/display-name.ts`
  - `frontend-angular/src/app/shared/models/money.ts`
- `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/checkout/models/payable.ts`
  - `frontend-angular/src/app/shared/models/agreed-price.ts`
- `frontend-angular/src/app/features/checkout/pages/payment-page.component.css`
- `frontend-angular/src/app/features/checkout/pages/payment-page.component.html`
- `frontend-angular/src/app/features/checkout/services/checkout.ports.ts`
  - `frontend-angular/src/app/features/checkout/models/booking.ts`
  - `frontend-angular/src/app/features/checkout/models/payable.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/checkout/services/checkout.use-cases.ts`
  - `frontend-angular/src/app/core/auth/models/auth-failure.ts`
  - `frontend-angular/src/app/features/checkout/models/payable.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/checkout/services/checkout.ports.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/teacher-setup/models/availability.ts`
  - `frontend-angular/src/app/features/teacher-setup/models/teacher-profile.ts`
  - `frontend-angular/src/app/shared/utils/time-zones.ts`
    - `frontend-angular/src/app/shared/utils/time-zone-cities.ts`
- `frontend-angular/src/app/shared/components/price-panel.component.ts`
  - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/price.component.ts`
    - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/models/agreed-price.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/price.component.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/toast.component.ts`
  - `frontend-angular/src/app/shared/services/toast.service.ts`
- `frontend-angular/src/app/shared/layouts/skip-link.component.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/layouts/workflow-header.component.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/dashboards/models/dashboard.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/pages/account-menu.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts`
      - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
      - `frontend-angular/src/app/core/auth/models/session.ts`
        - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
      - `frontend-angular/src/app/core/auth/models/teacher-onboarding.ts`
    - `frontend-angular/src/app/core/auth/services/log-out.use-case.ts`
      - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/brand-mark.component.ts`
  - `frontend-angular/src/app/shared/components/lang-toggle.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/theme-toggle.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/theme/theme.service.ts`
      - `frontend-angular/src/app/core/storage/browser-preferences.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/services/toast.service.ts` — reference; expanded elsewhere in this tree

Unique files including entry: 37.

## /messages

Entry: `frontend-angular/src/app/features/messages/pages/messages-page.component.ts`

Dependencies:

- `frontend-angular/src/app/core/auth/services/auth.ports.ts`
  - `frontend-angular/src/app/core/auth/models/role.ts`
  - `frontend-angular/src/app/core/auth/models/session.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/models/teacher-onboarding.ts`
- `frontend-angular/src/app/core/http/problem-message.ts`
  - `frontend-angular/src/app/core/http/api.dto.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/core/i18n/format.service.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts`
    - `frontend-angular/src/app/core/storage/browser-preferences.ts`
  - `frontend-angular/src/app/shared/models/display-name.ts`
  - `frontend-angular/src/app/shared/models/money.ts`
- `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/messages/models/messaging.ts`
- `frontend-angular/src/app/features/messages/pages/messages-page.component.html`
- `frontend-angular/src/app/features/messages/services/messages-realtime.service.ts`
  - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/messages/models/messaging.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/messages/services/messages.gateway.ts`
    - `frontend-angular/src/app/features/messages/models/messaging.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/messages/services/messages.gateway.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/navigation/services/unread-messages.ts`
- `frontend-angular/src/app/shared/components/file-picker.component.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/icon.component.ts`
- `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/protected-file-viewer.component.ts`
  - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/http/protected-file.service.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/protected-file-viewer.component.html`
- `frontend-angular/src/app/shared/components/skeleton.component.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/skeleton.component.css`
- `frontend-angular/src/app/shared/components/ui-state.component.ts`
  - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/ui-state.component.css`
- `frontend-angular/src/app/shared/directives/action-feedback.directive.ts`
- `frontend-angular/src/app/shared/layouts/workspace-shell.component.ts`
  - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/dashboards/models/dashboard.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/pages/account-menu.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/services/log-out.use-case.ts`
      - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/pages/notification-bell.component.ts`
    - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/navigation/services/notifications.gateway.ts`
    - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/shared/vocabulary/status-vocabulary.ts`
  - `frontend-angular/src/app/features/navigation/pages/workspace-nav.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/navigation/models/primary-nav.ts`
      - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
      - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/navigation/services/unread-messages.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/services/unread-messages.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/brand-mark.component.ts`
  - `frontend-angular/src/app/shared/components/lang-toggle.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/theme-toggle.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/theme/theme.service.ts`
      - `frontend-angular/src/app/core/storage/browser-preferences.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/layouts/skip-link.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/styles/workspace-detail.css`

Unique files including entry: 42.

## /account

Entry: `frontend-angular/src/app/features/account/pages/account-settings-page.component.ts`

Dependencies:

- `frontend-angular/src/app/core/auth/services/auth.ports.ts`
  - `frontend-angular/src/app/core/auth/models/role.ts`
  - `frontend-angular/src/app/core/auth/models/session.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/auth/models/teacher-onboarding.ts`
- `frontend-angular/src/app/core/http/problem-message.ts`
  - `frontend-angular/src/app/core/http/api.dto.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/core/http/protected-file.service.ts`
- `frontend-angular/src/app/core/i18n/format.service.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts`
    - `frontend-angular/src/app/core/storage/browser-preferences.ts`
  - `frontend-angular/src/app/shared/models/display-name.ts`
  - `frontend-angular/src/app/shared/models/money.ts`
- `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/features/account/services/account-settings.gateway.ts`
- `frontend-angular/src/app/features/support/models/support.ts`
  - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/dashboards/models/dashboard.ts`
    - `frontend-angular/src/app/core/auth/models/role.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/components/toast.component.ts`
  - `frontend-angular/src/app/shared/services/toast.service.ts`
- `frontend-angular/src/app/shared/layouts/workspace-shell.component.ts`
  - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/pages/account-menu.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/auth/services/log-out.use-case.ts`
      - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/pages/notification-bell.component.ts`
    - `frontend-angular/src/app/core/i18n/format.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/navigation/services/notifications.gateway.ts`
    - `frontend-angular/src/app/shared/components/icon.component.ts`
    - `frontend-angular/src/app/shared/vocabulary/status-vocabulary.ts`
  - `frontend-angular/src/app/features/navigation/pages/workspace-nav.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/navigation/models/primary-nav.ts`
      - `frontend-angular/src/app/features/dashboards/models/dashboard.ts` — reference; expanded elsewhere in this tree
      - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/features/navigation/services/unread-messages.ts`
    - `frontend-angular/src/app/shared/components/icon.component.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/features/navigation/services/unread-messages.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/brand-mark.component.ts`
  - `frontend-angular/src/app/shared/components/lang-toggle.component.ts`
    - `frontend-angular/src/app/core/auth/services/auth.ports.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/components/theme-toggle.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
    - `frontend-angular/src/app/core/theme/theme.service.ts`
      - `frontend-angular/src/app/core/storage/browser-preferences.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/layouts/skip-link.component.ts`
    - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/services/dialog.service.ts`
  - `frontend-angular/src/app/core/a11y/interaction-motion.service.ts`
    - `frontend-angular/src/app/core/a11y/reduced-motion.service.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/services/toast.service.ts` — reference; expanded elsewhere in this tree
- `frontend-angular/src/app/shared/utils/unsaved-changes.ts`
  - `frontend-angular/src/app/core/i18n/locale.service.ts` — reference; expanded elsewhere in this tree
  - `frontend-angular/src/app/shared/services/dialog.service.ts` — reference; expanded elsewhere in this tree

Unique files including entry: 37.
