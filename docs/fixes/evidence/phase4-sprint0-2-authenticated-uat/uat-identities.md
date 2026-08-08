# Sprint 0.2 UAT Identities (Development only)

No passwords recorded here. All accounts created via legitimate app flows this pass.

| Role | Email | Creation method |
|---|---|---|
| Student | student.sprint02.uat@example.com | Real `/api/v1/auth/register` + Development dev-outbox email confirmation |
| Teacher | teacher.sprint02.uat@example.com | Real `/api/v1/auth/register` + Development dev-outbox email confirmation |
| QualityReviewer | qa.reviewer.sprint02@example.com | New Development-only `SeedUsers`-gated seed account (extension of the existing ADR-012-OPTIONAL demo-seeding mechanism); `quality@gmail.com`'s password was never touched |
| Admin | qa.admin.sprint02@example.com | Same seeding extension as above; `admin@gmail.com`'s password was never touched |

## Objects created this pass

- Teacher application: Mathematics (approved), Physics (submitted → changes requested → resubmitted → approved)
- Marketplace service: "Custom recorded explanation" enabled for Mathematics, SAR 120 / 48h / 2 revisions
- Teacher profile: published, headline/bio/country/city set
- Learning request → Order: `7b01c415-3c82-4bc6-8e7a-1be009f14b12` ("Sprint 0.2 UAT: solving quadratic equations")
  - Request attachment: `test-doc.pdf`
  - Delivery: `c9378fe9-f40e-4363-ad0b-c5be8ecd42a4` with `test-doc.pdf`
  - Payment: Mock Checkout, webhook-confirmed
  - Review: `A6B7C395-7C43-47F0-B92F-50A43EE6C774`, 5.0 average, hidden and restored during moderation testing

All data is clearly labeled "Sprint 0.2 UAT" / test content, exists only in the Development database (`(localdb)\TafseelLocal;Database=Tafseel`), and is not production-like fabricated content (no fake testimonials/reviews beyond this explicit, labeled UAT review).
