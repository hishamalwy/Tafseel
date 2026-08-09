# Teacher Marketplace Premium Redesign — Evidence

Evidence was captured on 2026-08-09 from a dedicated local database populated through supported Tafseel workflows. The public teacher record is clean: it uses a monogram avatar, approved qualification, two published services, one approved teaching sample, and zero public reviews. No UAT, development-review, fabricated testimonial, fabricated rating, or invented score appears in this evidence set.

## Core comparison matrix

Browse and Profile each include before/after captures at 1440, 1024, 768, 390, and 375 CSS pixels across Arabic/English and light/dark themes. The after set also includes a 1280 × 900 laptop capture.

- [Browse — before](before/browse/)
- [Browse — after](after/browse/)
- [Profile — before](before/profile/)
- [Profile — after](after/profile/)

## Focused evidence

- [Mobile](mobile/) — card and service/review details, including old-state comparisons.
- [Services](services/) — asynchronous, live, and selected-service differentiation.
- [Reviews](reviews/) — truthful zero-review state. A several-review state was intentionally not fabricated because no clean production-like review record was available.
- [Stress](stress/) — no media, long teacher name, and long Arabic service name.
- [Dark mode index](dark/README.md)
- [RTL index](rtl/README.md)
- [Responsive DOM audit](responsive-audit.json)

## Truth-state coverage

| Requested state | Evidence |
|---|---|
| No avatar | `stress/no-avatar-1440-en-light.png`; all teacher captures use the generated monogram avatar. |
| Long teacher name | `stress/long-teacher-name-390-ar-light.png` |
| Long Arabic service name | `stress/long-arabic-service-*.png` |
| Live service | `services/live-service-1440-en-light.png` and `services/profile-live-selected-1440-en-light.png` |
| Async service | Core Browse captures and selected Profile captures |
| Selected service | `services/selected-and-live-375-en-dark.png` |
| Media error | `stress/media-error-1440-en-light.png` and the core after Profile captures. |
| No media | `stress/no-media-1440-en-light.png` |
| Zero reviews | `reviews/zero-reviews-375-en-dark.png` |
| Several reviews | Not fabricated; documented as an evidence limitation. |
