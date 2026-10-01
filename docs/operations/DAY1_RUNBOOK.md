# Day-1 operations runbook

For the people running Tafseel on launch day. Each situation says how you find out, who owns it, the safe thing to
do right now, and when to escalate. Alerts are defined in [OBSERVABILITY_AND_ALERTS.md](OBSERVABILITY_AND_ALERTS.md);
deeper procedures are in [RUNBOOK.md](RUNBOOK.md) and [DATABASE_RUNBOOK.md](DATABASE_RUNBOOK.md).

**Rules that apply to every case**

- Money moves only through the product screens (Finance, Disputes), never by editing the database. Every step is
  audited and idempotent; retrying a screen action is safe.
- Nobody handles their own purchase, payout, dispute or help case: the system refuses, so hand it to a colleague.
- Ask the user for the **reference** on their error screen (`correlationId`); it finds the exact request in the logs.
- Never ask a user for their password or a card number. Tafseel never sees card numbers.
- Write every incident in the incident log: time found, who, what was done, customer impact, follow-up.

## 1. Day-1 accounts

Current roles are enough for launch: **Student**, **Teacher** (public sign-up), **QualityReviewer**, **Finance**,
**Admin**. There is **no Support role**: named Admins own the help and abuse queue (`/admin/help`,
`Support.Cases.Manage`). No other role is required for launch.

| Role | Who (owner to name) | Minimum | Does | Must not |
|---|---|---|---|---|
| Admin | Owner + one deputy | **2** (the last Admin cannot be removed; an Admin cannot suspend themselves) | People, catalog, operations, disputes, help queue, audit; owner access to Finance | Share an account; use Admin for daily shopping/teaching |
| Finance | Finance operator(s) | 1 (2 recommended) | Payments lookup and full refunds, payout-detail verification, withdrawals with bank evidence, reconciliation, financial audit | Hold Admin as well unless they are the owner |
| QualityReviewer | Subject reviewer(s) | 1 per launch subject group | Review teacher applications; withdraw a qualification with a reason | Review their own application (refused) |

**Provisioning the first Admin** (no shared or default credentials exist in Production):
1. The owner registers normally on the production site with their own email and confirms it.
2. The deploy runs `provision` with `Provisioning__BootstrapAdminEmail=<that email>`; it promotes the account only while
   the environment has **no** Admin, and writes `AdminBootstrapped` to the audit log. Then remove the setting.
3. The owner signs in and appoints the deputy Admin from **Admin → People**.

**Assigning Finance / QualityReviewer:** the person registers and confirms their email; an Admin grants the role in
**Admin → People**. Role changes revoke the person's sessions (security stamp) and notify them.

**Removing privilege:** Admin → People → remove the role (or suspend the account). Sessions end on the next request.
Do this the same day someone leaves. Review the People list monthly.

