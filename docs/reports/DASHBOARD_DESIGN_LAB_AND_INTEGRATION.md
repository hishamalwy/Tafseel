# Tafseel — Dashboard Design Lab & Integration

Date: 2026-08-10.
Status: **BLOCKED** (lab direction selected and refined; production shell started; live production visual recert incomplete).
No commit / push / deploy.

Evidence: [dashboard-design-lab/](../features/evidence/dashboard-design-lab/).
Lab: [design-lab/dashboards/](../../design-lab/dashboards/).
IA: [ROLE_INFORMATION_ARCHITECTURE.md](../../design-lab/dashboards/ROLE_INFORMATION_ARCHITECTURE.md).
Comparison: [CONCEPT_COMPARISON.md](../../design-lab/dashboards/CONCEPT_COMPARISON.md).

---

## Why incremental dashboard redesign was rejected

The four production dashboards were repeatedly improved inside the same composition: sidebar + header + a stack of equally weighted bordered surfaces. Radius, type size, and token tweaks cannot fix that.

1. Hierarchy was expressed by cards, not by jobs.
2. Student and Quality navigation stayed a flat dingbat list.
3. Teacher Overview led with six KPI cards while student requests sat below.
4. Quality looked like analytics counts rather than a queue + one case.
5. Admin Overview mixed unavailable charts with a metric kitchen sink.
6. Page-local inline styles made four products drift. Dark mode collapsed to flat black rectangles.

The lab replaces *composition* first. Canonical routes, APIs, confirmations, and P0 integrity stay.

---

## Role Information Architecture

Jobs, not current label order. Destinations are only those that already exist.

| Role | Know immediately | Act now | Can wait | Financial / irreversible |
|---|---|---|---|---|
| Student | Needs Attention; current learning; next session | Pay, review delivery, reply | Saved teachers, payments history, settings | Pay; approve delivery |
| Teacher | New requests; active deliveries; next session | Accept / decline / clarify; deliver | Services, samples, availability, reviews | Accept price; withdraw |
| Quality | Oldest / actionable queue; incomplete scoring | Review one case; decide | Reports, settings | Approve / reject / request changes |
| Admin | Platform health; disputes; withdrawals | Moderate; approve money; intelligence | Catalog, settings | Withdrawal approve/reject; suspend; hide/restore |

Notifications stay in the header bell. Chat stays compact Messenger FAB. Admin has no bell.

---

## System A — Operational Editorial

Large serif titles, hairline Needs Attention, few surfaces, long whitespace. Student is excellent. Teacher requests become editorial essays. Admin and Quality under-use the desktop canvas. **Rejected as the sole system.** Keep Student attention + display type.

---

## System B — Dense Professional

Tighter header, more rows above the fold, strongest tables/toolbars. Admin and Quality scan well. Student feels like a back-office. Dark mode is flatter. **Rejected as the sole system.** Keep table padding and operational toolbars.

---

## System C — Premium Hybrid (split workspace)

Left rail = what needs action now. Right panel = current work. Not A with different spacing. Student attention owns the rail. Teacher requests vs active orders. Quality deep review is evidence + rubric + separated decision. Admin intervention vs intelligence entry. **Best overall composition.**

---

## Concept comparison

Rendered at 1440 EN light, 1440 AR dark, 390 AR light. No 9.8 / 9.9 / 10 scores.

C wins task clarity across roles. A wins Student tone. B wins tables. Weaknesses of C: Quality overview originally lacked a next-case preview; Teacher Accept hid in a far table column; header “Overview” duplicated the page title; mobile FAB could sit on the last CTA.

Full grid: [CONCEPT_COMPARISON.md](../../design-lab/dashboards/CONCEPT_COMPARISON.md).

---

## Winning direction

**System C shell + System A Student attention + System B tables.** Lab `data-system="w"`.

Shared: grouped SVG nav, role chip, 58px header, serif page titles, split now-rail / raised work panel, status-with-dot, Riyal renderer, loading ≠ empty ≠ error, no Notifications sidebar item, compact chat.

---

## Refinement V1

First winner render of all four overviews + deep views. Split works. Student eye lands on Pay / Review. Quality deep rubric shows `7 / 9` and aggregate `—`. Admin Intelligence is findable. Teacher Accept was not obvious in the overview table. Header title duplicated the H1.

