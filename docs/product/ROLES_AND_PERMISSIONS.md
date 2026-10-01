# Roles and permissions

Source of truth: [`Authorization.cs`](../../src/Tafseel.Application/Authorization/Authorization.cs). Every API action
is authorized by these permission claims on the server; the client's guards and navigation only decide what is offered.
Business meaning of each role: [Product Contract §2](TAFSEEL_PRODUCT_CONTRACT.md#2-roles).

## Roles

| Role | Launch status | Home | What it owns |
|---|---|---|---|
| Visitor | IMPLEMENTED | `/` | Browse, teacher profiles, the account-access help form |
| Student | IMPLEMENTED | `/student/overview` | Requests, orders, sessions, payments, reviews, disputes, help, account |
| Teacher | IMPLEMENTED | `/teacher/home` | Applications per subject, profile, intro video, offerings, availability, work, earnings, withdrawals, help, account |
| QualityReviewer | IMPLEMENTED | `/quality/applications` | Application review; withdrawing a subject qualification; account |
| Finance | IMPLEMENTED | `/finance/home` | Payments lookup and refunds, payout-detail verification, withdrawals (transfer details, start, evidence, reject), reconciliation cases, financial audit, account |
| Admin | IMPLEMENTED | `/admin/home` | Everything, including Finance pages as owner access; people, catalog, operations, disputes, reviews, help queue, audit |
| Support | **NOT REQUIRED FOR LAUNCH** | — | Named Admins own the help and abuse queue (`Support.Cases.Manage`). A separate role can be carved out of Admin later without changing the case model |

## Permissions by role

| Permission | Admin | Finance | QualityReviewer | Teacher | Student |
|---|:-:|:-:|:-:|:-:|:-:|
| Users.View / Users.Manage | ✓ | | | | |
| Subjects.Manage / Topics.Manage / PlatformSettings.Manage | ✓ | | | | |
| Teachers.ReviewApplications / ReviewShowcases | ✓ | | ✓ | | |
| Teachers.Apply / ManageOwnProfile / ManageOwnServices / ManageOwnShowcases | ✓ | | | ✓ | |
| Students.CreateRequests, Requests.RequestRevision, Requests.Complete, Sessions.Book, Reviews.Create | ✓ | | | | ✓ |
| Requests.ViewOwn, Sessions.ManageOwn, Messages.Use, Payments.ViewOwn, Disputes.Create | ✓ | | | ✓ | ✓ |
| Requests.Accept / Decline / Deliver, Withdrawals.Request | ✓ | | | ✓ | |
| Reviews.Moderate, Disputes.Resolve, Reports.View, MarketplaceIntelligence.View | ✓ | | | | |
| Support.Cases.Manage | ✓ | | | | |
| Finance.Payments.View / Refunds.Execute / PayoutProfiles.Review / Withdrawals.Execute | ✓ | ✓ | | | |
| Finance.Reconciliation.View / Reconciliation.Resolve / Audit.View | ✓ | ✓ | | | |

Signed in, any role: help reports (`/help`) and account self-service (`/account`). Signed out: account-access help
only.

## Guards beyond permissions

These are checked in the domain or service, and each has a test.

- **Self-processing:** nobody handles their own…
  - payout profile;
  - withdrawal;
  - refund of a purchase they bought or taught;
  - dispute;
  - help report;
  - application review.
- **Last Admin:** the last Admin cannot be removed, and an Admin cannot suspend themselves.
- **Money calls:** Serializable transactions with application locks, If-Match, and Idempotency-Key.
- **Full bank destination:** only through an audited POST, sent `no-store`.
- **Maker-checker (two people for one payout):** not built. The launch control is:
  - the self-guards above;
  - evidence-only completion;
  - the financial audit of every step, including each read of the full destination.

  Two-person approval is post-launch ([V1_1_BACKLOG](V1_1_BACKLOG.md) B11-24).

## Changing roles

An Admin opens **Admin → People**, opens a person's **Roles**, and ticks or clears a role. The server:

- accepts only the five role names above;
- refuses removing the caller's own Admin role and removing the last Admin;
- revokes the person's sessions (security stamp), writes `RoleAssigned`/`RoleRemoved` to the audit log, and notifies them.

A person given Finance lands on `/finance/home` at their next sign-in; when Finance is removed, the Finance
screens and APIs refuse them (403) on their next request.
