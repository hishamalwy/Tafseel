# PHASE 3 — MARKETPLACE PRODUCT RULES
## RELEASE 3 / 4
# CONSUMER MARKETPLACE EXPERIENCE

Release 1 and Release 2 are completed.

Do NOT redesign Releases 1–2.  
Do NOT change any business rules.  
Do NOT change pricing logic.  
Do NOT change payments.  
Do NOT change authentication.  
Do NOT change teacher qualification rules.  
Do NOT create new APIs unless absolutely required.

This release is **100% Consumer Experience**.

---

# OBJECTIVE

Make Tafseel feel like a premium educational marketplace.

Every Student page must maximize:

* Trust
* Clarity
* Conversion
* Simplicity

without inventing any unsupported metrics.

Think like:

* Senior Product Manager
* Senior UX Designer
* Conversion Optimizer
* Educational Marketplace Designer

Competitive bar for product judgment (not visual cloning):

* **Preply** — teacher trust, clarity of offer, booking confidence
* **Italki** — educational credibility, language/service understanding, honest proof
* **Fiverr** — service packaging clarity, price confidence, low-friction purchase path

Judge every screen as a real product that must win a Student’s decision in ≤ 30 seconds — without copying competitor layouts, inventing metrics, or violating current Tafseel business rules.

---

# IMPORTANT

Evidence-first.  
Product-first.  
UX-first.

* No fake ratings.
* No fake statistics.
* No fake "Top Teacher".
* No fake "Most Popular".
* No fabricated testimonials.
* No fabricated availability.
* No placeholder production UI.
* No mock cards.

Honesty constraints from existing integrity work remain in force (including F-002 public metrics integrity and trust-only badge rules). If evidence is sparse, design for sparse truth — never invent density.

---

# PART 1 — Full Consumer Journey Audit

Audit the complete Student journey.

```
Landing
  ↓
Browse Teachers
  ↓
Teacher Profile
  ↓
Request Wizard
  ↓
Payment
  ↓
Order Timeline
  ↓
Delivery Review
  ↓
Rating
  ↓
Completed Order
```

Evaluate every step for trust, clarity, conversion, friction, dead ends, duplicated actions, and unsupported claims.

---

# PART 2 — Browse Teachers

Perform a brutal UX audit.

Review:

* Teacher Cards
* Spacing
* Hierarchy
* Filters
* Sorting
* Search
* Subject selection
* Qualification badge
* Service pricing
* Languages
* Trust
* Conversion
* Visual balance
* Mobile layout
* Loading
* Empty state
* Skeletons
* Accessibility

Remove visual noise.  
Prioritize what actually helps Students choose.

---

# PART 3 — Teacher Profile

Treat this page as the product’s landing page.

Review:

* Hero
* Trust
* Teaching Samples
* Services
* About
* Reviews
* Availability
* Sticky sidebar
* CTA hierarchy
* Scrolling behavior
* Whitespace
* Typography
* Media presentation
* Service selection
* Mobile
* Tablet
* Desktop

Identify every element that decreases conversion.  
Improve hierarchy without changing business rules.

---

# PART 4 — Teaching Samples

Teaching Samples are the primary selling point.

Audit:

* Player
* Navigation
* Arrows
* Keyboard
* Swipe
* Loading
* Poster
* Metadata
* Playback
* Thumbnail strategy
* Qualification vs Showcase
* Spacing
* Information hierarchy

Ensure:

* One featured player.
* Professional carousel.
* No duplicated badges.
* No repeated metadata.
* Smooth transitions.

Preserve existing Showcase / Qualification trust separation. Do not merge trust signals that product rules keep distinct.

---

# PART 5 — Request Wizard

Review:

* Progress indicator
* Steps
* Language
* Validation
* Uploads
* Teacher selection
* Summary
* CTA
* Error handling
* Success state

Reduce friction.  
Remove unnecessary decisions.  
Never hide important information.

Preserve Guided Request / Learning Preferences behavior already shipped; polish conversion, do not invent a second request domain.

---

# PART 6 — Payment

Audit:

* Price visibility
* Fee explanation
* Protected payment
* Revision policy
* Refund explanation
* Timeline
* Mock payment
* Success
* Failure
* Return flow
* Loading
* Accessibility
* Student confidence

Do NOT change payment providers, pricing math, webhook contracts, or financial snapshots. Improve confidence and clarity around the existing Mock/canonical payment flow only.

---

# PART 7 — Timeline

Review:

* Payment
* Started
* In Progress
* Revision
* Delivered
* Completed
* Rating
* Files
* Messages
* Actions
* Status chips
* Timeline readability

No duplicated actions.  
No dead buttons.

Use only persisted Order evidence. Do not invent timeline states.

---

# PART 8 — Reviews

Audit:

* Review cards
* Rating summary
* Verified order
* Teacher responses
* Empty state
* Spacing
* Typography
* Sorting

