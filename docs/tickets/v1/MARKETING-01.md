# MARKETING-01 — Coupons and landing promotions

| Field | Value |
|-------|-------|
| Release / owner | V1 / Product Owner (DEC-15) |
| Priority / size | P1 / M |
| Status | Done for the V1 mock-provider journey; production payment provider remains PAY-01 |
| Gates | ☑ Business · ☑ UX · ☑ Contract · ☑ Build · ☑ E2E |

## Actor, problem and goal

The admin needs to create active discount codes and publish bilingual landing promotions. A student needs to see an authoritative discounted total before starting payment. DEC-15 supersedes the former DEC-09 deferral for this journey.

## Rules and UX

- The admin creates, lists and pauses coupon codes and promotions. A discount promotion selects an active, unexpired coupon. The public feed excludes discount promotions once their code is unavailable.
- Checkout quotes a code on the server for an owned direct Order, accepted Live Session or selected Open Request Offer. It shows the original and discounted totals. Invalid, expired or changed codes show localized errors; payment does not silently revert to the full amount.
- The selected code travels on payment initiation. A retry with a different explicit code is refused. A blank retry resumes the original pending checkout.
- An Open Request payment keeps the coupon terms on the Payment while the request has no Order. Confirmation creates the Order and its CouponRedemption in one transaction. Existing escrow allocation uses the confirmed captured amount.
- Arabic and English forms keep the active locale through checkout and confirmation. The 390px layout needs no page-level horizontal scroll.

## Contracts and authorization

| Action | Endpoint |
|--------|----------|
| Admin manages coupons | `GET/POST /api/v1/admin/coupons`, `PATCH /api/v1/admin/coupons/{id}/active` |
| Admin manages promotions | `GET/POST /api/v1/admin/promotions`, `PATCH /api/v1/admin/promotions/{id}/active` |
| Student quotes | `POST /api/v1/payments/{kind}/{id}/coupon-quote` |
| Student initiates | Existing payment initiation endpoint with `couponCode` and `Idempotency-Key` |

The quote and payment resource queries bind the payable id to the caller. Wrong role gets 403; an outsider gets 404. Public promotions contain no internal coupon or payment records beyond the promoted code itself.

## Acceptance evidence

- [x] Failing tests preceded the protected Payment and FinancialService fixes.
- [x] Open Request initiation and webhook tests prove 98 SAR capture and 10 SAR redemption on a 108 SAR payable.
- [x] Admin browser journey creates a coupon and promotion on a fresh database; the public feed includes the active campaign.
- [x] Angular tests: 582 passed; Angular build and strict API route checker passed.
- [x] Published `wave3b-direct-order` browser journey proves the student coupon quote, 10 SAR discount, 152 SAR captured payment, redemption, Arabic layout and the teacher's access to the attached worksheet.
- [x] Published `admin-marketing-layout` browser journey proves admin coupon and promotion creation, public code display, Arabic 390px catalog and aligned request status badges.
- [x] Full solution tests: 664 integration, 133 domain, 14 application, 1 architecture; formatting, strict API contract and dependency gates passed.

The private JaaS key and production payment provider remain separate deployment prerequisites. No credentials belong in the repository.
