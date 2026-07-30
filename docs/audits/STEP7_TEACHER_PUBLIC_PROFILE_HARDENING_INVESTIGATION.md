# STEP 7 / 8 — Teacher Reputation & Public Profile Hardening Investigation

Date: 2026-07-30  
Status: Investigation complete — evidence only; no runtime changes in this pass.  
Scope: Truthfulness, durability, explainability, privacy, and evidence backing of every public Teacher surface.  
Governing prior decisions: [ADR-001](../decisions/ADR-001-VERIFIED-TEACHER-DERIVATION.md), [F-002](../fixes/F002_TEACHER_METRICS_INTEGRITY_REPORT.md), [ADR-007](../decisions/ADR-007-TEACHER-PORTFOLIO-MODERATION.md), [ADR-010](../decisions/ADR-010-TEACHER-REPUTATION-AND-BADGES.md), [ADR-011](../decisions/ADR-011-TEACHER-SHOWCASE-PRODUCTION-MEDIA.md).

## Findings

Public Teacher reputation is largely evidence-backed after F-002 and ADR-010: unsupported performance metrics are nulled, verification and trust badges derive from active qualifications, ratings aggregate from moderated reviews, and Showcase/qualification samples use fail-closed publication gates. Remaining gaps are **consistency and privacy hardening**, not missing inventable performance formulas.

### Surface inventory

| Surface | Primary API | Eligibility vs Browse baseline |
|---|---|---|
| Browse Teachers | `GET /api/v1/teachers` → `SearchAsync` | Baseline: published + email confirmed + !suspended + ≥1 active approved qual + ≥1 eligible active service |
| Teacher Profile | `GET /api/v1/teachers/{id}` → `GetPublicProfileAsync` | Same hard gates (404 `teacher_not_found`) |
| Teacher Comparison | `GET /api/v1/teachers/compare` → `CompareAsync` | Same Browse-like eligibility; unavailable counted separately |
| Favorites / Student Dashboard | `GetFavoritesAsync` | **Weaker:** only `profile.IsPublished` required |
| Reviews list | `GET /api/v1/teachers/{id}/reviews` → `GetTeacherReviewsAsync` | **Ungated:** visible reviews for any teacherId |
| Sample media | `GET /api/v1/teachers/samples/{id}/content` | `IsPublicSampleAsync` fail-closed |
| Availability summaries / slots | LiveSessions APIs | Separate from reputation; not a badge |
| Booking / Learning Request | Consume public profile + services | Inherit profile gates when profile loads |

Browse baseline cite (`MarketplaceService.SearchAsync`):

```54:64:src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs
            where profile.IsPublished && user.EmailConfirmed && !user.IsSuspended
                && db.TeacherSubjectQualifications.Any(q => q.TeacherId == profile.TeacherId
                    && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
                && db.TeacherServices.Any(service => service.TeacherId == profile.TeacherId
                    && service.IsActive
                    && db.TeacherSubjectQualifications.Any(q => q.TeacherId == profile.TeacherId
                        && q.SubjectId == service.SubjectId
                        && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
                    && db.Subjects.Any(subject => subject.Id == service.SubjectId && subject.IsActive)
                    && db.ServiceCatalogItems.Any(type => type.Id == service.ServiceCatalogItemId
                        && type.IsActive && type.IsPublic && type.TeacherSelectable))
```

Favorites weaker gate:

```970:970:src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs
            where favorite.StudentId == studentId && profile.IsPublished
```

---

## Field matrix

Legend — Source: Persisted / Computed / Projected / Derived / Self-entered / Quality-approved / System-generated.  
Trust: High (platform evidence) · Medium (gated display) · Low (Teacher-writable) · Null (deliberately withheld) · Unsafe if claimed as measured performance.

