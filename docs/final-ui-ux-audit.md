# Final UI/UX audit

Date: 2026-07-27  
Guidance: `ui-ux-pro-max` (accessibility, loading/empty states, forms feedback, bilingual typography). Existing Tafseel brand (Electric Violet + Warm Bone) preserved — no teal redesign.

## Typography

| Locale | Font | Hosting |
|---|---|---|
| English | Inter 400/500/600/700 | `assets/fonts/inter/*.woff2` self-hosted |
| Arabic | Thmanyah Sans | `assets/fonts/thmanyah-sans/*.woff2` self-hosted |

- `html[lang=en|ar]` switches `--font-sans` / `--font-display`
- `dir=rtl|ltr` via `Tafseel.setLang`
- No Google Fonts / unpkg / external runtime CDNs
- CI asserts Inter + Thmanyah files exist

## Design system changes (incremental)

In `css/tafseel.css`: Inter `@font-face`; utility patterns `.tf-unavailable`, `.tf-empty`, `.tf-skeleton`, `.tf-badge`, disabled link/button rules; chat list button affordances. No full rewrite.

## Page UX hardening

| Surface | Change |
|---|---|
| Teacher Profile | Real API, server-driven `canBook` / `canRequest`, honest unavailable |
| Book Session | Real slots/book for exact selected teacher service, loading + disabled submit |
| Payment | Real initiate; coupon section is honest-unavailable (no coupon API); no fake card form |
| Request | Real learning-request create |
| Chat | Wired to `js/chat.js` |
| Dashboards | Role gates; teacher service create/edit |
| Landing | Services from `GET /services`; no fake featured counts when API is absent |

## Accessibility / interaction (pro-max)

- Focus-visible rings retained
- Loading/disabled submit on booking & payment
- Empty/unavailable states with recovery links
- `prefers-reduced-motion` respected globally
- Touch-friendly primary CTAs ≥40–44px height

## Remaining gaps / notes

- Some secondary dashboard sections remain intentionally empty because the current backend does not expose aggregate file/review/payment-history list endpoints for those surfaces
- Live-session escrow release / refund product rules unresolved
- Frontend request pricing no longer invents a platform fee without API support
