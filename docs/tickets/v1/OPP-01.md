# OPP-01 — Shared interface craft and public navigation

Status: Done (2026-10-04). Scope: presentation and existing journey entry points.
There are no new or changed business rules, endpoints, request shapes or permission grants.

## Business states
Existing request, order, booking, message and setup states. The new `empty`, `success`, `error`,
`waiting` and `updating` values describe presentation only. Success text is set after a real operation
succeeds; it is cleared for the next operation and when entering another resource.

## Preconditions
Existing V1 permissions and providers; current Arabic/English dictionaries and design tokens.
Native avatar transitions additionally require browser support, pointer input and permitted motion.

## Happy path
1. The page loads a skeleton that follows its eventual layout.
2. Selection stays visible and updates the related summary.
3. A real submission shows pending feedback on its own control.
4. A successful action shows an inline confirmation with server-grounded wording.
5. The person continues through the current next action, status and date.

## Negative cases
Existing refusal, expiry, wrong participant/role, stale version, offline and upload failure handling
is preserved. Unknown upload progress stays indeterminate. Partial attachment success is still
explained. Reduced motion and keyboard input suppress the new movement. Unsupported or slow
native view transitions fall back to navigation; no transition blocks the journey indefinitely.

## Authorization
Presentation adds no capabilities or data. Existing participants and roles keep their current
permissions. Attachment viewing remains on authorized content endpoints. Local preview object
URLs are owned by the picker and revoked when files are removed or the component is destroyed.

## UX
- Entry points: public browse/profile, auth, booking, work lists, order/session detail, messages,
  teacher profile/services/availability, homes and earnings loading.
- Hierarchy: current identity and heading → status/date summary → next action → details/history.
- Primary CTA: the existing action allowed by the current business state.
- Wording: Arabic and English; sent time requests explicitly await the teacher, and message sending
  uses “Sending…” / “جارٍ الإرسال…” rather than “Saving…”.
- Mobile: 390px, logical geometry and wrapping; desktop remains supported.
- States: contextual first-use, filtered and caught-up empties; compact/full confirmations; shaped
  skeletons; existing retry actions; waiting confirmation for an unaccepted time request.
- Confirmation dialogs retain their existing consequence copy and native focus behavior.
- Gate question: yes; the refinements communicate what the person can do and what just happened.

## API contracts
| UI action | Endpoint / payload / headers | Result |
|---|---|---|
| All existing actions | Current gateways and ports; no contract changes | Existing domain transitions |
| Delivery progress | Existing multipart upload progress events | Actual transferred percentage when known |
| Attachment preview | Browser-owned local object URL | No server request or storage key |

Error codes: current localized server error vocabulary; no new domain error codes.

## Analytics / observability
None. No business state is inferred from analytics or animation.

## Acceptance criteria
- [x] All 17 opportunities have a concrete implementation or an intentional extension of an existing pattern.
- [x] Initial message/history rendering stays still; only new records enter.
- [x] Actual success, waiting and error states remain distinguishable.
- [x] Unknown transfer percentage is never presented as zero or fabricated progress.
- [x] Keyboard/reduced-motion handling and native dialog focus are covered.
- [x] Arabic phone, both themes and English desktop pass the focused published-build craft journey.
- [x] Extended time-dependent settlement/no-show tails finish on the real server clock.