| Field | Source | Trust | Owner | Evidence path | Integrity notes |
|---|---|---|---|---|---|
| Full name / English name | Persisted `ApplicationUser` | Medium | Account | Card/Profile/Compare join `Users` | No email on public DTOs |
| HasAvatar | Derived boolean from `AvatarStorageKey` | Medium | Account | Cards/profile/compare | Storage key never public |
| Headline | Persisted `TeacherProfile.Headline` | Low | Teacher `UpdateProfileAsync` | All public DTOs | Self-copy; searchable |
| Bio | Persisted `TeacherProfile.Bio` | Low | Teacher | Profile + Comparison (not card body) | Self-copy |
| Country | Persisted | Low | Teacher | Card + Profile | Self-declared |
| City | Persisted | Low | Teacher | `BuildProfileAsync` always | Public fine location — overshare candidate |
| TimeZoneId | Persisted | Low | Teacher | `BuildProfileAsync` always | Public on profile DTO — overshare candidate |
| Verified | Derived from active approved non-revoked quals (+ active subject on cards) | High | Quality | Search/Favorites/Compare/BuildProfile | ADR-001; not a writable flag |
| TrustBadges | Projected on-read `qualified_on_tafseel` when eligible | High | System | `TrustBadges(bool)` | ADR-010; not writable; no Top-rated invent in JS |
| Rating | Persisted aggregate `AverageRating` if `RatingCount > 0` else null | High | System via visible reviews | All public DTOs | Refreshed on create/moderate |
| RatingCount | Persisted from visible reviews | High | System | Same | |
| CompletedOrders | Column exists; **DTO always null** | Null / Unsafe if shown | No production writer | Card/Profile ctor `null` | F-002 sound |
| ResponseTimeMinutes | Persisted self-reported; public **null** | Null / Unsafe if shown | Teacher | `publicOnly ? null : profile.ResponseTimeMinutes` | F-002 sound |
| StartingPrice / Currency | Computed min active eligible service price | Medium | Teacher services | Search/Favorites/Compare/Profile services | Explainable display metadata |
| Subjects / VerifiedSubjectIds | Quality-approved quals → active Subjects | High | Quality | Profile/Compare/Cards | Revocation removes from projection |
| Topics | Teacher `TeacherTopics` | Low–Medium | Teacher | Profile: **no** active/qual refilter; Compare: active + qual | **Stale risk on Profile** |
| Languages | Teacher `TeacherLanguages` | Low | Teacher | Cards/Profile: no `language.IsActive`; Compare filters | **Inconsistent** |
| EducationLevels | Teacher links | Low | Teacher | Profile: no `IsActive`; Compare filters | **Inconsistent** |
| Services / prices | Teacher + catalog gates | Medium | Teacher + catalog | Public: active + qual + public selectable | Hidden/inactive omitted publicly |
| CanRequest / CanBook | Derived in service map | Medium | System | Profile services | Explainable |
| LiveSessionBookingPolicy | Config `LiveSessionOptions` | Medium | Platform | Profile | Not reputation |
| Qualification samples | System-generated on qual approve | High | System/Quality | Public samples filter + media exists | Trust code `qualification_sample` |
| Teacher Showcases | Teacher upload + Quality approve | High (after approve) | Teacher + Quality | Approved + not archived + media exists | Drafts/notes never public |
| SampleCount (compare) | Count `PublishedAt != null` + qual + active subject | Medium | — | `CompareAsync` sample group | **Weaker than Profile/`IsPublicSampleAsync`** (no Approved/media check) |
| Availability rules (profile) | Domain tables | — | Teacher | Public returns **empty** arrays | Privacy-safe on DTO |
| Availability summary (UI) | Live session summaries | Medium | Scheduling | Separate APIs | Not a trust badge |
| Certifications / Experience | Teacher CRUD tables | Low | Teacher | Public profile + compare experience | Self-declared; not “verified experience” |
| ExperienceYears | Application draft only | — | Application | **Not on marketplace public DTOs** | N/A |
| IsProfileComplete | Derived | Internal | System | On public `TeacherProfileDto` | **Owner/internal field on public** |
| IsEligibleForPublication / PublicationBlockingReasons | Derived | Internal | System | Same | **Internal state leak** |
| IsPubliclyVisible | Derived `IsPublished && eligible` | Medium | System | Same | Redundant with 404 gates |
| IsPublished | Persisted | Medium | Teacher | Browse/profile gates | |
| Suspension | `user.IsSuspended` | High | Admin | Browse/Profile/Compare fail closed; Favorites weaker | |
| Qualification revocation | Qual status + sample hide + service deactivate | High | Quality | `RevokeQualificationAsync` | Public samples/services disappear; history retained privately |
| Portfolio media URL | Id-based content route | High gated | System | `OpenSampleAsync` | No storage key in URL |
| Favorites | `FavoriteTeacher` preference | Low | Student | Not a quality signal | Can list teachers Browse would hide |
| Comparison fields | Subset of profile + SampleCount | Mixed | — | `TeacherComparisonDto` | No CompletedOrders/ResponseTime properties |

