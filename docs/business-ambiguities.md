# Business Decisions Requiring Confirmation

Every item below has no unambiguous answer in the frontend. Per the master instructions, where a safe default exists that doesn't risk financial, security, authorization, or data-consistency behavior, a recommended default is proposed — but these should be confirmed with the product owner before or during the relevant implementation phase, not assumed silently.

## 1. Three referenced pages don't exist in the repository

`Tafseel-Teacher-Apply.dc.html`, `Tafseel-Auth.dc.html`, and `Tafseel-Chat.dc.html` are linked from navigation/footers throughout the site ([audit §1](frontend-requirements-audit.md#1-files-inspected)) but no such files exist. This affects three mandatory spec domains: **authentication**, **teacher onboarding/application intake**, and **real-time messaging**.

**Impact**: there is no frontend evidence for the *exact* fields, steps, or copy of registration/login, the teacher application wizard, or the chat UI.

**Recommendation**: build these three flows from the master spec's explicit requirements (they are detailed enough — password rules, refresh-token flow, multi-step application, message pagination) rather than guessing UI. Do **not** invent a fabricated "Auth page" and claim it reflects existing design — flag it clearly as newly authored in Phase 10, and coordinate with whoever owns product design before finalizing copy/steps, since this is a design decision, not just a backend one.

## 2. Two different, unreconciled "platform fee" numbers

The Request wizard adds a **student-facing 8% "platform fee"** on top of the negotiated price ([Request.dc.html:309](../Tafseel-Request.dc.html#L309)). Separately, the Teacher Dashboard shows a **15% "platform commission"** deducted from teacher earnings ([Teacher-Dashboard.dc.html:183-184](../Tafseel-Teacher-Dashboard.dc.html#L183-L184)), and Admin's platform settings default commission rate is also **15%** ([Admin-Dashboard.dc.html:463](../Tafseel-Admin-Dashboard.dc.html#L463)).

**Open question**: are these the same fee shown from two angles (in which case one of the two numbers is simply wrong/stale mock data and should be unified), or two genuinely separate fees — a student-side surcharge *and* a teacher-side commission that both apply to the same order?

**Recommendation (safe default, does not risk financial correctness because it's fully configurable)**: model them as two independent, versioned config values (`studentFeePercent`, `teacherCommissionPercent`) under `PlatformFee`, snapshotted onto each Order at acceptance time. Ship with the values as currently observed (8% / 15%) and surface both clearly in the Admin Platform Settings page so the business can correct them post-launch without a code change. **Do not silently pick one number and discard the other** — that would be a financial-behavior assumption.

## 3. No coupon redemption path

Admin manages `Coupon` records (WELCOME20, EXAMWEEK, RAMADAN25 — [Admin-Dashboard.dc.html:421-425](../Tafseel-Admin-Dashboard.dc.html#L421-L425)), but the Request wizard's price-summary step hardcodes `Discount: None` with no coupon-code input anywhere ([Request.dc.html:392](../Tafseel-Request.dc.html#L392)).

**Open question**: is coupon redemption in scope for the initial build, or is the Coupons admin page aspirational/future-phase?

**Recommendation**: implement the `Coupon`/`CouponRedemption` entities and admin CRUD (low risk, no UI depends on it existing), but **do not** add a redemption UI to the Request wizard speculatively — that changes a page the product owner didn't ask to change. Confirm before Phase 7 whether the redemption UI should be added.

## 4. Teacher application approval decision vs. rubric score — Resolved for Phase 3

The quality-review rubric computes a displayed "Overall score" as a simple mean of whichever criteria have been scored so far ([Quality-Dashboard.dc.html:341-342](../Tafseel-Quality-Dashboard.dc.html#L341-L342)), but the Approve/Request-changes/Reject buttons are **independent actions**, not gated by any score threshold in the UI.

**Decision**: approval is a human judgment. There is no minimum average threshold. Every one of the nine defined criteria must be supplied exactly once with a score from 1–5.

**Recommendation (safe default per spec: "do not calculate approval solely from a magic average unless a configurable business rule explicitly defines it")**: no automatic gating. Require all 9 criteria to be scored before any decision can be submitted (stricter than the current mock, which allows deciding with partial/zero scores), and require the existing UI rule — a comment on Reject/Request-changes — server-side, not just client-side. Confirm whether a minimum-score gate should exist before Phase 3 ships.

## 5. Teacher "level" badge (`Top rated` / `Rising talent` / `Verified`) is unexplained

Every teacher card shows one of these three labels ([Browse-Teachers.dc.html:257-268](../Tafseel-Browse-Teachers.dc.html#L257-L268)) with no visible computation, admin control, or rule.

**Open question**: is this computed (e.g., `TopRated` = rating ≥ 4.8 AND completed ≥ 200; `RisingTalent` = experience < 5 yrs AND rating ≥ 4.5; `Verified` = default/fallback), manually assigned by Admin, or something else?

**Recommendation**: treat as a **computed, cached** classification (not a magic average per spec, but a simple, documented, configurable rule — e.g. thresholds stored in PlatformSettings) rather than a free-text admin field, since no admin UI to set it exists anywhere. Confirm exact thresholds with the business before Phase 4.

## 6. Availability model conflict between teacher-editor and public profile

The teacher's own "Availability" editor only toggles which *days* they work plus a timezone ([Teacher-Dashboard.dc.html:264-268](../Tafseel-Teacher-Dashboard.dc.html#L264-L268)) — there is no way, in this frontend, to actually produce the specific 4-slots-per-day grid shown on the public Teacher-Profile page ([Teacher-Profile.dc.html:181-193](../Tafseel-Teacher-Profile.dc.html#L181-L193)).

**Recommendation**: build the richer per-slot availability model in the domain (`TeacherAvailabilityRule` with time-of-day granularity, per [domain model §6](proposed-domain-model.md#6-live-sessions)) since that's what's actually rendered publicly, and treat the day-toggle editor as an incomplete/simplified control that likely needs a UI update in Phase 10 to actually let teachers set time-of-day slots. Flag this to whoever owns the frontend design — it's a design gap, not just a backend one.

## 7. No end-to-end live-session booking flow exists

Neither the Request wizard nor the Teacher-Profile Availability tab produces an actual confirmed `LiveSessionBooking`. Selecting a service type of "Live explanation" in the Request wizard collects no specific date/time; the profile's Availability tab only "holds" a slot with a toast ([Teacher-Profile.dc.html:330](../Tafseel-Teacher-Profile.dc.html#L330)).

**Open question**: should live sessions be booked *through* the Learning Request flow (teacher proposes a slot at accept-time, similar to final price/delivery date) or via a separate, direct booking flow off the Availability tab, bypassing the request/accept negotiation entirely?

**Recommendation**: build the API (§ live-sessions in [proposed-api-contracts.md](proposed-api-contracts.md)) to support direct booking off a confirmed availability slot (simpler, matches the "book a live session" CTA copy on the profile page), independent of the Learning Request pipeline. Confirm before Phase 6.

## 8. No delivery-upload UI for teachers

"Deliver" on a `ready`-stage order is a toast stub with no modal/form ([Teacher-Dashboard.dc.html:612](../Tafseel-Teacher-Dashboard.dc.html#L612)). The spec is explicit that only the assigned teacher can deliver and that delivery is a first-class entity (`OrderDelivery`).

**Recommendation**: build the delivery-upload endpoint and a delivery modal analogous to the existing Accept modal (file picker + notes) in Phase 10 frontend integration. This is a low-risk gap-fill, not a business ambiguity requiring sign-off — flagging here only because it changes frontend markup that wasn't asked to change.

## 9. No dispute-creation UI for students or teachers

Admin can *view* open disputes but no page anywhere lets a student or teacher actually open one. The spec requires `Disputes.Create` for eligible parties.

**Recommendation**: same treatment as #8 — build the missing "Raise a dispute" entry point (likely from the Order detail context) during Phase 10, confirm placement/copy with product design first since it's new UI, not a hidden existing control.

## 10. Auto-completion of orders

The spec mentions "student approves or an approved auto-completion rule occurs" as a possible pattern, but no frontend text anywhere mentions a delivery-review deadline or auto-approval timer (contrast with the notification copy "Review within 3 days" seen once, [Student-Dashboard.dc.html:574](../Tafseel-Student-Dashboard.dc.html#L574), which is the only hint of a time limit).

**Open question**: does a delivered order auto-complete (and release escrow) if the student doesn't respond within N days, and is N = 3?

**Recommendation**: implement a configurable auto-completion window defaulting to **3 days** (the one concrete number in the UI text) via a background job, but treat this as provisional until confirmed — auto-releasing escrow is a financial action and must not be guessed silently in production without sign-off.

## 11. Scope of `QualityReviewer` vs `Admin` over the applications queue

Admin's "Teacher Applications" nav item redirects straight to the Quality Dashboard page ([Admin-Dashboard.dc.html:508](../Tafseel-Admin-Dashboard.dc.html#L508)) rather than rendering its own view — implying Admin can see/act on the same queue a QualityReviewer does.

**Recommendation**: grant `Teachers.ReviewApplications` to both roles (Admin implicitly has all permissions per typical RBAC design), no separate "admin view" of applications needed. Low risk, but confirm Admin should have the *same* reviewer capabilities (approve/reject) versus a read-only oversight view — the frontend doesn't distinguish these.

## 12. Refund/withdrawal-processing UI is read-only in the mock

> This marketplace/payment ambiguity remains outside Pass 3.

Admin's Payments & Withdrawals panel shows summary numbers and a withdrawal-history list, but no per-item "approve"/"reject" control exists for pending withdrawals, and no refund-initiation control exists outside the (also absent) dispute-decision flow.

**Recommendation**: build these controls per the spec's explicit requirements (idempotent, transactional, auditable) during Phase 7/9 — again a gap-fill, not a business ambiguity, but noted because it means the Admin dashboard frontend will need new controls added, not just wired up.

## 13. Phase 3 catalog and reapplication decisions — Resolved

- Subject deactivation hides active child Topics and Qualification Topics from public selection without changing child `IsActive`. Subject reactivation restores only independently active children.
- Catalog uniqueness uses persisted Unicode NFC, collapsed-whitespace, invariant-uppercase keys. Accents and Arabic diacritics are retained and remain meaningful for uniqueness.
- Topic and Qualification Topic names are unique within their Subject. Other implemented catalog names are globally unique.
- Rejected and Withdrawn applications permit reapplication. ChangesRequested is resubmitted in place. An existing subject qualification blocks reapplication.
- Qualification revocation/expiry is intentionally not implemented in Pass 3.
