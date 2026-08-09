# Unified Intelligent Discovery Search

Date: 2026-08-09  
Status: implemented locally (not a numbered Release rewrite; not committed)

Landing hero and Browse Teachers now share one search field. AI Discovery remains a server-side interpretation layer behind the existing Release 9 `IAiProvider` / Groq path. The LLM never receives Teachers and never ranks results. Deterministic Tafseel marketplace search is authoritative.

## Old UX vs new UX

**Old:** Browse exposed normal search plus a separate purple AI Discovery panel (textarea + “Understand and apply”) plus a distinct clarification workflow. Landing search was a separate entry path.

**New:** One `role="search"` field on Landing hero and Browse. Placeholder concept: *ابحث باسم مدرس أو اكتب ما تحتاجه...* / *Search by teacher name or describe what you need...*. There is no AI mode switch, checkbox, or engine picker. Interpreted Subject / Service / Thursday appear as ordinary removable chips (`[الرياضيات ×] [جلسة مباشرة ×] [الخميس ×]`), not “AI decisions”. Product Help stays a Student-only sidebar details control and is not a second search box. The standalone AI panel DOM is gone.

## Search orchestration

Authenticated Student + intent-like text → `POST /api/v1/ai/discovery` (existing R9 endpoint, Student auth + AI 10/min limiter unchanged) → application validation → canonical Subject / Service / optional language, level, max price, `AvailableOn` → `GET /api/v1/teachers` with those filters.

Guest, non-intent keyword, teacher-looking names (`Hisham`), or any AI failure → ordinary marketplace search and/or the shared local alias resolver (`Tafseel.discovery` / `DiscoveryCatalogResolver`). Local interpretation never calls Groq.

AI does not select Teachers. Flow: Student text → intent interpretation → canonical entities → deterministic eligibility query → Eligible Teachers.

## Landing handoff

Landing stores consume-once intent in `sessionStorage` key `tafseel.discovery.intent.v1` (15-minute TTL). Browse reads and deletes it, then runs the same orchestration. Raw natural-language text is not placed in the URL. After a successful interpretation the URL holds canonical filter state (`subjectId`, `service`, `availableOn`, `viewerTimeZoneId`). Refresh does not replay a consumed or stale prompt. Back/Forward restores canonical query params via existing `popstate` handling.

## Subject resolution

Aliases such as رياضيات / math / mathematics / calculus / integrals / التكامل resolve only to an existing catalog Subject whose names match Mathematics (or an already-named Calculus subject via its own name). No Subjects are created. Topic/context (`في التكامل`) helps identify Mathematics; it is not a Teacher exclusion taxonomy.

## Service resolution

`live` / `live session` / `جلسة مباشرة` / `جلسة اونلاين` map to the existing Service Catalog item with code `live_session` when that public Teacher-selectable item exists. No second Service domain.

## Availability / exact-service filter

The model may propose a weekday or calendar date only. The app resolves the next relevant local date in the viewer time zone via `DiscoveryCalendar` and existing Tafseel timezone utilities.

**Thursday semantics:** `الخميس` / `Thursday` → the next relevant Thursday in the viewer zone, including today when today is Thursday. Already-past slots on that local date are excluded by the canonical scheduler (`now` vs bookable slot start). The LLM never invents UTC timestamps.

`GET /api/v1/teachers?availableOn=yyyy-MM-dd&viewerTimeZoneId=...` is first-class. Marketplace search batches exact-service availability through `ILiveSessionService.FindTeachersWithExactServiceAvailabilityAsync` after other eligibility filters and before pagination. A match requires an active eligible `TeacherService` for the **same** Subject + Live Session catalog item and a bookable slot for that service on the resolved local date. Async Math plus unrelated Physics live availability is not a match. No N+1 per Teacher and no browser-side filter of large result sets. Pagination `totalCount` is the post-availability count.

Missing `viewerTimeZoneId` with `availableOn` is rejected. `AvailableThisWeek` / online-now remain unavailable (not faked).

## Clarification policy

Clarify only when an important requested constraint cannot be safely interpreted. Missing budget, exact clock time, or price is not a reason to ask. Primary example clarification count is 0. Acceptable: “محتاج مدرس الخميس” → subject (and service mode if still unknown). Max two questions / rounds.

## AI fallback

Disabled AI, missing key, 401/403/429/400/5xx, timeout, connection failure, invalid output, or cancellation → Browse continues with ordinary search. Non-blocking copy: *استخدمنا البحث العادي لأن المساعدة الذكية غير متاحة الآن.*

## Groq diagnostics

Provider HTTP 200 with empty/unusable content is `invalid_output`, not success. Status categories logged: `disabled`, `credential_missing`, `provider_401/403/429/400`, `timeout`, `connection_failure`, `invalid_output`, `cancellation`, `provider_5xx`. Logs may include feature, provider, model, status category, latency, token counts. Logs must not include raw Student input, raw model output, `GROQ_API_KEY`, or Authorization tokens. The browser never calls `api.groq.com`.

## Security / privacy

R7 `queryPresent`-style MarketplaceInteractionEvents are unchanged. No raw AI/search text in analytics. No AI ranking metrics. No prompt/output persistence. `GROQ_API_KEY` remains server-only.

## Resource cleanup

Staging `/app/js/boot-prefs.js` 404 and literal `/app/{{ t.avatar }}` / `/app/{{ accountAvatar }}` 404s are classified as stale deploy / pre-`sc-camel-src` HTML. Current Landing and Browse bind avatars with `sc-camel-src`. `Program.cs` allowlists `boot-prefs.js`. No literal template placeholders should generate network requests on current source.

## Tests

- Application: `DiscoveryCatalogTests` (aliases, topic context, Thursday calendar)
- Integration: Release 9 discovery (primary Arabic, EN, mixed, calculus, clarification, fallback) + `UnifiedDiscoveryAvailabilityTests` (exact service Thursday include/exclude, name keyword, truthful zero, pagination)
- Groq contract: empty HTTP 200 → invalid output; 400 classified separately
- Frontend gates: `check-unified-discovery-search.mjs` via `check-js.mjs`
- Browser helper cert: `tests/browser/unified-discovery-search-cert.mjs`
- Release 9 browser cert updated to `#f-q` unified search

## Real Groq status

Unchanged: Release 9 remains **CONDITIONALLY VERIFIED** until a real-provider eval with `GROQ_API_KEY` completes. This work reuses the same Groq path; it does not close R9.
