# Release 5 Order Communication Retrospective

## What was implemented?

Direct Order conversation actions, correct generic-inbox selection, commercial context, canonical attachment surfaces, persisted lifecycle projection, unread/read badges, privacy-safe contextual notifications, deep-link opening, realtime de-duplication, and bounded older-message loading.

## What existing architecture was reused?

`ConversationScope.Order`, participants, messages, attachments, read timestamps, SignalR hub, notifications/outbox, private file service, Order timeline, request attachments, and delivery authorization.

## Was schema changed?

No. The canonical `Scope + ResourceId` relationship already expresses the invariant.

## What was intentionally not implemented?

No second chat aggregate, edit/delete, reactions, typing, Markdown, copied request/delivery files, fake system messages, F-005 linkage, distributed SignalR, or malware-scanning pretense.

## What business ambiguity remains?

Whether completed/cancelled/refunded/disputed Order conversations stay writable is undefined. Release 5 preserves current capability. Final Acceptance recorded that current API/UI/domain behavior is **consistently writable** after Completed and unpaid Cancelled; Product Decision Required before any restriction.

## What Production risk remains?

Malware scanning and SignalR scale-out remain absent. Authenticated two-context SignalR, mobile composer geometry, and targeted Order lookup are now evidenced. Remaining Production/test risk is Development auth rate-limit noise under dense Playwright, not missing messaging architecture.

## What should Release 6 inherit?

Release 6 — Discovery & Conversion (Browse premium UX, search/filter, comparison, zero-result recovery, Teacher Profile conversion). Do not reopen messaging. Closed-Order write policy remains a Product Decision. Playwright should pace below the unweakened 10/min auth limiter.

## What technical debt was discovered?

The prior inbox loaded full histories; fixed. The 1,000-row `findPaged` scan was replaced with targeted owned Order/request GETs. Redirect `{{` warnings were reclassified: no first-party unresolved-template network requests in the acceptance matrix (`templateRequests: []`); 429 console lines are limiter noise.

## Outcome

Architecture and focused behavior from the first pass remain. Final Acceptance added targeted lookup, full Integration 222/222, live two-context SignalR, and mobile composer proof. Verdict after Final Acceptance: **conditionally verified** (historical Partial preserved).

Final Browser Certification Closure (later pass) closed the two Conditional reasons: Playwright auth/global 429 was harness login/refresh/dashboard churn (limits unchanged); Completed remount was boot/`select` lifecycle plus test wait races. Session reuse + widget lifecycle + 20-cycle remount + 16/16 functional (disclosed locale-cell retry). Later verdict: **verified** (claimed), with two remaining disclosures: published Student 401 and remount `connectCount=0`.

Micro Final Acceptance Gate (later pass) closed those disclosures: published Student 401 was UAT lockout/churn (Teacher 200 same host; clean login 200 after Identity reset+unlock); remount realtime restored via shared HubConnection singleton, proven `HubConnection.state` Connected, 12/12 + 20/20 renderCount=1. Dense remount still records global 300/min 429 safety FAILs. That-pass verdict: **conditionally verified**.

Rate-Limit-Aware Final Certification (later pass) classified the remaining 429s as **Test Issue**: one remount is 42–46 first-party requests; the Micro 17+2 429s were synthetic density on the shared IP global bucket (`UseRateLimiter` before auth). Harness rolling-window scheduler; limits unchanged; accepted run 0 unexpected 429; remount 20/20. This-pass verdict: **verified**. Release 5 is closed. Release 6 — Discovery & Conversion is unblocked. Do not invent Release 5 Sprint 2.