## Implementation map
| # | Opportunity | Implementation |
|---|---|---|
| 1 | Success moments | Shared inline confirmation after order/session actions and teacher setup saves; booking requests have a waiting confirmation; existing payment/provider seal remains authoritative. |
| 2 | Shaped skeletons | Shared profile, teachers, work, slots, detail and balances variants in the major V1 entry screens. |
| 3 | State continuity | Form/state entrances, selected booking summary replacement, and only newly recorded timeline events. |
| 4 | Motion recipes | Semantic feedback, replacement and overlay roles; CSS lifecycle classes; input modality plus reduced-motion policy. |
| 5 | Composed states | `tf-ui-state` compact/full forms, projected real actions and semantic state/variant combinations. |
| 6 | Action lifecycle | Shared ready/busy/success feedback, a reserved icon lane, and precise pending copy. |
| 7 | Contextual empties | First-use work/messages, filtered teacher search/work, caught-up action list, and unavailable booking slots. |
| 8 | Journey summary | Current order/session status and real creation/session date above the existing next-action section. |
| 9 | Slot selection | Press feedback, selected check, keyed summary entrance and polite selection announcement. |
| 10 | Overlay lifecycle | Account/notification entrances and exits, inert exiting content, native dialog exit and focus restoration. |
| 11 | Sliding selection | One marker follows existing aria selection in auth and work controls; handles RTL, scrolling and resize. |
| 12 | Chat feedback | New messages enter once; historical refresh stays still; the composer has sending feedback. |
| 13 | Attachment treatment | Local image preview, one outline file-kind family, extension/size rhythm, and actual delivery progress. |
| 14 | Dark depth | Overlay edge/shadow roles with a subtle dark inner edge and existing semantic surfaces. |
| 15 | Type/spacing rhythm | Existing type roles for states/summaries, Arabic leading, related/field/section spacing roles. |
| 16 | Icon treatment | Action/status/meta roles, status containers, quiet metadata and file-kind outlines. |
| 17 | Shared element | Pointer-only browse-avatar → profile-avatar native transition; immediate keyboard/reduced-motion fallback. |

## Tests
| Level | Test | Proves |
|---|---|---|
| Component | file-picker preview ownership | Stable previews and object URL cleanup |
| Component | dialog lifecycle | Pointer exit, immediate cancel, result and focus restoration |
| Component | messages arrival regression | Initial history stays still across live arrivals and poll refresh |
| Component | live session operation feedback | No success before a response, pending completion wording, and refusal recovery |
| Existing component suite | `npm test -- --watch=false` | Current forms, statuses and role-specific actions |
| Existing integration/authorization | `dotnet test Tafseel.sln -c Release` | Existing domain and authorization surfaces |
| Contract | `check-api-contract.mjs --strict` | No contract violations |
| Browser | `opportunities-craft.e2e.mjs` | RTL marker geometry, themes, reduced motion, empty states, preview cleanup and English layout |
| Browser | supply/direct-order/live-session/messaging/Arabic-phone journeys | Current business flows and Arabic at 390px |
| Service | locale loading and selection | Atomic language/copy updates, retry after a failed load, and latest selection wins |
| Service | public navigation preloading | Public routes only; server rendering and data-saving connections stay excluded |
| Browser | `navigation-polish.e2e.mjs` | Full-width language-edge logo, Arabic prerender without JavaScript, direct explanation entry, navigation without document reload and avatar transition independent of profile data |

## Public navigation follow-up
The owner requested a full-width navbar with the logo at the right edge in Arabic and the left
edge in English, faster page changes, consistent About/header language, and direct explanation
entry from “Post a request”. These changes stay within the current journeys:

- Public links sit beside the brand; account actions occupy the opposite edge. The active page
  uses an underline instead of a centered segmented track. The row has no maximum-width cap.
- Public lazy routes warm through Angular's native preloading strategy. Normal navigation stays
  in the same document. The optional avatar transition waits for the new view, not the profile API;
  its loading layout can show the already-known public avatar.
- Server prerender receives the selected dictionary before rendering. Client language, direction
  and copy switch together after a dictionary is ready; failed loads can be retried. About's title
  follows the same language selection.
- “Post a request” opens `/requests/new/open` directly. Legacy generic `/requests/new` links forward
  to that form, preserving query parameters. Requests carrying `teacherId` retain the existing
  teacher-specific journey. The extra teacher/open choice is removed from the explanation form.
- Legacy generic skeleton sizing now targets only the intended direct children, preserving the
  shared profile skeleton's text rhythm.

### Navigation craft refinement
The owner subsequently requested a more distinctive treatment for the three public links.
Their layout and destinations stay fixed. The selected destination uses a soft cut-corner label
and a small diamond derived from the brand mark, violet in light and lime in dark. The corner
and marker follow RTL/LTR. Pointer hover reveals a quiet surface; press affects that surface
without moving the label or changing link width. Keyboard focus has its own visible outline;
keyboard and reduced-motion input remove transitions. The phone menu now identifies the current
page through Angular's existing `RouterLinkActive` semantics, with the same tonal surface and marker.

Validation: the published navigation journey also checks visible keyboard focus, English layout
without overlap at 900px and 1024px, and the Arabic phone menu's current page. The final gallery
adds five close-up/state screenshots for this refinement.