**MFA:** the API supports TOTP, but there is no enrollment screen and it is not enforced (owner decision 5 in
[PRODUCTION_LAUNCH_READINESS](../releases/PRODUCTION_LAUNCH_READINESS.md#6-owner-decisions-required)). Until decided:
unique long passwords from a password manager, no shared devices, and weekly review of **Finance → Audit** and the
Admin audit log.

## 2. Situations

### 2.1 Payment stuck ("I paid but the order still says awaiting payment")
- **Detect:** user help case or message; alert A5 (webhook failures); Finance → Payments shows the payment `Pending`.
- **Owner:** Finance.
- **Safe now:** look up the payment (Finance → Payments, by id or email). Check it in the PSP dashboard.
  - PSP says **captured** and Tafseel says **Pending** → the webhook did not arrive or was refused. Use the PSP's
    "resend webhook". Do **not** mark anything paid by hand; Tafseel confirms only a signed webhook.
  - PSP says **failed/abandoned** → nothing was charged; tell the student they can pay again from the order.
- **Escalate:** webhooks refused for more than 10 minutes (A5), or a captured payment whose request/offer had already
  expired (it cannot become an order: it needs a refund at the PSP and a reconciliation case) → Admin + engineer.

### 2.2 Refund request
- **Detect:** help case, dispute, email.
- **Owner:** Finance (Admin as backup).
- **Safe now:** V1 refunds are **full refunds only** (DEC-05). If the purchase has a dispute, it must be settled in the
  dispute, not refunded directly (the screen refuses). Otherwise Finance → Payments → payment → Refund, with a reason.
  The result is idempotent: pressing twice refunds once.
- **Until PAY-02:** a refund in Tafseel changes the ledger only. With the real PSP the adapter must also return the
  money at the PSP; until that exists, check the PSP dashboard and refund there too, then note the PSP refund id in the
  refund reason.
- **Escalate:** request for a partial refund (not supported in V1 → owner), or a refund after the teacher has already
  withdrawn the earning (owner decision).

### 2.3 Withdrawal pending
- **Detect:** Finance home; alert A15; teacher help case.
- **Owner:** Finance.
- **Safe now:** Finance → Withdrawals → open the request → view transfer details (the full IBAN read is audited) → make
  the bank transfer from the company account → **Start transfer** → when the bank confirms, **Confirm** with the bank
  reference as evidence. If you cannot pay, **Reject** with a reason (the money returns to the teacher's balance). A
  transfer that was started can only be cancelled by stating no money was sent.
- **Escalate:** bank returns the transfer; the destination looks wrong or fraudulent (payout details were changed just
  before the request) → Admin; do not pay.

### 2.4 Malware scanner down
- **Detect:** alert A7; `/health/ready` 503; users report "upload failed".
- **Owner:** on-call operator.
- **Safe now:** uploads are refused on purpose (nothing unscanned is stored). Restart the clamd service/container and
  check it has updated signatures and enough memory. Do **not** switch the scanner mode to bypass it (Production refuses
  to start that way anyway).
- **Escalate:** down more than 30 minutes, or during an order delivery deadline → engineer; tell affected teachers their
  deadline problem will be handled in their favour through the dispute process if needed.

### 2.5 Storage down
- **Detect:** alert A8; uploads and file views fail.
- **Owner:** on-call operator.
- **Safe now:** check the storage account status page and the connection string in the secret store. Existing data is
  not lost; files are unavailable. Do not delete or recreate the container.
- **Escalate:** more than 15 minutes, or any sign of deleted objects → engineer + owner; restore from soft delete or a
  version.

### 2.6 Email down
- **Detect:** alert A9; users say they did not receive confirmation or reset email; `/health/ready` Degraded.
- **Owner:** on-call operator.
- **Safe now:** check Resend status and the domain's DNS records (SPF/DKIM). Notification emails retry 5 times over
  ~20 minutes; in-app notifications are unaffected. Confirmation and reset emails can be re-requested by the user once
  email works again.
- **Escalate:** more than 1 hour, or domain verification lost → owner (DNS access).

### 2.7 Meeting issue ("I cannot join the session")
- **Detect:** user report during a session; alert A10.
- **Owner:** Admin on duty.
- **Safe now:** confirm the booking is **Confirmed** and the time is inside the join window (15 minutes before start).
  Ask both to reload the session page and allow camera and microphone. Check JaaS status. Leaving the meeting never
  changes payment; settlement happens after the session in Tafseel.
- **Escalate:** JaaS outage or signing errors (5xx on join) → engineer. If the session could not happen, it is settled
  through the no-show / dispute flow, not by hand.

### 2.8 Teacher complaint
- **Detect:** help case, dispute, email.
- **Owner:** Admin.
- **Safe now:** about a purchase → the dispute on that order/session (Tafseel's reviewer can message both sides). About
  money → Finance (§2.3). About qualification → the QualityReviewer who decided; the teacher can apply again.
  Harassment by a student → help case, preserve evidence, consider suspension (§2.10).
- **Escalate:** legal threat, safeguarding concern → owner the same day.

### 2.9 Student complaint
- **Detect:** help case, dispute.
- **Owner:** Admin.
- **Safe now:** delivery quality or non-delivery → the student opens a dispute within 7 days; resolve with a rationale
  (full refund / release to teacher / no financial action). Academic-integrity problems → policy enforcement, not
  refund by default. Payment problems → §2.1.
- **Escalate:** safeguarding (minor at risk, threats) → owner immediately; preserve messages and files.

### 2.10 Account suspension
- **Detect:** abuse report, fraud signal, repeated policy breach.
- **Owner:** Admin (never on themselves; never the last Admin).
- **Safe now:** Admin → People → Suspend. Sessions end at the next request and the person is notified. Open work stays:
  resolve their open orders through disputes so the other party is not harmed. Record the reason in the help case.
- **Escalate:** a teacher with many active orders or pending withdrawals → Finance before paying anything.

### 2.11 Provider outage (PSP, JaaS, Resend, storage, scanner)
- **Detect:** alerts A5, A7–A10; provider status pages.
- **Owner:** on-call operator.
- **Safe now:** do not switch any provider to a mock (Production refuses). Post a short notice (banner/social) if
  customers are affected. Payments: checkout errors are safe; nothing is charged without a signed webhook.
- **Escalate:** longer than 1 hour or during peak time → owner decides on communication.

### 2.12 Site down (host/platform)
- **Detect:** alert A1/A2.
- **Owner:** on-call operator.
- **Safe now:** check the platform status; check `/health/ready` for the failing dependency; if it started with a
  deploy, redeploy the previous image (DATABASE_RUNBOOK §5). Restart the instance once.
- **Escalate:** not resolved in 15 minutes → engineer + owner.

### 2.13 Database issue
- **Detect:** alert A3/A12; 503 `database_busy`; timeouts.
- **Owner:** on-call operator + platform admin.
- **Safe now:** check platform metrics (CPU/DTU, storage full, connection limit, failover in progress). Do not run manual
  writes. Do not restore over the live database.
- **Escalate:** data corruption or a bad migration → stop writes, follow DATABASE_RUNBOOK §5 (restore to a new database)
  with the owner's go-ahead. Backup failure (A12) → platform admin the same day.

## 3. Escalation ladder

1. On-call operator (named by the owner; hours and phone in the on-call rota).
2. Engineer (code, deploys, rollback).
3. Owner (money decisions, customer communication, legal, safeguarding).

Contacts are not in this repository; they live in the on-call rota.
