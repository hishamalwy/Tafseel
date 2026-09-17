# UX-03 — V1 navigation

Branch `feat/ux03-navigation`, from `f9a65aa` (UX-02). Gate 4 (Build) and Gate 5 (E2E/Release) for
[UX-03](../../tickets/v1/UX-03.md), batch E on the board. No other ticket was started.

## What changed

Navigation was a list of the tables the API has: nine primary items for a student, eleven for a teacher,
three for the reviewer, seven areas and twenty-four tabs for the admin — with the same order reachable from
My learning, Payments and Overview, and settings, notifications and V1.1 features sitting in primary
navigation (UX_PRINCIPLES §5–§6). It is now a short list of goals, and a destination exists because someone
wants to go there:

| Role | V1 destinations |
|------|-----------------|
| Student (5) | «الرئيسية» Home `/student/overview` · «ابحث عن معلم» Find a teacher `/teachers` · «اطلب شرحاً» Post a request `/requests/new` · «طلباتي» My requests & orders `/student/requests` · «الرسائل» Messages `/messages` |
| Teacher (6) | «الرئيسية» Home `/teacher/home` · «أعمالي» Work `/teacher/work` · «طلبات مفتوحة» Open requests `/teacher/opportunities` · «الرسائل» Messages `/messages` · «أرباحي» Earnings `/teacher/earnings` · «إعداد ملفي» My teaching setup `/teacher/profile` (+ 5 sub-pages) |
| Quality (2) | «طلبات الانضمام» Applications `/quality/applications` · «حسابي» Account `/quality/account` |
| Admin (6) | «يحتاج انتباهك» Attention · «المستخدمون» People · «الخدمات والأسعار» Catalog & pricing · «العمليات» Operations · «المالية» Finance · «سجل التدقيق» Audit |

`features/navigation/models/primary-nav.ts` holds the lists, the labels and — explicitly — which route
belongs to which destination. `NAV_LIMITS` is asserted by spec, so navigation cannot grow back past 5/6/2/6
by accident. Both shells (the UX-01/UX-02 homes and the generic dashboard) render the same
`tf-workspace-nav`, so a person sees one navigation wherever they are.

**Active grouping is matched, not guessed.** The longest matching prefix wins, so `/requests/new` is "Post a
request" while `/requests/{id}` is "My requests & orders"; an order, a session or a dispute opened from a
notification keeps the list it came from highlighted, and all five teaching-setup pages keep their group.

**The header holds what left navigation.** A notifications bell (dot when the first page has something
unread, `UX-04` copy by type, the existing safe-link guard, mark-all-as-read, empty and error states), an
account menu (the role's own settings, a teacher's public profile where their reviews are read, sign out)
and the language switch.

**One list instead of three.** `/student/requests` and `/teacher/work` are the same screen for two viewers:
requests, orders and live sessions together, with «الكل» · «يحتاج إجراء» · «جارية» · «منتهية»; `?view=action`
opens on the action chip. What an item needs decides its chip — the rules the two homes already use — and
every card is the `UX-04` product card that opens the item's own screen. Nothing was aggregated on the
server: the same three list endpoints are read.

**Nothing was deleted.** Retired destinations keep answering: `/student/payments`, `/student/sessions` and
`/student/reviews` land on the merged list, `/student/saved` on `/teachers?saved=1` (the filter travels),
`/student/notifications` on the home where the bell is, `/quality/showcases` on the application queue and
`/admin/insights` on Attention. Hidden V1.1 sections (videos & showcases, showcase moderation, topics,
education levels, qualification topics, promotions, coupons, insights, platform settings) are not rendered;
their routes, guards and APIs are untouched and return with `B11-05`, `B11-12`, `B11-10` and `DEC-09`.

## Verification

| Gate | Result |
|------|--------|
| `dotnet restore --locked-mode` · `dotnet format --verify-no-changes` | exit 0 · exit 0 |
| Release build (incl. Angular) | **0 warnings, 0 errors** |
| Architecture / Domain / Application | 1/1 · 117/117 · 14/14 |
| Integration, provider-neutral | **382/382** (was 381: the navigation adds client links the route scan checks, and `AppRoutes.TeacherVideos` now shares a link with the qualifications screen) |
| Integration, SQL Server | **225/225** |
| Angular unit tests | **461/461 in 50 files** (was 424 in 46: + 13 navigation model, + 12 navigation component, + 7 work item, + 6 work list) |
| Contract gate / `--strict` | **213/213/0** · exit 0 (was 222 shapes: the hidden admin tabs stopped calling five endpoints; every remaining shape still matches a route) |
| `check-js` · `check:i18n` | pass · **1,104 keys** in en/ar |
| EF pending model changes | none |
| publish + `validate-publish.ps1` · `deploy-gates.tests.ps1` | pass · 57/57 |
| Route probe (asserting) | **64/64** |
| **UX-03 journey** `ux03-navigation` | **9/9** |
| UX-01 regression | **8/8** |
| UX-02 regression | **9/9** |
| UX-04 regression | **7/7** |
| UX-05 regression | **6/6** |
| FIN-01 regression | **7/7** |
| Wave 3B direct order | **15/15** |
| Wave 3B open marketplace | **9/9** |

[Verification summary](./evidence/verification.txt) · [route probe](./evidence/runtime-route-probe.txt) ·
[screenshots](./evidence/e2e/screenshots/).