Trust badge projection:

```1163:1172:src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs
    private static IReadOnlyCollection<TeacherTrustBadgeDto> TrustBadges(bool qualifiedOnTafseel) =>
        qualifiedOnTafseel
            ?
            [
                new TeacherTrustBadgeDto(
                    TeacherTrustBadgeCodes.QualifiedOnTafseel,
                    TeacherTrustBadgeCodes.CategoryVerification,
                    TeacherTrustBadgeCodes.RuleVersionV1)
            ]
            : [];
```

F-002 public nulling:

```162:166:src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs
        var rows = pageRows.Select(x => new TeacherCardDto(
            x.TeacherId, x.FullName, x.Headline, x.Country, x.Verified,
            x.Rating, x.RatingCount, null, null, x.StartingPrice, x.Currency,
            x.Subjects, x.Languages, x.FullNameEnglish, x.HasAvatar,
            TrustBadges(x.Verified))).ToArray();
```

---

## Profile integrity

| Scenario | Behavior | Sound? |
|---|---|---|
| Stale after catalog deactivation | Profile topics/languages/levels can still list inactive catalog rows | Gap |
| Forge verification / badges | No write API; derived on read | Sound |
| After qualification revocation | Services deactivated; showcases/samples hidden; Browse/Profile 404 if no remaining eligible service/qual | Sound for marketplace; Favorites may still show if `IsPublished` |
| After suspension | Browse/Profile/Compare exclude; Favorites may still return published suspended teacher | Gap |
| After service deletion/deactivation | Public services omit; may leave Browse if no eligible service | Sound for Browse/Profile |
| After profile unpublish | Browse/Profile/Compare/Favorites require published (Favorites only published) | Mostly sound |
| After showcase archive | Public samples omit; content 404 via `IsPublicSampleAsync` | Sound |
| After moderation rejection | Rejected versions never public; prior approved remains until superseded/archived | Sound (ADR-007) |
| Owner vs public DTO | Same `TeacherProfileDto` shape; `publicOnly` nulls response time and empties availability, but still ships City/TZ/blockers/completeness | Gap |

---

## Review integrity

| Rule | Evidence | Status |
|---|---|---|
| Self-review | `TeacherReview` ctor: `studentId == teacherId` → `self_review_forbidden` | Sound |
| Duplicate per order | `AnyAsync(OrderId)` → `duplicate_review` | Sound |
| Create eligibility | `OrderStatus.Completed` **and** `PaymentStatus.Paid` | Sound |
| Cancelled / unpaid | Cannot create | Sound |
| Visibility | List filters `IsVisible`; moderation can hide + `RefreshRatingAsync` | Sound |
| Rating recalc | Averages only visible reviews (`GovernanceService.RefreshRatingAsync`) | Sound |
| Disputed before complete | Dispute path blocks completion eligibility for open disputes; review requires Completed+Paid | Sound at create |
| Post-review refund | No code removes or hides reviews after later refund | Gap / Business Rule Required (not invented here) |
| Public list vs profile 404 | `GetTeacherReviewsAsync` has **no** publication/eligibility check; `[AllowAnonymous]` | Gap |
| Student identity | `ReviewDto` has no `StudentId` | Privacy-safe |
| OrderId on public DTO | `ReviewDto.OrderId` exposed | Soft privacy link |