Do NOT fabricate review data.  
Empty states must remain honest and premium.

---

# PART 9 — Search & Filters

Review:

* Subject
* Price
* Language
* Category
* Qualification
* Availability
* Sort
* Reset
* URL state
* Mobile filter drawer
* Performance
* Accessibility

Filters may only expose supported, truthful criteria already backed by product/data rules.

---

# PART 10 — Mobile Experience

Review every page at:

* 375
* 390
* 768
* 1024
* 1280
* 1440

With:

* Arabic RTL
* English LTR
* Dark
* Light

Look for:

* Reachability
* Thumb zones
* Overflow
* Spacing
* Touch targets
* Sticky elements
* Bottom CTA
* Keyboard
* Safe areas

---

# PART 11 — Accessibility

Audit:

* Focus
* ARIA
* Contrast
* Keyboard
* Screen readers
* Dialogs
* Video
* Forms
* Tables
* Errors
* Skip links
* Reduced motion

---

# PART 12 — Performance

Review:

* Layout shifts
* Image loading
* Video loading
* Repeated renders
* Duplicate DOM
* Unused components
* Hidden legacy UI
* Repeated listeners
* Console
* Memory

Delete hidden legacy UI when found. Do not leave dual DOM trees “just in case.”

---

# PART 13 — Conversion Optimization

Review the entire experience as if users have **30 seconds** to decide.

Ask:

1. Can the Student trust this teacher?
2. Can the Student understand the service?
3. Can the Student compare teachers?
4. Can the Student confidently pay?
5. Can the Student understand the next step?
6. Can the Student complete the purchase without confusion?

Identify every friction point.

## Product Recommendations bar (mandatory)

In **Product Recommendations**, do NOT stop at UI polish.

For every Student screen, evaluate as a real competing product against **Preply, Italki, and Fiverr**:

* What must the Student understand immediately?
* What must the Student trust immediately?
* What is the single primary CTA?
* What secondary decisions can be deferred?
* What unsupported claim or visual noise should be removed?
* What real evidence (qualification, samples, reviews, price, delivery terms) should be elevated?
* Where does the funnel leak — Browse → Profile → Request → Payment → Timeline?

Recommendations must increase **Conversion** and **Student confidence** while:

* obeying all current Business Rules
* inventing zero unsupported metrics, rankings, popularity claims, or testimonials
* preserving Releases 1–2 catalog / teacher-offering contracts
* preferring hierarchy, copy, spacing, media, and friction reduction over new APIs

---

# PART 14 — Browser Certification

Validate:

* 375 / 390 / 768 / 1024 / 1280 / 1440
* Arabic / English
* RTL / LTR
* Dark / Light
* Keyboard / Touch
* Console
* Responsive
* Overflow

Hard fails:

* Dead buttons
* Duplicated actions
* Hidden content
* Console errors

Capture evidence for meaningful before/after states when UX changes ship.

---

# PART 15 — Testing

Run focused tests only:

* Marketplace
* Teacher Profile
* Browse
* Request
* Payment
* Timeline
* Reviews
* Localization
* Frontend Integrity
* Regression relevant to touched surfaces

Do NOT rerun unrelated suites.

---

# IMPLEMENTATION RULES

1. Audit first with evidence; then implement highest-conversion fixes that stay inside scope.
2. Prefer existing pages, CSS, JS, and contracts over new surfaces.
3. No schema / migration unless a proven consumer bug cannot be fixed otherwise — default is none.
4. No new APIs unless absolutely required; prefer presentation, hierarchy, and copy.
5. Preserve bilingual EN/AR and RTL/LTR correctness on every changed surface.
6. Preserve Design System / existing Tafseel visual language; elevate conversion, do not invent a new brand.
7. Keep Mock payment honest as Mock where product honesty requires it; do not pretend Production PSP exists.
8. Report remaining content sparsity honestly (e.g. thin Development fixtures) as limitations, not as UI failures to fake around.

---

# DELIVERABLE

Provide ONLY:

* Findings
* UX Score (per page)
* Root Cause
* Product Recommendations
* Implemented Changes
* Browser Validation
* Tests
* Files Changed
* Risks
* Remaining Limitations
* Next Step
* Final Verdict

Write the working report to:

`docs/fixes/PHASE_3_RELEASE_3_CONSUMER_MARKETPLACE_EXPERIENCE.md`

Update living status docs only as needed (`docs/PROJECT_STATUS.md`, `docs/INDEX.md`).

At the end write exactly:

**✅ Finished Phase 3 — Release 3 (3/4)**

---

# OUT OF SCOPE

* Release 4 analytics / enforcement completion
* Real PSP / meeting provider cutover
* Teacher Dashboard redesign (except unavoidable consumer-contract presentation fixes)
* Admin catalog redesign
* Changing qualification gates, pricing policy, or payment ledger behavior
* Fabricating marketplace density for screenshots
