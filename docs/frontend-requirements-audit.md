# Frontend Requirements Audit

Phase 1 output. Every requirement below is derived from the existing repository — no speculative business logic has been added. File:line references point at the exact markup or mock-data source. Items with no frontend evidence are listed separately in [business-ambiguities.md](business-ambiguities.md).

## 0. What this repository actually is

The frontend is authored as **`.dc.html` "design doc" files** rendered by a bundled runtime (`support.js`, generated from an internal `dc-runtime` toolchain — see [support.js:1](../support.js#L1)). Each page is a single React component (`class Component extends DCLogic`) whose `state`/`renderVals()` hold **hardcoded, in-memory mock data** (arrays like `TEACHERS`, `REQUESTS`, `APPLICATIONS`). There is no HTTP call anywhere in the codebase — every button (`Accept`, `Withdraw`, `Approve`, `Save`) calls `this.flash('...')`, a toast, and mutates local component state only. Nothing persists across a page reload. This confirms the task: build a real backend and wire these interactions to it.

Shared runtime: [js/tafseel.js](../js/tafseel.js) — theme (light/dark) and language (en/ar, RTL) persistence via `localStorage`, plus a `data-i18n` text-swap mechanism. This is presentation-only and not a backend concern, except that **API responses must not be pre-localized** — labels are translated client-side from stable keys/enums.

## 1. Files inspected

| File | Lines | Role |
|---|---|---|
| [Tafseel-Landing.dc.html](../Tafseel-Landing.dc.html) | 482 | Marketing home page |
| [Tafseel-Browse-Teachers.dc.html](../Tafseel-Browse-Teachers.dc.html) | 444 | Teacher marketplace search/filter/compare |
| [Tafseel-Teacher-Profile.dc.html](../Tafseel-Teacher-Profile.dc.html) | 431 | Public teacher profile (About/Samples/Services/Availability/Reviews) |
| [Tafseel-Request.dc.html](../Tafseel-Request.dc.html) | 418 | 5-step student request wizard |
| [Tafseel-Student-Dashboard.dc.html](../Tafseel-Student-Dashboard.dc.html) | 733 | Student portal, 10 sections |
| [Tafseel-Teacher-Dashboard.dc.html](../Tafseel-Teacher-Dashboard.dc.html) | 651 | Teacher portal, 13 sections + accept-request modal |
| [Tafseel-Admin-Dashboard.dc.html](../Tafseel-Admin-Dashboard.dc.html) | 647 | Admin portal, 18 nav destinations |
| [Tafseel-Quality-Dashboard.dc.html](../Tafseel-Quality-Dashboard.dc.html) | 441 | Quality reviewer portal + application review/rubric |
| [css/tafseel.css](../css/tafseel.css) | 120 | Design tokens only, no business logic |
| [js/tafseel.js](../js/tafseel.js) | 95 | Theme/i18n runtime only |
| [support.js](../support.js) | 1911 | Generic `.dc.html` rendering runtime — not app logic |

**Pages referenced by links/nav but absent from the repository** (404 if visited):
- `Tafseel-Teacher-Apply.dc.html` — linked from [Landing:35](../Tafseel-Landing.dc.html#L35), [:65](../Tafseel-Landing.dc.html#L65), [:290](../Tafseel-Landing.dc.html#L290), [Browse-Teachers:33](../Tafseel-Browse-Teachers.dc.html#L33), [Teacher-Profile:32](../Tafseel-Teacher-Profile.dc.html#L32)
- `Tafseel-Auth.dc.html` — linked from [Landing:41-42](../Tafseel-Landing.dc.html#L41-L42) (Log in / Get started)
- `Tafseel-Chat.dc.html` — linked from [Teacher-Profile:76](../Tafseel-Teacher-Profile.dc.html#L76),[:258](../Tafseel-Teacher-Profile.dc.html#L258); [Student-Dashboard:63](../Tafseel-Student-Dashboard.dc.html#L63),[:397](../Tafseel-Student-Dashboard.dc.html#L397),[:409](../Tafseel-Student-Dashboard.dc.html#L409); [Teacher-Dashboard:55](../Tafseel-Teacher-Dashboard.dc.html#L55),[:285](../Tafseel-Teacher-Dashboard.dc.html#L285)

These three missing pages cover **authentication, teacher onboarding/application, and real-time messaging** — three of the spec's mandatory domains. See [business-ambiguities.md](business-ambiguities.md) §1.

## 2. Roles discovered

| Role | Evidence |
|---|---|
| **Student** | "Noor Abdulaziz" persona throughout Browse/Profile/Request/Student-Dashboard headers, e.g. [Student-Dashboard:67-68](../Tafseel-Student-Dashboard.dc.html#L67-L68) |
| **Teacher** | "Dr. Rana Al-Otaibi" persona in [Teacher-Dashboard:59-60](../Tafseel-Teacher-Dashboard.dc.html#L59-L60); teacher-side accept/decline/deliver/withdraw actions |
| **QualityReviewer** | "Sami Mattar" persona, QA badge, in [Quality-Dashboard:25](../Tafseel-Quality-Dashboard.dc.html#L25),[:48-49](../Tafseel-Quality-Dashboard.dc.html#L48-L49) |
| **Admin** | Admin badge, platform-wide user/catalog/payment management in [Admin-Dashboard:25](../Tafseel-Admin-Dashboard.dc.html#L25) |

No sign-up/role-selection UI exists (Auth page missing), so how a user becomes a Teacher vs Student, and how QualityReviewer/Admin accounts are provisioned, is not shown — see ambiguities doc.

## 3. Pages, sections and workflows

### 3.1 Landing ([Tafseel-Landing.dc.html](../Tafseel-Landing.dc.html))
Marketing/anonymous page: hero search bar (`onSearch` just flashes a toast, no real search — [:384-387](../Tafseel-Landing.dc.html#L384-L387)), subject tiles, "how it works" 4-step explainer, featured teachers grid, 6 service-type cards, "why trust us" + 5-step escrow explainer ([:426-432](../Tafseel-Landing.dc.html#L426-L432)), testimonials, footer with sitemap links (these are the authoritative list of expected pages, including the 3 missing ones).

### 3.2 Browse Teachers ([Tafseel-Browse-Teachers.dc.html](../Tafseel-Browse-Teachers.dc.html))
Comment at [:255](../Tafseel-Browse-Teachers.dc.html#L255) explicitly says *"Mock marketplace data — shape mirrors the future GET /api/teachers response"* — direct evidence this page is meant to become a real search endpoint.

- **Filters**: free-text search (name/subject/skills/bio), subject select, education-level select, service-type select, minimum-rating chips (Any/4/4.5/4.8), price-range slider (60–400 SAR), teaching-language checkboxes (Arabic/English), "Verified only", "Online now", "Available this week" toggles — [:71-148](../Tafseel-Browse-Teachers.dc.html#L71-L148).
- **Sort**: Recommended, Highest rated, Lowest/Highest price, Fastest response, Most experienced — [:61-67](../Tafseel-Browse-Teachers.dc.html#L61-L67). Sort options are a **whitelisted, fixed set** — confirms the spec's "no arbitrary dynamic SQL sort" requirement is satisfiable.
- **Result card**: photo, online-status dot, name, verified badge, level badge, subject/years, rating/review count/completed count, bio, skill chips, response time, languages, price, "Profile"/"Request" actions, favorite (heart) toggle, "add to compare" checkbox (max 3 — [:419](../Tafseel-Browse-Teachers.dc.html#L419)).
- **Empty state**, **active-filter chips with per-chip clear**, **pagination** (6/page), **comparison tray** (fixed bottom bar once ≥1 selected).
- Mock `TEACHERS[]` fields ([:257-268](../Tafseel-Browse-Teachers.dc.html#L257-L268)) directly imply the Teacher read-model: `subject, level(badge), years/exp, rating, reviews, completed, bio, skills[], responseMins, langs[], price, online, verified, thisWeek(availability flag), levels[], services[]`.

### 3.3 Teacher Profile ([Tafseel-Teacher-Profile.dc.html](../Tafseel-Teacher-Profile.dc.html))
Public profile with 5 tabs:
- **About**: bio paragraphs, education/experience timeline ([:376-381](../Tafseel-Teacher-Profile.dc.html#L376-L381)), subject/topic chips.
- **Teaching samples**: video thumbnail + play button + duration + title/meta, explicitly captioned *"Recorded by the teacher and scored by the Tafseel quality team before approval"* ([:127](../Tafseel-Teacher-Profile.dc.html#L127)) — links teaching samples to the quality-review workflow.
- **Services**: per-teacher service cards (name/desc/price/unit/delivery/revisions/badge), selectable, one "Urgent" badged service (exam-night emergency, [:288](../Tafseel-Teacher-Profile.dc.html#L288)).
- **Availability**: 7-day grid, 4 fixed time slots/day, some pre-disabled, "Times shown in Arabia Standard Time (GMT+3)" ([:179](../Tafseel-Teacher-Profile.dc.html#L179)) — clicking a slot "holds" it (toast only, [:330](../Tafseel-Teacher-Profile.dc.html#L330)); no confirmed booking flow exists on this page.
- **Reviews**: aggregate score + 5-category breakdown bars (Clarity, Communication, Subject knowledge, Delivery time, Value for money — [:411-417](../Tafseel-Teacher-Profile.dc.html#L411-L417)), individual review cards (initials/name/service/date/stars/body).
- Right rail: selected-service summary (price/delivery/revisions/response time), "Request this service"/"Book a live session"/"Contact teacher" CTAs (all link to Request or Chat pages), escrow protection banner, and a privacy note: *"Contact details are shared only after a request is paid — keep the conversation on Tafseel"* ([:271](../Tafseel-Teacher-Profile.dc.html#L271)) — an explicit business rule: **no direct contact info exchange outside a paid engagement**.
- Favorite/save toggle, Share (copy-link) action.

### 3.4 Request wizard ([Tafseel-Request.dc.html](../Tafseel-Request.dc.html))
5-step linear wizard, back/next gated by per-step validation ([:327-331](../Tafseel-Request.dc.html#L327-L331)):
1. **Service type** — 5 choices (Recorded explanation, Live explanation, Exam revision, Assignment guidance, Project help) — [:260-266](../Tafseel-Request.dc.html#L260-L266).
2. **Details** — title, subject (select), topic (free text), description (textarea), education level, difficulty (Introductory/Standard/Advanced), explanation language (Arabic/English/Either). Next disabled until title+topic+description are non-empty.
3. **Files** — drag-and-drop + click-to-browse uploader, per-file icon/size/progress bar/remove; copy claims *"PDF, Word, images, PowerPoint and ZIP up to 25 MB each"* ([:120](../Tafseel-Request.dc.html#L120)) but **no client-side type/size validation exists** ([:296-301](../Tafseel-Request.dc.html#L296-L301)) — must be enforced server-side.
4. **Deadline & budget** — urgency tier (Standard/Fast/Before exam/Same day, each with a % fee: 0/25/40/80 — [:268-273](../Tafseel-Request.dc.html#L268-L273)), preferred delivery date, budget slider (50–500 SAR) or a "flexible — let teacher propose a price" checkbox.
5. **Review** — summary table, price breakdown (service price + urgency fee + **platform fee 8%** [:309](../Tafseel-Request.dc.html#L309) — see inconsistency in §5), escrow banner, mandatory "academic integrity policy" agreement checkbox ([:231](../Tafseel-Request.dc.html#L231)) gating submission.
On submit: success modal, "Dr. Rana Al-Otaibi usually replies within an hour. You'll get a notification the moment she responds." ([:248](../Tafseel-Request.dc.html#L248)) — confirms a **request-created notification event** to the teacher.

### 3.5 Student Dashboard ([Tafseel-Student-Dashboard.dc.html](../Tafseel-Student-Dashboard.dc.html))
Sidebar sections: Overview, My Requests, Live Sessions, Messages, Saved Teachers, Payments, Files, Reviews, Notifications, Settings ([:567-571](../Tafseel-Student-Dashboard.dc.html#L567-L571)).
- **Overview**: 4 stat cards (active requests / upcoming sessions / completed lessons / total spending), recent-requests table with status filter chips (All/Needs action/In progress/Completed), upcoming live sessions with join/reschedule, a 12-week "learning activity" bar chart, recommended-teachers carousel.
- **My Requests**: full table, same status filters, columns: Request/Teacher/Status/Deadline/Amount.
- **Request statuses observed** ([:477-497](../Tafseel-Student-Dashboard.dc.html#L477-L497)): `Pending Teacher Review, Accepted, Payment Required, In Progress, Delivered, Revision Requested, Completed, Cancelled, Disputed` (9 distinct values, each own color).
- **Live Sessions**: card list with countdown, urgent styling for imminent sessions, Join/Reschedule action.
- **Saved Teachers**: favorited-teacher cards.
- **Payments**: 3 stat tiles (Total spending / In escrow / Refunded) + transaction history list (escrow holds, releases, refunds — [:515-522](../Tafseel-Student-Dashboard.dc.html#L515-L522)).
- **Files**: flat list of all files attached to the student's requests, with per-file "Download".
- **Reviews**: list of reviews the student has already written.
- **Notifications**: full-page list + a slide-over panel (bell icon) version; 5 notification types shown ([:573-579](../Tafseel-Student-Dashboard.dc.html#L573-L579)): delivery uploaded, payment required, live-session reminder, revision in progress, payment successful. Unread-count badge, "mark all read", click-to-read.
- **Messages**: conversation list (initials/name/preview/time/unread dot), links out to the (missing) Chat page.
- **Settings**: name/email fields, 2 email-notification toggles, save button.

### 3.6 Teacher Dashboard ([Tafseel-Teacher-Dashboard.dc.html](../Tafseel-Teacher-Dashboard.dc.html))
Sidebar: Overview, New Requests, Active Orders, Live Sessions, My Services, Teaching Samples, Availability, Messages, Reviews, Earnings, Withdrawals, Profile, Settings ([:478-483](../Tafseel-Teacher-Dashboard.dc.html#L478-L483)).
- **Overview**: greeting + 6 stat tiles, **New student requests** section — cards showing student/subject/urgency badge/topic/description/attached files/budget/deadline with **Accept / Decline / Request clarification** actions ([:118-120](../Tafseel-Teacher-Dashboard.dc.html#L118-L120)).
  - **Accept** opens a modal ([:400-434](../Tafseel-Teacher-Dashboard.dc.html#L400-L434)): Final price (number input, pre-filled from student's budget), Delivery date, Number of revisions (0–3 select), optional notes to student → "Accept request". This is the authoritative evidence for the spec's "acceptance must include final price and delivery date."
  - **Active orders** table with stage tabs (All/Accepted/In Progress/Ready to Deliver/Revision/Completed) and a stage→action map ([:456](../Tafseel-Teacher-Dashboard.dc.html#L456)): `accepted→"Start work", progress→"Continue", ready→"Deliver", revision→"View revision", completed→"View"`. **No delivery-upload UI exists** — "Deliver" is a toast stub ([:612](../Tafseel-Teacher-Dashboard.dc.html#L612)).
  - **Earnings** panel: Available/Pending/Total balance, "Platform commission (**15%**)" ([:183-184](../Tafseel-Teacher-Dashboard.dc.html#L183-L184)) shown next to a "Withdraw" button, recent payout/commission transactions.
  - **Upcoming live sessions** mini-list with "Start" action.
- **My Services**: 4 configurable services (recorded/live/exam/assignment) each with an Active/Paused toggle — no price-editing UI, no create-new-service UI.
- **Teaching Samples**: read-only video grid (upload UI absent here — implies samples are submitted during application, not from this dashboard).
- **Availability**: day-of-week toggle buttons + timezone select + save. No time-of-day granularity (contradicts the Teacher-Profile page's 4-slots-per-day view — see inconsistency §5).
- **Messages / Reviews**: read-only lists, same pattern as student side.
- **Withdrawals**: available balance + "Withdraw to bank ****4821" button (masked bank reference implies a stored payout method, no UI to add/edit one) + withdrawal history with status.
- **Profile**: bio + LinkedIn URL, no other qualification fields editable here.
- **Settings**: 2 notification toggles (email new requests, SMS session reminders).

### 3.7 Admin Dashboard ([Tafseel-Admin-Dashboard.dc.html](../Tafseel-Admin-Dashboard.dc.html))
18 nav destinations mapped to 6 page templates ([:477-483](../Tafseel-Admin-Dashboard.dc.html#L477-L483), routing logic [:506-517](../Tafseel-Admin-Dashboard.dc.html#L506-L517)):
- **Overview**: 8 KPI tiles (total users, active teachers, active students, pending applications, total orders, total revenue, platform commission, open disputes), revenue/orders bar charts (8-month trend), subject-popularity bars, teacher-approval-rate stacked bars (6-month), a **Users** table (search + role filter + bulk select + bulk Suspend/Activate + per-row Suspend/Activate), payments summary panel, open-disputes panel.
- **Users / Students / Teachers / Quality Reviewers** (same template, `pageRole` filter): searchable table, per-user Suspend/Activate.
- **Subjects / Topics / Services / Coupons** (same "catalog" template): list with Edit + Active/Inactive toggle + "Add {item}" button (opens nothing — stub).
- **Requests / Live Sessions / Reviews / Disputes** (same "simple list" template): read-only status list, e.g. disputes show `title, counterpart, amount, opened-X-ago, status:Open` — **no resolve/refund action exists in the UI**.
- **Payments & Withdrawals**: 5 summary rows (student payments 30d, teacher earnings 30d, platform commission, pending withdrawals, refunds issued) — no per-withdrawal approve/reject action visible.
- **Reports**: same revenue/orders charts as overview.
- **Platform Settings**: commission-rate number input (default **15**, [:463](../Tafseel-Admin-Dashboard.dc.html#L463)), "Require quality review before teachers go live" toggle (**default true** — direct evidence for the spec's gating rule), Maintenance mode toggle.
- The "Teacher Applications" nav item **redirects to the Quality Dashboard page** ([:508](../Tafseel-Admin-Dashboard.dc.html#L508)) rather than rendering its own view — Admin and QualityReviewer share the same application queue UI.

### 3.8 Quality Dashboard ([Tafseel-Quality-Dashboard.dc.html](../Tafseel-Quality-Dashboard.dc.html))
- **Applications queue**: 4 summary tiles (pending / reviewed today / approval rate / avg review time), status-tab filter (All/Pending/Under Review/Changes Requested/Approved/Rejected), table with Teacher/Subject/Submitted/Priority(High/Medium/Low)/Status/Review-action.
- **Application review detail** (2-column layout):
  - Left: applicant facts (email/city/experience/degree/education levels/languages — [:271-288](../Tafseel-Quality-Dashboard.dc.html#L271-L288)), demo video player stub (duration/format shown, "max 3:00" limit — [:187](../Tafseel-Quality-Dashboard.dc.html#L187)), **9-criterion evaluation rubric**, each scored 1–5 via button group ([:268](../Tafseel-Quality-Dashboard.dc.html#L268)): `Subject knowledge, Accuracy of information, Clarity of explanation, Communication skills, Teaching structure, Voice quality, Video quality, Student engagement, Professionalism`. Overall score = simple mean of scored criteria ([:342](../Tafseel-Quality-Dashboard.dc.html#L342)) — **not a spec-mandated calculation, only this mock's placeholder** (see ambiguities §4). Comment field (**required** to reject or request changes — [:345](../Tafseel-Quality-Dashboard.dc.html#L345), enforced client-side) and a separate "internal notes (not shared with teacher)" field.
  - Right: Approve / Request changes / Reject decision buttons, and an application status-history timeline (submitted → assigned → demo processed → awaiting review) — direct evidence for `TeacherApplicationStatusHistory` with actor+timestamp.
- **Reports**: reviewed-per-week chart, approval-rate/avg-time tiles.
- **Settings**: "email me on new application" + "auto-assign applications to me" toggles.

## 4. Cross-cutting UI patterns (apply to every page)

- **Statuses always render as colored pill badges** driven by a `STATUS_TONE`/`TONE_STYLE` lookup — confirms status values are a small closed enum per entity, safe to model as C# enums.
- **Every mutating action is currently a client-only `flash()` toast** — no page persists a change across reload. This is expected; the backend replaces all of these with real calls.
- **RTL/i18n**: every page swaps `dir` and translates via `data-i18n` keys; currency is formatted as `SAR {n}` (en) / Arabic-Indic digits + `ر.س` (ar) via `Tafseel.money()` ([js/tafseel.js:87-90](../js/tafseel.js#L87-L90)) — confirms **currency is SAR only**, single-currency system.
- **Responsive**: sidebar becomes a drawer, tables scroll horizontally — no functional impact on the API.

## 5. Inconsistencies found between pages

1. **Platform commission rate conflict**: Request wizard computes an 8% "platform fee" on top of the service price ([Request.dc.html:309](../Tafseel-Request.dc.html#L309)), while Teacher Dashboard displays a flat "Platform commission (**15%**)" against earnings ([Teacher-Dashboard.dc.html:183-184](../Tafseel-Teacher-Dashboard.dc.html#L183-L184)), and Admin's platform settings default commission rate is also **15%** ([Admin-Dashboard.dc.html:463](../Tafseel-Admin-Dashboard.dc.html#L463)). These read as two different fees (a student-side "platform fee" vs a teacher-side "commission" deducted from payout) that happen to use different numbers with no stated relationship. Flagged in [business-ambiguities.md](business-ambiguities.md) §2.
2. **Two independent rating rubrics** exist and must not be merged: the *student review* of a completed order (5 categories: Clarity, Communication, Subject knowledge, Delivery time, Value for money — [Teacher-Profile:411-417](../Tafseel-Teacher-Profile.dc.html#L411-L417)) vs. the *quality reviewer's* evaluation of a teacher's qualification demo (9 categories — [Quality-Dashboard:268](../Tafseel-Quality-Dashboard.dc.html#L268)). Confirmed as distinct entities in the domain model.
3. **Availability granularity conflict**: the public Teacher-Profile availability tab shows a 7-day × 4-fixed-time-slot grid ([:181-193](../Tafseel-Teacher-Profile.dc.html#L181-L193)), but the Teacher Dashboard's own "Availability" editor only lets a teacher toggle which *days* they work plus a timezone, with no time-of-day input ([Teacher-Dashboard:264-268](../Tafseel-Teacher-Dashboard.dc.html#L264-L268)). There is no way, in this frontend, for a teacher to actually produce the specific slot grid shown on their own profile.
4. **Teacher-configurable services vs. publicly displayed services**: Teacher Dashboard's "My Services" lists exactly 4 toggleable services (recorded/live/exam/assignment — [:533-538](../Tafseel-Teacher-Dashboard.dc.html#L533-L538)), but the public Teacher-Profile page shows 5 services for the same teacher persona, including an "Exam night emergency session" with an "Urgent" badge that has no corresponding toggle in the dashboard ([Teacher-Profile:288](../Tafseel-Teacher-Profile.dc.html#L288)).
5. **Teacher "level" badge** (`Top rated` / `Rising talent` / `Verified`) appears as flat mock data on every teacher card with no visible rule, admin control, or computation shown anywhere — ambiguous whether it's computed or manually assigned.
6. **Scale mismatch**: marketing copy claims "1,240 verified teachers" / "38,600 requests completed" / "8,412 users", but every list is backed by 6–12 hardcoded mock rows with client-side-only pagination controls that don't actually fetch more data.

## 6. File upload requirements (evidence-based)

| Context | Evidence | Notes |
|---|---|---|
| Student request attachments | [Request.dc.html:119-144](../Tafseel-Request.dc.html#L119-L144) | Copy claims PDF/Word/images/PPT/ZIP, 25 MB/file; no enforcement client-side |
| Teacher qualification demo video | [Quality-Dashboard.dc.html:182-189](../Tafseel-Quality-Dashboard.dc.html#L182-L189) | MP4, 1080p, max 3:00 duration, referenced but no upload UI (belongs to missing Teacher-Apply page) |
| Teaching samples | [Teacher-Profile.dc.html:128-142](../Tafseel-Teacher-Profile.dc.html#L128-L142), [Teacher-Dashboard.dc.html:244-256](../Tafseel-Teacher-Dashboard.dc.html#L244-L256) | Read-only display only; no upload UI found anywhere in the repo |
| Delivery files (teacher → student) | Referenced only via "Deliver" button label; no modal or form exists | Gap — must be designed from spec guidance |
| Profile photo | Placeholder "photo" boxes everywhere ([Teacher-Profile:54](../Tafseel-Teacher-Profile.dc.html#L54)) | No upload control anywhere |

## 7. Notification events (evidence-based)

From [Student-Dashboard.dc.html:573-579](../Tafseel-Student-Dashboard.dc.html#L573-L579): delivery uploaded, payment required (teacher accepted, awaiting payment), live-session reminder, revision in progress, payment successful (released to teacher).
From [Request.dc.html:248](../Tafseel-Request.dc.html#L248): request-submitted confirmation to student, implies a paired "new request" notification to the teacher (seen as "3 new requests are waiting" on [Teacher-Dashboard:71](../Tafseel-Teacher-Dashboard.dc.html#L71)).
From [Quality-Dashboard.dc.html:428-432](../Tafseel-Quality-Dashboard.dc.html#L428-L432): application submitted → assigned to reviewer → demo processed → awaiting review, each a timestamped state.

## 8. Payment/financial UI surface (evidence-based, no implementation implied)

- Escrow narrative repeated on Landing, Teacher-Profile, Request review step: pay → held by Tafseel → released only after student approval.
- Student "Payments" section: Total spending, In escrow, Refunded, transaction list (holds/releases/refunds signed +/−).
- Teacher "Earnings"/"Withdrawals": Available balance, Pending balance, Total earnings, commission line, "Withdraw to bank ****4821", withdrawal history with status.
- Admin: platform-wide payments/withdrawals summary, commission-rate setting, open disputes with dollar amounts.
- **No real payment provider, card entry, or webhook simulation appears anywhere** — confirms a mock payment provider is the correct Phase 1 scope per the master spec.

## 9. Validation requirements observed

- Request wizard step 2: title, topic, description required (non-empty) before advancing ([:328](../Tafseel-Request.dc.html#L328)).
- Request wizard step 5: agreement checkbox required before submit ([:329](../Tafseel-Request.dc.html#L329)).
- Quality review: comment required before Reject or Request-changes decisions ([:345](../Tafseel-Quality-Dashboard.dc.html#L345)).
- Browse-Teachers "compare" capped at 3 teachers ([:419](../Tafseel-Browse-Teachers.dc.html#L419)).
- No email/password format validation exists anywhere (Auth page missing).

## 10. Filters and sorting (whitelist source of truth)

- Teachers: sort by `recommended|rating|price-asc|price-desc|response|experience` ([Browse-Teachers:61-67](../Tafseel-Browse-Teachers.dc.html#L61-L67)); filter by subject, education level, service type, min rating, max price, language(s), verified-only, online-only, available-this-week.
- Requests (student & admin lists): status-group filter `all|action|active|done` (student side, [:581](../Tafseel-Student-Dashboard.dc.html#L581)) and full status filter (admin).
- Orders (teacher side): stage filter `all|accepted|progress|ready|revision|completed` ([:487-489](../Tafseel-Teacher-Dashboard.dc.html#L487-L489)).
- Applications (quality): status filter `all|pending|underreview|changesrequested|approved|rejected` ([:397-399](../Tafseel-Quality-Dashboard.dc.html#L397-L399)).
- Admin users: role filter `all|Student|Teacher|Reviewer` + free-text search on name/email.

These are the authoritative enum/whitelist sources for backend query parameters.