Create path:

```43:52:src/Tafseel.Infrastructure/Governance/GovernanceService.cs
        if (order.Status != OrderStatus.Completed || order.PaymentStatus != OrderPaymentStatus.Paid)
            throw new DomainException("review_not_allowed", "Only a completed paid Order can be reviewed.");
        if (await db.TeacherReviews.AnyAsync(x => x.OrderId == orderId, ct))
            throw new DomainException("duplicate_review", "This Order was already reviewed.");
        ...
        await RefreshRatingAsync(order.TeacherId, ct);
```

---

## Privacy

| Item | Public exposure? | Assessment |
|---|---|---|
| Storage keys / private paths | No on public sample/card DTOs; content by id | Sound |
| Internal reviewer ids / InternalNote | Owner/queue DTOs only | Sound |
| Draft showcase / private_showcase | Not in public sample filter | Sound |
| Private qualification demos as evidence | Not public portfolio | Sound |
| Hidden/inactive services | Omitted from public service query | Sound |
| City, TimeZoneId | Yes on public profile | Overshare |
| IsProfileComplete, PublicationBlockingReasons, IsEligibleForPublication | Yes on public profile | Internal leak |
| Review OrderId | Yes | Soft leak |
| Reviews for non-Browsable teachers | Yes | Visibility bypass |
| Marketing copy implying measured response (“under 2 hours”) | Locales / landing | Copy risk; not DTO |

---

## Consistency

| Pair | Agreement | Divergence |
|---|---|---|
| Browse ↔ Profile | Same eligibility gates | Profile topics/languages less filtered; City/TZ/blockers only on profile |
| Browse ↔ Comparison | Same eligibility | `SampleCount` weaker; Bio/Experience on compare; languages/levels more filtered on compare than profile |
| Browse ↔ Favorites | Same card DTO + null metrics + trust badges | Favorites omit email/suspend/qual/service gates |
| Profile ↔ Reviews API | Rating aggregates match when both visible | Reviews can appear when profile 404s |
| Booking / Request ↔ Profile | Consume public profile | Honest if profile load succeeds |
| Frontend Top rated badge invent | Removed from Browse/Profile JS | Locale keys `Top rated` remain; min-rating filter chips (including 4.8) are filters, not badges |
| Verified vs TrustBadges on suspended owner view | Owner profile: `Verified` from subjects; badges require `!IsSuspended` | Possible owner-only mismatch when suspended |

Compare sample count (weaker):

```297:305:src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs
        var samples = await db.TeacherTeachingSamples.AsNoTracking()
            .Where(x => availableIds.Contains(x.TeacherId) && x.PublishedAt != null
                && db.Subjects.Any(subject => subject.Id == x.SubjectId && subject.IsActive)
                && db.TeacherSubjectQualifications.Any(q => q.TeacherId == x.TeacherId
                    && q.SubjectId == x.SubjectId
                    && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null))
            .GroupBy(x => x.TeacherId)
            .Select(x => new { TeacherId = x.Key, Count = x.Count() })
```

---

## Root Cause

1. **Metrics:** Legacy columns and marketing language treated self-reported or unsupported counts as performance; F-002 fixed API projection but columns and some copy remain.
2. **Verification:** Correctly derived from qualifications; badges formalize the same evidence without a parallel reputation system.
3. **DTO reuse:** One fat `TeacherProfileDto` serves owner and anonymous public, shipping internal publication diagnostics publicly.
4. **Eligibility drift:** Favorites and Reviews list were not brought up to Browse/Profile fail-closed gates.
5. **Projection freshness:** Profile topics/languages/levels and Compare `SampleCount` do not always reuse the strictest public filters used for samples/media.
6. **No parallel invent:** Performance badges remain correctly blocked (ADR-010); remaining work is hardening existing truth, not adding new claims.

