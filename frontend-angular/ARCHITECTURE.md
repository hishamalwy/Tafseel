# Frontend architecture

This app is organised around screens and user-facing features. It does not copy
the backend's `Domain / Application / Infrastructure / API` projects into the
browser.

```text
src/app/
  core/          app-wide runtime concerns
  shared/        reusable UI, layouts, helpers, and simple models
  features/      product features, kept together by user journey
  app.config.ts  application setup
  app.providers.ts dependency bindings
  app.routes.ts  lazy route table
```

## Feature folders

A feature uses only the folders it needs:

```text
features/landing/
  pages/         routed screens
  components/    UI used only by this feature
  services/      API access, state, and workflow orchestration
  models/        plain TypeScript types and pure business rules
  content/       static copy or display data
```

There are no placeholder folders. A one-page feature can contain only `pages/`;
new folders appear when real code needs them.

## App-wide and shared code

- `core/` contains code that has one app-wide responsibility: authentication,
  HTTP interceptors, locale, theme, storage, and accessibility preferences.
- `shared/components/` contains small reusable visual components.
- `shared/layouts/` contains reusable page shells and headers.
- `shared/services/` contains UI-level services such as dialogs and toasts.
- `shared/models/` contains plain types or rules used by multiple features.

Authentication lives in `core/auth/` because the router, interceptors, header,
and several features all depend on the same session. The login and confirmation
screens remain in `features/auth/pages/` because they are routed product screens.

## Dependency rules

```text
app -> features -> core/shared
                  ^
                  |-- pages -> components/services/models
                  |-- components -> services/models
                  `-- services -> models
```

- A feature should not import another feature's internals. Move genuinely
  app-wide behaviour to `core`, or genuinely reusable code to `shared`.
- `models` stay browser- and Angular-independent where practical.
- HTTP, storage, and stateful orchestration belong in `services`, not pages.
- A routed component belongs in `pages`; a feature-local visual building block
  belongs in `components`.
- Promote code to `shared` only after more than one feature actually uses it.
- Tests stay beside the code they verify.

Interfaces and injection tokens are used only where the app already needs a
test seam or more than one implementation. The folder structure does not require
a repository, gateway, use case, or facade for every file.

## Styling

Every migrated screen currently renders from `css/tafseel.css`, synced by
`npm run sync:design`. Component styles hold only screen-specific additions.
New components should use the existing design tokens rather than inventing local
colours, radii, or spacing values.

## Path aliases

```ts
@core/*      src/app/core/*
@shared/*    src/app/shared/*
@features/*  src/app/features/*
```

Aliases identify the owning area. Relative imports are preferred inside the
same feature so moves remain local and cross-feature imports stand out in review.
