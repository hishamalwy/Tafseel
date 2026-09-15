# Tafseel UX Principles

**Status:** permanent rule set · Release Control 1, 2026-09-15. Every ticket's Gate 2 (UX) in
[`SDLC.md`](../engineering/SDLC.md) is checked against this document. The inventory in §5–§7 is a
read-only audit of `bec03a8`; nothing was redesigned in this phase.

## 1. The primary principle

> **The dashboard tells the user what they need to do now. It is not a database or entity explorer.**

A home screen answers, in order: *Is anything waiting for me?* → *What is in progress?* → *What can I
start?* Lists of every entity, raw fields and search boxes over mixed record types belong nowhere on a
home screen.

## 2. Rules

1. **One obvious next step.** Each screen has at most one primary call to action for its current
   state. Secondary actions are visually secondary.
2. **Action-required first.** Items needing the viewer's action (pay, review a delivery, answer a
   question, accept a request, start work, confirm a session outcome, fix a publication blocker) are
   shown before anything informational.
3. **Progressive disclosure.** Disputes, revisions, refunds, reservations, versions, concurrency,
   statuses and operational concepts appear only when they are relevant to the item on screen.
   A student never sees "dispute" before there is something disputable; nobody ever sees "version".
4. **Product words, never code words.** No enum names, numeric statuses, GUIDs, `null`, "Updated",
   "Count" or HTTP terms. Every status has an Arabic and English product term
   ([Product Contract §3](./TAFSEEL_PRODUCT_CONTRACT.md#3-terminology)).
5. **Configuration is not home content.** Profile, offerings, availability, qualifications, payout
   details and account settings are dedicated areas reached from navigation or from a blocker's
   "Fix" link.
6. **The server decides; the UI explains.** The UI offers actions the current state allows and, when
   the server refuses, says why in plain words and what to do next.
7. **Money and destructive actions are confirmed** in a dialog that states the consequence (amount,
   refund or no refund, what cannot be undone).
8. **Every state is designed:** loading, empty (with the next step), error (with retry), and
   "not available to you".
9. **Mobile first for customer journeys.** Student and teacher journeys are verified at 390px; no
   horizontal scroll; no content spilling out of its container; touch targets ≥ 44px.
10. **RTL first.** Arabic is verified before English: layout direction, arrows, numbers, mixed-script
    names, date and currency order.

## 3. Saudi-first usability

The product must work for a mainstream consumer audience without training. We make no assumption
about users' intelligence or nationality; we assume they are busy, on a phone, and new to Tafseel.

**Target: a first-time user understands the principal action of any screen within about 30 seconds.**

| Requirement | Meaning in practice |
|-------------|--------------------|
| Plain Arabic | Short sentences, everyday words (e.g. «اطلب شرحاً» not «إنشاء طلب تعلم»); no translated jargon; formal-neutral register |
| Minimal English product terms | No English words inside Arabic UI except proper names and file names |
| Clear primary CTA | One filled button per screen state, labelled with a verb describing the outcome («ادفع الآن», «سلّم العمل») |
| One obvious next step | "Next step" panel on every item screen (already the pattern on order, request and session screens) |
| Progressive disclosure | Advanced details collapsed or on the item's own screen |
| Strong mobile experience | Sticky primary action where the content scrolls (checkout pattern), readable at 390px, no tables on phone |
| RTL-first verification | Every customer-facing ticket's E2E runs once in Arabic at phone width |
| Avoid information-dense dashboards | ≤ 5 cards above the fold; each card one item, one state, one action |
| No internal workflow terminology | Not "escrow", "ledger", "maturity", "reservation version", "settlement worker"; say «المبلغ محفوظ لدى تفصيل», «يُتاح للسحب بعد …» |
| Confirmations | Payment, cancellation, completion, withdrawal, refund, decline: dialog with consequence |
| Arabic-friendly formats | Dates and times in the viewer's zone with Arabic month names in Arabic UI; SAR shown with the approved currency symbol; numbers consistent within a screen; relative time for recent events ("منذ ساعتين") |

## 4. Role homes — V1 intent

### Student home
In this order:
1. **Action required** — pay an accepted order or held offer (with countdown), review a delivery,
   answer a teacher's question, confirm a session outcome.
2. **Current work** — requests in progress, orders in progress, next upcoming session (one card each,
   linking to the item screen).
3. **Start something** — *Find a teacher* and *Post a request* (the two demand paths).
Not on the home: payments history, saved teachers list, reviews and disputes lists, settings,
notifications list (a bell), raw entity lists.

### Teacher home
In this order:
1. **Publication/setup blocker** while unpublished (the server's first blocker with its "Fix" link) —
   replaces everything below until resolved.
2. **Action required** — new direct requests, paid orders to start, revisions to deliver, sessions to
   settle, questions answered by students.
3. **Opportunities** — a short list of relevant open requests (link to all).
4. **Upcoming session.**
5. **Earnings summary** — available, pending clearance, next clearance date (after `FIN-01`).
Profile, services, availability, qualifications and account setup remain configuration areas.

### Quality home
The application queue (the existing screen) is the home.

### Admin home
An **attention list**: disputes awaiting action, withdrawals and payout profiles awaiting review,
stuck sessions, failed jobs/alerts. Everything else is navigation.

## 5. Current navigation (audit of `bec03a8`)

Source: `DASHBOARDS` in `features/dashboards/models/dashboard.ts` (the generic dashboard sidebar)
and `WorkspaceShellComponent` (the same entries on dedicated screens), plus the public header.

**Public header (all visitors):** Browse teachers (`/teachers`) · Post a request (`/requests`) ·
About · Account / Sign in.

| Role | Primary items (in order) | Count |
|------|--------------------------|-------|
| **Student** | Overview · My learning (tabs: Requests, Orders) · Sessions · Messages · Saved teachers · Payments · Reviews & disputes · Notifications · Settings | **9** (+2 tabs) |
| **Teacher** | Home · Work (tabs: Requests, Orders, Sessions) · Opportunities · Messages · Profile · Services · Availability · Publication · Qualifications & reviews (tabs: Qualifications, Videos & showcases, Reviews) · Earnings (tabs: Summary, Withdrawals) · Settings | **11** (+8 tabs) |
| **Quality** | Applications · Showcases · Account | **3** |
| **Admin** | Home · People (Users, Teachers, Students, Reviewers) · Marketplace (Services, Subjects, Topics, Education levels, Qualification topics, Promotions) · Operations (Requests, Orders, Sessions, Disputes, Reviews) · Finance (Payments, Withdrawals, Payout profiles, Coupons, Reconciliation) · Insights (Reports) · System (Audit, Settings) | **7** (+24 tabs) |

## 6. Dashboard inventory — Student and Teacher

### 6.1 How the generic dashboard renders (applies to every generic section)
Each section loads one or more API lists and renders **every row as the same card**: title (falls back
to name, email, code or **id**), a **status badge showing the raw status value** (numbers such as `0`,
`2` — no DTO carries a status name), a detail line, a field list (Amount, **Currency**, Created,
**Updated**, Scheduled, Deadline, **Total**, **Count**), files, and per-row actions. Every section has
a free-text **Search** box and a **Refresh** button. This is the entity-explorer pattern §1 forbids.

### 6.2 Student

| Item | Kind | Currently shows / does | Classification |
|------|------|------------------------|----------------|
| Overview | nav + home | Mixed cards from requests, orders, sessions and 100 notifications, raw statuses, search | **Keep primary — rebuild as action-first home** (`UX-01`) |
| My learning › Requests | nav tab | Generic request cards + "Open" | **Merge** into "My requests & orders" (item screens already exist) |
| My learning › Orders | nav tab | Generic order cards + "Open" | **Merge** (as above) |
| Sessions | nav | Generic session cards + "Open" | **Make contextual** (home "Upcoming session" + list inside My learning) when live sessions ship |
| Messages | nav | Redirects to `/messages` | **Keep primary** |
| Saved teachers | nav | Favourite teacher cards | **Move under Find a teacher** (filter "Saved") |
| Payments | nav | The same orders and sessions again (duplicate lists) | **Remove obsolete** (payment state lives on each item; receipts V1.1) |
| Reviews & disputes | nav | Eligible and open disputes | **Make contextual** (dispute entry on the order/session screen; reviews on the order screen) |
| Notifications | nav | 100 notifications as cards | **Move to header bell** |
| Settings | nav | Name, English name, export data | **Move under account menu** |
| Public header "Post a request" → `/requests` | CTA | Wave 2 marketplace list page (inline choose-offer) | **Merge**: point to the request-mode choice; retire the duplicate list (`UX-05`) |
| `/requests/new` without a teacher | setup | Two cards: direct teacher vs open request | **Keep** (entry to both demand paths) |

### 6.3 Teacher

| Item | Kind | Currently shows / does | Classification |
|------|------|------------------------|----------------|
| Home | nav + home | Home summary, balances, 100 notifications as generic cards | **Keep primary — rebuild as action-first home** (`UX-02`) |
| Work › Requests | nav tab | Request cards with Accept / Decline / Open | **Keep primary** as "Work" (merged list) |
| Work › Orders | nav tab | Order cards + Open | **Keep** (merged into Work) |
| Work › Sessions | nav tab | Session cards + Open | **Keep** (merged into Work) |
| Opportunities | nav | Open-request cards + Open | **Keep primary** |
| Messages | nav | Redirects to `/messages` | **Keep primary** |
| Profile | nav (setup) | Profile editor | **Move under "My teaching setup"** |
| Services | nav (setup) | Offerings editor | **Move under "My teaching setup"** |
| Availability | nav (setup) | Weekly windows, time off | **Move under "My teaching setup"** |
| Publication | nav (setup) | Blockers, checklist, publish | **Make contextual** (home blocker while unpublished) + inside setup |
| Qualifications & reviews › Qualifications | nav tab | Generic qualification cards | **Move under setup** |
| Qualifications & reviews › Videos & showcases | nav tab | Generic lists | **V1.1** (showcases deferred) |
| Qualifications & reviews › Reviews | nav tab | Raw `/teachers/me` card | **Make contextual** (reviews on the public profile preview) |
| Earnings › Summary | nav tab | Balances + analytics as generic cards | **Keep primary** — rebuild (`FIN-01`) |
| Earnings › Withdrawals | nav tab | Generic withdrawals, profile, policy cards | **Keep under Earnings** — rebuild (`FIN-02`, `FIN-03`) |
| Settings | nav | Notification preferences card | **Move under account menu** |
| Public header "Post a request" shown to teachers | CTA | Leads to the student marketplace list | **Remove for teachers** (show "Opportunities") |
| `/requests` teacher side (Wave 2 inline offer form) | page | Duplicate of `/teacher/opportunities/:id` | **Remove obsolete** (`UX-05`) |

### 6.4 Overloaded pages
- **Generic dashboard page** — one component renders 30+ sections for four roles with the same card,
  including settings forms and admin toggles (`dashboard-page.component.*`).
- **Student Overview / Teacher Home** — four to five heterogeneous lists merged into one grid of up to
  ~250 cards with no priority.
- **Landing page** — also carries a promo wizard showing coupon codes that checkout cannot accept.

### 6.5 Duplicated paths to the same goal
| Goal | Paths |
|------|-------|
| Choose an offer on an open request | `/requests?requestId=` (Wave 2 inline) · `/requests/:id/offers` (3B) |
| Send an offer | `/requests` teacher side (Wave 2 inline form) · `/teacher/opportunities/:id` (3B) |
| See orders | Student: My learning › Orders · Payments · Overview |
| See sessions | Student: Sessions · Payments · Overview |
| Messages | `/student/messages` and `/teacher/messages` (redirects) · `/messages` |

### 6.6 Technical or inappropriate wording found
- Numeric status badges on every generic card (`0`, `1`, `2` …).
- Card titles falling back to ids or emails.
- Field labels "Currency", "Updated", "Total", "Count" on generic cards.
- Admin: "Command centre", "Reconciliation", "Payout profiles", "Qualification topics", "Audit",
  "Insights" — acceptable for Admin but not for Student/Teacher.
- Teacher: "Publication" (prefer «ظهور ملفك للطلاب» / "Profile visibility"), "Opportunities" (acceptable,
  prefer «طلبات مفتوحة»), "Showcases".
- Order history actor "System" (prefer «تفصيل»).
- Request descriptions built by the wizard with a label prefix («الهدف:») stored inside the text.
- Mock-only: "Simulated payment", toast «تم تأكيد الدفع عبر webhook التجريبي», "Go to my orders" after
  paying for a session (mock simulator is not shipped, but staging users see it).
- "Help me write this" shown when the assistant is disabled (returns "unavailable").

## 7. Recommended V1 navigation (not implemented)

### Student — 5 primary destinations
| # | Destination | Contains |
|---|-------------|----------|
| 1 | **Home** («الرئيسية») | Action required · current work · upcoming session · start something |
| 2 | **Find a teacher** («ابحث عن معلم») | Browse, filters, saved teachers (filter) |
| 3 | **Post a request** («اطلب شرحاً») | Direct vs open choice |
| 4 | **My requests & orders** («طلباتي») | Requests, orders, sessions (one list with state filters) |
| 5 | **Messages** («الرسائل») | Inbox |
Header: notifications bell, account menu (settings, data export, sign out), language.
Removed from primary: Payments (obsolete), Reviews & disputes (contextual), Saved teachers (merged),
Notifications (bell), Settings (account menu), Sessions (merged).

### Teacher — 6 primary destinations
| # | Destination | Contains |
|---|-------------|----------|
| 1 | **Home** | Setup blocker · action required · opportunities preview · upcoming session · earnings summary |
| 2 | **Work** («أعمالي») | Requests, orders, sessions (one list with state filters) |
| 3 | **Open requests** («طلبات مفتوحة») | Opportunities |
| 4 | **Messages** | Inbox |
| 5 | **Earnings** («أرباحي») | Balance, withdrawals, payout details |
| 6 | **My teaching setup** («إعداد ملفي») | Profile, offerings, availability, qualifications, visibility (publication) |
Header: notifications bell, account menu, language.
Nested: Profile, Services, Availability, Publication, Qualifications → Setup. Contextual: Reviews
(profile preview), Publication (home blocker). Deferred: Videos & showcases (V1.1). Removed: Settings
(account menu).

### Quality — 2 primary destinations
**Applications** (queue → review) · **Account**. Showcases returns with B11-05.

### Admin — 6 primary destinations
| # | Destination | Contains |
|---|-------------|----------|
| 1 | **Attention** | Disputes to act on, withdrawals and payout profiles to review, stuck sessions, alerts |
| 2 | **People** | Users with role filter; suspend |
| 3 | **Catalog & pricing** | Catalog Services with price/delivery/revision policy (`PROD-01`), subjects (read + enable/disable) |
| 4 | **Operations** | Requests, orders, sessions, disputes, reviews |
| 5 | **Finance** | Payments & refunds, withdrawals, payout profiles, reconciliation |
| 6 | **Audit** | Audit log |
Deferred from primary: Promotions, Coupons (`DEC-09`), Insights/Reports (V1.1), education levels and
qualification-topic editors (V1.1), System settings (none needed).

Implementation of this navigation is ticket `UX-03` (with `UX-01`, `UX-02`).