## Decision

**READY FOR HARDENING IMPLEMENTATION**

Not blocked on missing Highly Rated / Fast Responder formulas — those stay deferred until Business Rules exist.  
Not already fully sound — concrete integrity gaps listed below are implementable without inventing metrics or redesigning architecture.

### Recommended hardening backlog (no new reputation system)

1. Align `GetFavoritesAsync` / favorite add with Browse eligibility (or mark unavailable explicitly).
2. Gate `GetTeacherReviewsAsync` on the same public teacher visibility as `GetPublicProfileAsync`.
3. Align Compare `SampleCount` with public sample rules (`Approved` showcase / published qual sample + media existence).
4. Slim public profile projection: omit `PublicationBlockingReasons`, `IsProfileComplete`, `IsEligibleForPublication`; decide City/TimeZoneId privacy.
5. Refilter public topics/languages/education levels for active catalog (+ topic subject qualification where applicable).
6. Optionally omit `OrderId` from anonymous `ReviewDto`.
7. Clean marketing/locale copy that implies measured response time or invents “Top rated” as a badge.
8. Document Business Rule for post-review refund/dispute impact on visibility (do not invent in code until approved).

## Validation

- Investigation used existing code only.
- No runtime source, entities, DTOs, or migrations modified in this pass.
- No commit / push / deploy.
- Documentation indexed below.

## Files Reviewed

- `src/Tafseel.Application/Marketplace/MarketplaceContracts.cs`
- `src/Tafseel.Application/Governance/GovernanceContracts.cs`
- `src/Tafseel.Domain/Marketplace/Marketplace.cs`
- `src/Tafseel.Domain/Governance/Governance.cs`
- `src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs`
- `src/Tafseel.Infrastructure/Governance/GovernanceService.cs`
- `src/Tafseel.Infrastructure/TeacherApplications/TeacherApplicationService.cs` (revocation / sample generation — sampled via prior ADR evidence)
- `src/Tafseel.Api/Controllers/MarketplaceController.cs`
- `src/Tafseel.Api/Controllers/GovernanceController.cs`
- `src/Tafseel.Api/Controllers/LiveSessionsController.cs`
- `docs/decisions/ADR-001-VERIFIED-TEACHER-DERIVATION.md`
- `docs/decisions/ADR-007-TEACHER-PORTFOLIO-MODERATION.md`
- `docs/decisions/ADR-010-TEACHER-REPUTATION-AND-BADGES.md`
- `docs/fixes/F002_TEACHER_METRICS_INTEGRITY_REPORT.md`
- `Tafseel-Browse-Teachers.dc.html`, `Tafseel-Teacher-Profile.dc.html`, `Tafseel-Student-Dashboard.dc.html` (surfaces)
- `js/locales.js` (marketing / Top rated copy residues)
- Integration test references: `Phase9GovernanceTests`, `TeacherTrustBadgeTests`, `TeacherComparisonTests`

## Risks

1. Favorites and reviews can present Teachers who Browse/Profile hide — trust and privacy inconsistency.
2. Public profile overshares internal publication blockers and fine location/timezone.
3. Compare `SampleCount` can overstate playable public media.
4. Stale inactive languages/topics on Profile vs Compare disagreement.
5. Marketing copy can reintroduce unsupported performance claims even when DTOs are null.
6. Post-review refund/dispute policy undefined — residual integrity risk until BR exists.

## Recommended Next Step

**Focused integrity hardening pass (no new badges/metrics):** align Favorites and Reviews with Browse/Profile public eligibility; fix Compare `SampleCount`; slim public `TeacherProfileDto` projection; refilter catalog-linked public lists — then re-validate cross-surface consistency.
