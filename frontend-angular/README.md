# Tafseel — Angular client

This is the site. It owns every former `.dc.html` screen; those pages and their runtime were
removed in Wave 1 (their old `/app/*` addresses redirect here, see `src/Tafseel.Api/Routing/LegacyLinks.cs`).
New frontend work belongs here.

## Requirements

Angular 22 requires Node `^22.22.3 || ^24.15.0 || >=26.0.0`.

## Run

```bash
npm install
npm start          # ng serve on :4200, proxying /api -> http://localhost:5089
```

The dev server proxies `/api` to the .NET API (`proxy.conf.json`) so the refresh
cookie stays first-party and `withCredentials` works without CORS changes. Start
the API first:

```bash
dotnet run --project ../src/Tafseel.Api --urls http://localhost:5089
```

## Test

```bash
npm test
```

The suite covers the parts that carry risk and could not be tested before:
open-redirect handling on the post-login destination, problem-details mapping,
and the 401 refresh-and-replay path.

## Layout

```
src/app/
  core/          app-wide auth, HTTP, locale, theme, storage, and accessibility
  features/      product areas grouped into pages/components/services/models/content
  shared/        reusable components, layouts, UI services, and simple models
  app.routes.ts  lazy route table
  app.config.ts  application setup
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the folder rules and examples.

## Decisions worth knowing

**Translations are a build concern.** `js/locales.js` ships 346KB — both
languages, 2,850 keys, 46% of them never referenced. Here strings are marked with
`$localize` and `ng build --localize` emits one bundle per locale, so a visitor
downloads only their own language. `LocaleService` keeps only what stays a
runtime concern: which locale is active, and `lang`/`dir` on `<html>`.

**The access token never touches storage.** It lives in a signal; the refresh
token stays an HttpOnly cookie. That is why every request sets
`withCredentials`.

**Interceptor order is load-bearing.** Requests run left to right and errors come
back right to left, so `problemDetailsInterceptor` is listed *first* in order to
run *last* on the error path — leaving `authRetryInterceptor` a raw
`HttpErrorResponse` to inspect. Swapping those two silently disables the retry;
`http.interceptors.spec.ts` covers it.

**Dashboards share a UI shell, not business state.** Student, Teacher, Quality and
Admin navigation/data plans are role-specific configuration. The common shell owns
only layout, route selection, loading/error/empty states and generic collection
rendering.

## Bundle budgets

The `initial` budget is 700kB/800kB **raw**, which sounds enormous and is not:

| chunk | raw | transfer |
|---|---|---|
| styles (legacy `tafseel.css`) | 400 kB | 52 kB |
| Angular framework | 254 kB | 70 kB |
| main + polyfills | 10 kB | 3 kB |
| **initial total** | **664 kB** | **124 kB** |
| auth screen (lazy) | 33 kB | 8 kB |

For comparison the legacy landing page ships roughly 470 kB compressed.

Almost all of the raw figure is the legacy stylesheet, carried whole because the
migrated screens must render from exactly the same CSS as the pages they replace.
The separate `styles` budget exists to catch that file growing. It should fall
sharply once routes own their styles and the shared sheet is trimmed to what is
genuinely shared — that is the point at which the initial budget should be
lowered again, not before.