Journeys ran against the verified publish output in Development on throwaway databases seeded by
`scripts/dev/E2ESeed` (`TafseelE2EUx03` for UX-03, UX-04, Wave 3B direct and open marketplace;
`TafseelE2EUx03b` for UX-02 and UX-05, started with `OpenMarketplace__OfferReservationMinutes=20`;
`TafseelE2EUx03c` for FIN-01, which asserts one teacher's whole balance and needs a database of its own).
The journeys only read the database.

## What the journey proves

`ux03-navigation` walks all four roles, the student and teacher in Arabic on a 390×844 phone:

1. the student is offered exactly five destinations, in Arabic, each a ≥ 44px target, with no page-level
   horizontal scroll and no English word in the navigation;
2. every one of the five opens, stays on the address navigation claimed, and is not a dead link; the bell,
   the account menu and the language switch are in the header, and the account menu holds the settings that
   left the primary list;
3. `/student/payments`, `/student/sessions`, `/student/reviews`, `/student/saved` and
   `/student/notifications` still answer — landing on the merged list, on Find a teacher with `saved=1`, and
   on the home — and none of them is a destination any more;
4. a request opened directly keeps "My requests & orders" highlighted, and that list carries the four chips
   with `?view=action` preselected;
5. the teacher is offered exactly six, and profile, services, availability, qualifications and visibility
   are **not** among them;
6. each of the five setup pages keeps «إعداد ملفي» highlighted with its own sub-navigation marked, and the
   services page reads «خدماتي» with the Tafseel-catalog sentence — never "create a service";
7. a request assigned to the teacher keeps "Work" highlighted, and the work list carries the same chips;
8. the reviewer has two destinations and the admin six, every one opens, and `/quality/showcases` and
   `/admin/insights` land on the screens V1 does have.

[Student navigation](./evidence/e2e/screenshots/ux03-student-nav-ar.png) ·
[account menu](./evidence/e2e/screenshots/ux03-student-account-ar.png) ·
[my requests & orders](./evidence/e2e/screenshots/ux03-student-work-ar.png) ·
[teacher navigation](./evidence/e2e/screenshots/ux03-teacher-nav-ar.png) ·
[my services](./evidence/e2e/screenshots/ux03-teacher-setup-ar.png) ·
[admin areas](./evidence/e2e/screenshots/ux03-admin-nav-en.png).

## Defects found

| # | Defect | Where |
|---|--------|-------|
| 1 | Drawer destinations were 40px tall, under the 44px the ticket requires at 390px. | Found by the journey; fixed here |
| 2 | The teacher's services screen was titled «الخدمات والأسعار» — the words UX-03 reserves for **Admin's** Catalog & pricing — instead of «خدماتي» with the catalog sentence. | Found by the journey; fixed here |
| 3 | Three server links named screens V1 no longer shows (`AppRoutes.TeacherVideos` → a hidden tab, `QualityShowcases`/`QualityShowcase(id)` → a hidden queue), so a notification could land nowhere. They now name the screens that exist. | Found by `AppRoutesTests`; fixed here |
| 4 | The account menu resolved the sign-out use case eagerly, so every screen showing the header had to provide the session gateway. It is resolved when someone signs out. | Found by the suite; fixed here |
| 5 | `redirectTo: '/teachers?saved=1'` silently dropped the query — a string redirect is a path only. The saved filter now travels in a `UrlTree`. | Found by the journey; fixed here |

## Decisions and deviations

| # | What | Why |
|---|------|-----|
| 1 | The admin active-row toggles shrank to Catalog Services and Subjects | A toggle exists to serve a tab; the other five tabs are not offered in V1, and the invariant "every toggle belongs to a rendered tab" is still asserted |
| 2 | `/student/requests` and `/teacher/work` are one component with two viewers | They answer the same question from two sides; the chips and the cards are identical, and the sources differ only by `mine`/`assigned` |
| 3 | The E2E seed now creates a reviewer and an admin in the fulfilment scenario | The journey must read their navigation; both are existing roles, own no data, and no other journey depends on them |
| 4 | Three journeys were updated for navigation selectors (UX-04's sweep and notification step, Wave 3B's work-list card, UX-05's reminder) | AC8 expects exactly this: the merged list and the bell replaced the screens those steps read. No assertion was removed — the notification checks now read the bell instead of a retired page |

**Backlog findings (outside UX-03):** the teacher services screen shows price ranges as `0.01 SAR – 1,000,000 SAR`
in an Arabic page, and the riyal mark still falls back to the letters `SAR` until its font loads — both belong
to `UX-06`'s Arabic sweep.

No protected financial code was changed. The only backend changes are three link constants in
`AppRoutes` and two seeded identities in the E2E seeder; no API, DTO, migration or policy changed.

## Commits

| Commit | What |
|--------|------|
| `702c927` | The navigation model, the shared nav/bell/account components, both shells, the merged work list, the redirects, the hidden V1.1 sections and their specs |
| `266f5ac` | The UX-03 journey, the seeded reviewer and admin, and the selector updates to UX-04, UX-05 and Wave 3B |
| `this commit` | This report and the ticket, board, blocker and readiness updates |

## Blocker count

**39 → 38.** UX-03 is Done; no ticket was added.

## Not done here

`UX-06`…`UX-09`, `FIN-02`…`FIN-07`, `PROD-01`, `OPS-01` and every provider, infrastructure, tax and hosting
ticket were not started. The Admin attention list, the Catalog Service policy editor and the finance screens
keep their current content — UX-03 grouped them, it did not redesign them.