---

## Refinement V2

Quality now-rail shows the next case + Review. Teacher overview uses editorial request rows with visible Accept. Header context hidden on Overview. Singular lede copy. FAB lifted on mobile. 44px primary actions.

---

## Refinement V3

Full-width Accept in the now-rail. Static review of 1440 / AR dark / 390 AR plus the 375–1440 × AR/EN × light/dark matrix (96 overview shots, 0 page errors). Remaining lab nits: Admin marketplace group is still long because those destinations are real; Quality reports page is thin by product truth.

---

## Shared dashboard system

Production primitives (scoped to `.tf-dashboard-shell` so Landing / Browse / Profile are untouched):

`.tf-dashboard-shell`, `.tf-dash-nav*`, `.tf-role-chip`, `.tf-dash-oneliner`, `.tf-overview-split` / `.tf-overview-now` / `.tf-overview-main`, `.tf-attention*` (hairline), `.tf-dash-metric-strip`, `.tf-rubric-scale` / `.tf-rubric-point`, `.tf-dash-text-link`.

Lab owns a fuller prototype vocabulary (`dl-*`) that is not a second production system.

---

## Navigation system

Grouped by job. One SVG stroke family via `Tafseel.dashNavIconPath`. Active inset bar (RTL mirrored). Badges only for real counts.

- Student: Home · Learning (My Work, Sessions, Saved) · Communication · Account (Payments, Reviews, Settings). No invented Profile destination.
- Teacher: Home · Work · Marketplace · Business · Account. Notifications not in sidebar.
- Quality: Queue · Insights · Account.
- Admin: Overview · Marketplace · Operations · Finance · Intelligence · Configuration. No Applications dest. `navItems` retained for CI.

---

## Student Dashboard

Production: `.tf-dashboard-shell`, grouped nav, split Overview (Needs Attention left, My Learning right), existing attention projector unchanged. Find-a-Teacher still routes to Browse. Files dead chrome not reintroduced.

Lab winner feels like a learning home. Production inner learning table still carries legacy inline chrome.

---

## Teacher Dashboard

Production: KPI wall removed from Overview; one-liner balance/rating; requests in now-rail; orders in main panel; loading ≠ empty ≠ error preserved; student avatars on requests preserved; accept modal confirmations untouched.

Lab V3 makes Accept unmistakable. Production request cards still use older bordered articles.

---

## Quality Dashboard

Production: grouped SVG nav, KPI card wall replaced by a one-liner, rubric points are 44px segmented controls, aggregate still `—` until 9/9, decision zone still separated, draft protection / reason-required reject unchanged.

Lab deep review is the quality bar. Production review layout is still the older two-column stack, not the lab’s criterion-definition rows.

---

## Admin Dashboard

Production: `.tf-dashboard-shell`, grouped nav already present, 8-card metric wall replaced by a 4-metric strip (pending applications, disputes, confirmed payments, platform revenue — live or explicitly unavailable), Marketplace Intelligence CTA on Overview. Hide/Restore and withdrawal confirmations not rewritten. Unavailable charts remain honest empty, not fake bars.

Lab Overview is stronger (intervention rail). Production still shows leftover chart empties below the strip.

---

## Operational tables / Queue / Rubric / Financial

Lab tables: caption, toolbar, status dots + labels, mobile card fallback in the prototype. Production tables: same semantics, still `overflow-x` on many operational lists — mobile card conversion is incomplete.

Quality queue is the product. Lab next-case rail is not yet on production list view.

Rubric policy unchanged. Money uses canonical Riyal helper. Withdrawal approve/reject still confirm.

---

## Notifications / Messaging

Header bell + compact popover/sheet preserved. Not a sidebar item. Admin still has no bell. Chat widget not redesigned.

---

## Typography / surfaces / dark / light

One display scale for page titles inside `.tf-dashboard-shell`. Sidebar canvas differs from content canvas in dark mode (`--dash-sidebar-bg`). Light mode uses quiet now-rail vs raised work panel. Depth is better in the lab than in leftover production cards.

---

## Arabic / RTL / Mobile / Tablet / Desktop

