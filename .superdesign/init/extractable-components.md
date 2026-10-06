# Extractable component catalog

These existing Angular implementations can inform reusable Superdesign DraftComponents. The listed state/navigation concepts may be derived rather than public Angular inputs; inspect the full source before extraction. Dimensions and textual labels are not proposed as arbitrary draft props. Native button/card/form CSS patterns also exist globally without dedicated Angular components. No remote component has been created by init.

## PublicHeader

- Source: `frontend-angular/src/app/shared/layouts/public-header.component.ts`
- Category: layout
- Description: Public marketing navigation and session-aware header.
- Extractable props: menuId; menuOpen (state); isGuest/session/roles (derived state)
- Hardcoded: Brand mark, localized link labels, icons, all CSS

## LandingFooter

- Source: `frontend-angular/src/app/shared/layouts/landing-footer.component.ts`
- Category: layout
- Description: Public brand statement, product links and locale control.
- Extractable props: idPrefix; socialLabel (visibility)
- Hardcoded: Canonical destination URLs, localized labels, brand SVG assets, all CSS

## WorkspaceShell

- Source: `frontend-angular/src/app/shared/layouts/workspace-shell.component.ts`
- Category: layout
- Description: Authenticated role navigation and workspace framing.
- Extractable props: role; section (active navigation); drawer (state)
- Hardcoded: Brand assets, role-derived navigation destinations, localized account labels, CSS

## WorkflowHeader

- Source: `frontend-angular/src/app/shared/layouts/workflow-header.component.ts`
- Category: layout
- Description: Minimal header for focused tasks.
- Extractable props: role (account visibility/navigation)
- Hardcoded: Brand logo, breadcrumb text, layout, localized navigation label

## WorkspaceNav

- Source: `frontend-angular/src/app/features/navigation/pages/workspace-nav.component.ts`
- Category: layout
- Description: Role-based sidebar links.
- Extractable props: role; active route (derived navigation state)
- Hardcoded: Localized navigation labels/icons, destination configuration, CSS

## AccountMenu

- Source: `frontend-angular/src/app/features/navigation/pages/account-menu.component.ts`
- Category: layout
- Description: Shared account popover and account navigation.
- Extractable props: role; open state (derived)
- Hardcoded: Account labels/icons, canonical destinations, CSS

## NotificationBell

- Source: `frontend-angular/src/app/features/navigation/pages/notification-bell.component.ts`
- Category: layout
- Description: Shared notification popover with unread feedback.
- Extractable props: open; unread count (derived state/count)
- Hardcoded: Notification text/icons and CSS

## AuthShell

- Source: `frontend-angular/src/app/shared/layouts/auth-shell.component.ts`
- Category: layout
- Description: Authentication shell with brand and public navigation.
- Extractable props: None
- Hardcoded: Brand assets, copy, links, layout

## SkipLink

- Source: `frontend-angular/src/app/shared/layouts/skip-link.component.ts`
- Category: layout
- Description: Skip to the main content and focus it.
- Extractable props: target (navigation id)
- Hardcoded: Localized skip label, focus behavior, CSS

## MiniFooter

- Source: `frontend-angular/src/app/shared/layouts/mini-footer.component.ts`
- Category: layout
- Description: Compact legal/meta links for functional screens.
- Extractable props: None
- Hardcoded: Legal destinations, copyright labels, CSS

## BrandMark

- Source: `frontend-angular/src/app/shared/components/brand-mark.component.ts`
- Category: basic
- Description: Theme-aware Tafseel logo primitive.
- Extractable props: tone (theme state); eager (loading state)
- Hardcoded: Logo source variants and CSS

## LangToggle

- Source: `frontend-angular/src/app/shared/components/lang-toggle.component.ts`
- Category: basic
- Description: Switch current language.
- Extractable props: locale.lang (derived active state)
- Hardcoded: Flag/glyph, language labels, layout

## ThemeToggle

- Source: `frontend-angular/src/app/shared/components/theme-toggle.component.ts`
- Category: basic
- Description: Switch light/dark theme.
- Extractable props: theme state (derived)
- Hardcoded: Sun/moon icons, labels, CSS

## TextField

- Source: `frontend-angular/src/app/shared/components/text-field.component.ts`
- Category: basic
- Description: Accessible text input with validation.
- Extractable props: value; invalid; disabled; required (state)
- Hardcoded: Field labels, hint/error copy and CSS

## PasswordField

- Source: `frontend-angular/src/app/shared/components/password-field.component.ts`
- Category: basic
- Description: Password input with reveal affordance.
- Extractable props: value; invalid; disabled; revealed (state)
- Hardcoded: Visibility icon, field labels, hint/error copy, CSS

## FilePicker

- Source: `frontend-angular/src/app/shared/components/file-picker.component.ts`
- Category: basic
- Description: File input/dropzone with validation.
- Extractable props: disabled; files (state)
- Hardcoded: Upload icon, label/hint/error copy, accept policy, CSS

## Skeleton

- Source: `frontend-angular/src/app/shared/components/skeleton.component.ts`
- Category: basic
- Description: Reserved loading geometry and reduced-motion shimmer.
- Extractable props: kind (loading layout state)
- Hardcoded: Shapes, animation CSS

## UiState

- Source: `frontend-angular/src/app/shared/components/ui-state.component.ts`
- Category: basic
- Description: Empty/error/success/waiting status with projected recovery controls.
- Extractable props: state; variant; compact (display state)
- Hardcoded: Status icons, localized copy, projected actions, all CSS

## Toast

- Source: `frontend-angular/src/app/shared/components/toast.component.ts`
- Category: basic
- Description: Live-region transient feedback.
- Extractable props: toast visible/state
- Hardcoded: Feedback copy and all CSS

## Price

- Source: `frontend-angular/src/app/shared/components/price.component.ts`
- Category: basic
- Description: Locale-aware currency display with null handling.
- Extractable props: amount; currency (display state)
- Hardcoded: Price typography and currency rendering

## PricePanel

- Source: `frontend-angular/src/app/shared/components/price-panel.component.ts`
- Category: basic
- Description: Commercial quote summary.
- Extractable props: order; paid; emphasis (display state)
- Hardcoded: Commercial labels, hierarchy, all CSS

## TimeZoneSelect

- Source: `frontend-angular/src/app/shared/components/time-zone-select.component.ts`
- Category: basic
- Description: Accessible time-zone selection.
- Extractable props: value; disabled (state)
- Hardcoded: City/time-zone option labels and CSS

## ProtectedFileViewer

- Source: `frontend-angular/src/app/shared/components/protected-file-viewer.component.ts`
- Category: basic
- Description: Authorized media/file presentation.
- Extractable props: loading; failed; kind; url (viewer state)
- Hardcoded: File-viewer buttons/icons/layout and CSS

## PromotionContent

- Source: `frontend-angular/src/app/shared/components/promotion-content.component.ts`
- Category: basic
- Description: Campaign body shared by editor preview and public dialog.
- Extractable props: interactive; lead; units (count/state); titleId
- Hardcoded: Campaign textual content, coupon code, brand asset and CSS

## NativeControlPatterns

- Source: `css/tafseel.css`
- Category: basic
- Description: `.tf-button` variants, icon buttons, field wrappers, tabs, badges, cards and focus treatments; no separate Angular wrapper.
- Extractable props: active/selected; disabled; busy; href; badgeCount where the concrete pattern supports them
- Hardcoded: All visual CSS, localized labels and icons. Extract only concrete used patterns.