## Out of scope
New business capabilities, backend/domain/financial changes, provider changes, new dependencies,
ranking, numerical tweening, repeated scroll cascades, and global page crossfades. Landing scroll
motion, request success and provider-confirmed payment moments already have dedicated patterns.

## Dependencies
Current V1 flows, existing design tokens and the browser's optional native View Transition API.

## Evidence
Implementation and focused validation completed on 2026-10-04:

- Angular: **632 / 632 tests**, 78 test files. Loading/style/i18n/skip-link guards pass.
- .NET: **941 passed** (154 domain, 14 application, 1 architecture, 772 integration; zero reported skips).
  The initial default LocalDB could not start. Integration tests passed using the already-running local
  SQL Server through `TAFSEEL_SQLSERVER_TEST_CONNECTION`, with disposable test databases.
- `dotnet build Tafseel.sln -c Release`: passed. The final local API publish also builds the current frontend.
- `dotnet format Tafseel.sln --verify-no-changes`: exit 0.
- API contract: **301 client shapes, 301 matches, zero violations**.
- Dependency audit: **zero reported vulnerabilities**. `git diff --check`: no whitespace errors.
- Published-build journeys on fresh disposable databases include complete passes for:
  `wave3a-teacher-supply` (including persistent inline save notices), `wave3b-direct-order`,
  `wave3b-messaging`, the final `opportunities-craft` pass, `wave3b-live-session`,
  `ux06-arabic-phone`, `ux05-canonical-paths`, `wave3b-open-marketplace`, and the final
  `navigation-polish` pass. Canonical, direct-order and open-marketplace journeys passed again
  after the direct explanation-entry change.
- Visual checks: Arabic 390px in both themes; English desktop; RTL marker geometry; keyboard and
  reduced-motion paths; local image preview removal; successful order review/confirmation screenshots.
- The full chronological `wave3b-live-session` and `ux06-arabic-phone` journeys completed in 4,173s
  and 3,263s respectively, including their real-clock completion/no-show tails. No server clock or
  business rows were changed to shorten these waits.
- Final navigation proof: **7 / 7 steps passed**, including Arabic before JavaScript, both themes,
  English, 390px Arabic and 2547px header geometry. Local warmed route shells appeared in
  **78–157ms** (median **88ms**); the avatar transition updated in **44ms** while the profile API
  was deliberately held. These are local UI measurements, not production-network timings.
- Screenshot gallery: `TestResults/opportunities-gallery/index.html`, **34 original screenshots**,
  two additional navbar strips, and one actual browser recording. All 17 opportunities and the
  new navigation/language/request-entry refinements are mapped to evidence in the gallery.
- The successful build reports an initial-bundle warning: **728.71 kB / 720 kB**. Component-only state
  and skeleton styles load with their components; the budget was not raised by this ticket.

Authoritative local evidence (ignored build/test artifacts):

- `TestResults/opportunities-frontend-tests.log`
- `TestResults/opportunities-dotnet-tests.log`
- `TestResults/opportunities-format.exit`
- `TestResults/opportunities-final-publish.log`
- `TestResults/opportunities-supply-orders-summary.log`
- `TestResults/opportunities-messaging-summary.log`
- `TestResults/opportunities-final-craft-summary.log`
- `TestResults/opportunities-final-craft/opportunities-craft/craft-light-ar-phone.png`
- `TestResults/opportunities-final-craft/opportunities-craft/craft-dark-ar-phone.png`
- `TestResults/navigation-edge-frontend-tests.log`
- `TestResults/navbar-dotnet-tests.log`
- `TestResults/navbar-format.exit`
- `TestResults/navigation-edge-publish.log`
- `TestResults/navigation-approved-journeys-summary.log`
- `TestResults/navigation-edge-proof-summary.log`
- `TestResults/navigation-label-frontend-tests.log`
- `TestResults/navigation-label-publish.log`
- `TestResults/navigation-label-proof-summary.log`
- `TestResults/navigation-label-confirmation-summary.log`
- `TestResults/navigation-approved-proof/navigation-polish/navigation-measurements.json`
- `TestResults/opportunities-gallery/index.html`
- Extended runs: `TestResults/opportunities-visual-summary.log` (read the **ux06** result; its first
  craft attempt was superseded by the successful final craft run) and
  `TestResults/opportunities-sessions-messages-summary.log`.

No commit or push requested. Existing uncommitted work was preserved.