Lab matrix covers 375 / 390 / 768 / 1024 / 1280 / 1440 × AR/EN × light/dark. RTL: nav inset, chevrons, money, FAB on inline-start. Mobile stacks the split; drawer is the nav. Production drawer behaviour unchanged (`installDashboardDrawer`). Production 384-cell authenticated matrix was **not** re-run this pass.

---

## Accessibility

Preserved: skip links, dialog semantics, focus helpers, loading/error live text, 44px rubric/attention CTAs in new chrome. Not newly SR-certified. Reduced-motion ambient is out of scope (no new keyframes in concepts).

---

## Production integration

Business logic moved as little as possible. Presentation: shared shell + nav IA + overview hierarchy. New visual structure uses semantic classes. Large volumes of untouched inline styles remain on non-overview sections.

Marketplace CSS block remains scoped away from dashboards.

---

## Regression

Ran this pass:

- Frontend integrity (13 entry points) PASS
- Localization 3345 paired keys PASS
- Localization usage PASS
- Template placeholder leak PASS
- `check-js.mjs` umbrella (auth, R6, R7, R9, unified search, guided request, sprint 6) PASS
- Architecture 1/1, Domain 89/89, Application 14/14, Integration 257/257 PASS
- EF: no pending model changes
- `dotnet format Tafseel.sln --verify-no-changes --no-restore` PASS

Not completed this pass (blocks VERIFIED):

- Release build + isolated publish smoke + health/live/ready
- Authenticated production dashboard visual recert (Student/Teacher/Quality/Admin live Dev)

No deploy.

---

## Files changed (high level)

- `design-lab/dashboards/**` — isolated A/B/C/W prototypes, fixtures, IA, comparison
- `docs/features/evidence/dashboard-design-lab/**` — concept + winner + matrix screenshots
- `Tafseel-Student-Dashboard.dc.html`, `Tafseel-Teacher-Dashboard.dc.html`, `Tafseel-Quality-Dashboard.dc.html`, `Tafseel-Admin-Dashboard.dc.html`
- `css/tafseel.css` — scoped dashboard shell
- `js/tafseel.js` — `dashNavIconPath` keys
- `js/locales.js` — nav group + role badge keys
- `scripts/ci/check-frontend-integrity.mjs` — Student/Quality grouped nav lock
- `tests/browser/dashboard-lab-shots.mjs`

---

## Remaining limitations

1. Production inner sections (earnings, catalog tables, settings, intelligence body, most Admin lists) still look like the previous generation.
2. Production Quality overview has no next-case rail.
3. Production mobile tables are not systematically converted to operational cards.
4. Admin marketplace nav is long because those routes are real — grouping helps, it does not shorten the job.
5. Live authenticated pixels of `.dc.html` were not recertified; lab file:// shots are not a substitute.
6. Release build + isolated publish smoke + health probes not re-run this pass.
7. Winner lab still uses presentation fixtures; they must never enter production UI.

---

## Honest qualitative assessment

| Axis | Assessment |
|---|---|
| Shared Dashboard Shell | Lab: coherent. Production: wrapper + tokens started; not yet one surface language end-to-end. |
| Navigation | Grouped SVG IA is the real win. Still many Admin destinations. |
| Student | Lab excellent. Production Overview closer; rest mixed. |
| Teacher | Lab V3 correct job order. Production Overview no longer a KPI wall. |
| Quality | Lab deep review is the product. Production queue/rubric policy sound, visual still mid-migration. |
| Admin | Lab intervention-first. Production strip + Intelligence CTA; leftover empty charts. |
| Tables | Lab B-quality. Production still raw in places. |
| Queues | Lab next-case + table. Production table-first. |
| Typography | Lab single scale. Production titles inherit display font in shell only. |
| Density | Split is the right density model. |
| Dark | Lab has depth. Production leftover cards still flatten. |
| Light | Paper/quiet vs raised — lab yes, production partial. |
| RTL | Lab inspected. Production not live-recertified. |
| Mobile | Lab stacks honestly. Production drawer unchanged; tables incomplete. |
| Accessibility | No intentional regression; no new SR pass. |
| Overall | Direction is right. Integration is not finished enough to call the product verified. |
