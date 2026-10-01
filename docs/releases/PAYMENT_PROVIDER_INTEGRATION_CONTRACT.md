# Payment provider integration contract (PAY-02)

**Status: OWNER/PROVIDER DECISION REQUIRED.** No payment provider has been selected (PAY-01), and the contract should
not be signed before the VAT/e-invoicing position (DEC-08). This document is what the adapter must do once one is
chosen, so the work is a bounded ticket rather than a redesign. It invents no provider behaviour: every
provider-specific item below is a question to answer from the chosen provider's documentation and sandbox.

The payment **lifecycle** (orders, live sessions, open-request offers, escrow, fees, disputes, full refunds, payouts)
already exists and is protected code. The adapter attaches a provider to it; it does not change it.

## 1. What exists

| Piece | Where | State |
|---|---|---|
| Port | `IPaymentProvider { Name; InitiateAsync(paymentId, amount, currency); VerifyWebhook(payload, signature) }` (`FinanceContracts.cs`) | Ready for checkout + webhook; **no refund call** |
| Event | `VerifiedPaymentEvent(EventId, ProviderReference, Amount, Currency, Succeeded)` | Success/failure only |
| Webhook route | `POST /api/v1/payments/webhooks/{provider}`; signature header `X-Payment-Signature`; 64 KB limit; own rate-limit policy (300/min per source) | Ready |
| Webhook processing | `FinancialService.ProcessWebhookAsync`: verify → Serializable tx + application lock on `webhook:{provider}:{eventId}` → dedupe by `(Provider, EventId)` → record payload SHA-256 → confirm or fail → ledger capture into escrow → order/booking/offer conversion → notifications | Ready |
| Idempotent start | `Idempotency-Key` per attempt; a retry of the same attempt re-initiates the **same** payment | Ready |
| Checkout in the browser | Server returns `checkoutReference`; an absolute URL makes the client navigate there (`checkout.use-cases.ts`) | Ready for a hosted/redirect checkout |
| Production guard | Startup refuses `Mock`, placeholders, unregistered names | Ready |
| Refund | `FinancialService.RefundAsync` and the dispute/cancellation paths reverse the **ledger** | Ledger only — money is not returned at a PSP |

## 2. What the adapter must implement

1. **Checkout creation** — `InitiateAsync(paymentId, amount, currency)`:
   - Create the provider payment/checkout for exactly `amount` `currency` (SAR). Convert to minor units if the
     provider requires (1 SAR = 100 halalas) with no rounding drift.
   - Pass `paymentId` as the provider's idempotency key / merchant reference, so a retried start never creates a second
     charge.
   - Return `ProviderReference` (the provider's payment id, used to match webhooks) and `CheckoutReference` (the
     **HTTPS** hosted-checkout URL).
   - Return URL: the purchase page on the production domain (`/orders/{id}`, `/live-sessions/{id}`, `/requests/{id}`).
     Those pages read server state; the return itself proves nothing.
2. **Webhook verification** — `VerifyWebhook(payload, signature)`:
   - Verify the provider's signature over the **raw body** with `Payments:WebhookSecret` in constant time. Reject
     anything unsigned or malformed (`invalid_webhook_signature`).
   - If the provider signs a timestamp, reject events older than its documented tolerance (replay window).
   - Map only a **captured/paid** state to `Succeeded = true`. Map declined, failed, expired, voided, cancelled to
     `Succeeded = false`. Authorised-but-not-captured is **not** success.
   - Take `EventId` from the provider's event id (not the payment id), so each distinct event is processed once.
   - Take `Amount`/`Currency` from the provider's captured amount; `Payment.Confirm` refuses a mismatch.
3. **Refund at the provider** — **port change needed** (protected finance code; needs a PAY-02 ticket with the
   Product Owner's authorization and a failing test first, per AGENTS.md):
   - Add `RefundAsync(providerReference, amount, currency, idempotencyKey)` to the port.
   - Full refunds only (DEC-05). The provider call uses the Tafseel refund idempotency key.
   - Decide ordering in PAY-02: either call the provider first and record the ledger refund only on success, or record
     "refund requested" and complete on the provider's refund webhook. Either way a failed provider refund must leave
     the ledger unchanged or visibly pending, never silently "refunded".
4. **Registration** — add the adapter to the `IPaymentProvider` switch in `DependencyInjection.cs` and replace the two
   "Mock only" validations with "a registered provider"; keep Production refusing `Mock` and the simulator.
5. **Content-Security-Policy** — a redirect checkout needs nothing. An embedded form/iframe/JS SDK needs the
   provider's origins added to `script-src`, `frame-src`, `connect-src` (and `form-action` if it posts a form) in
   `Program.cs`, only when that provider is configured (as JaaS does).

## 3. Webhook response rules

| Situation | Response | Why |
|---|---|---|
| Valid, processed | 200 | |
| Duplicate event id | 200, no change | Already processed |
| Invalid signature | 400 | Not from the provider |
| Unknown or irrelevant event type | **200, no change, logged** | Otherwise the provider retries forever — **port change needed**: today an adapter can only return success/failure |
| Payment reference unknown | 404 today | Investigate: wrong environment/keys |
| Amount/currency mismatch | 400 today (`payment_mismatch`) | Should become: record a reconciliation case and 200 (PAY-02) |

## 4. Scenarios PAY-03 must prove in the provider sandbox

Each with the provider reference recorded, and reconciliation (Finance → Reconciliation) showing zero issues after.

1. Card success → order paid → escrow held → delivery → completion → earning matures → withdrawal.
2. Card declined → payment failed, student notified, can retry; nothing charged.
3. Student abandons checkout → payment stays pending; provider "expired" event → failed attempt.
4. Retry after a failure → same Tafseel payment, one provider charge.
5. Duplicate webhook (resend from the dashboard) → processed once.
6. Delayed webhook (minutes) → confirmation still correct.
7. **Webhook before browser return** → purchase page shows paid.
8. **Browser return before webhook** → purchase page shows "confirming" until the webhook, never paid on return alone.
9. Tampered payload / wrong secret → 400, no state change.
10. Full refund by Finance → provider refund id, ledger reversed, student notified.
11. Dispute resolved as refund → provider refund; resolved as release → teacher earning.
12. Live session: accept → pay → confirm → no-show and cancellation ≥ 24 h (refund) paths.
13. Open request: reservation → pay inside the window → order. **Pay after the reservation expired** (see §5).
14. Unknown event type → 200, no change.

## 5. Edge cases the adapter must handle

- **Captured after the open-request reservation expired.** Today `ProcessWebhookAsync` refuses such a webhook
  (`offer_reservation_expired`, 400) before recording it. With a real provider the money is captured but no order can
  exist. PAY-02 must turn this into: record the event, open a reconciliation case, and refund at the provider (or
  convert if the product owner decides the offer should be honoured). This is protected finance code: failing test
  first.
- **Refund after the teacher withdrew the earning** — owner decision (PRODUCT_DECISIONS, owner table).
- **Chargebacks/disputes raised at the card network** — not modelled. Handle manually in V1: Finance records a
  reconciliation case; owner decides.
- **Provider fees** — not part of Tafseel's fee percentages (DEC-06). Reconciliation compares gross amounts; fees are
  reconciled against the provider's settlement report outside the app until a decision says otherwise.

## 6. Exact values needed from the owner

- Provider name and signed merchant agreement (after DEC-08).
- Sandbox account; merchant id; publishable key; secret key; webhook signing secret.
- Production equivalents in the secret store (`Payments__WebhookSecret` plus the adapter's own secret names).
- Allowed callback/return domain = the production origin; webhook URL `https://<domain>/api/v1/payments/webhooks/<name>`.
- Payment methods at launch (mada, Visa/Mastercard, Apple Pay) and settlement account.
- Whether the provider can also pay out to teachers (DEC-04 prefers it if safe; manual adapter otherwise).

## 7. Tax dependency (DEC-08)

The amount charged today is `agreed price + 8 % student fee` for orders and the session price for live sessions,
with a 15 % teacher commission. Whether VAT applies to the student fee, the commission or the teacher's service, and
whether a tax invoice or e-invoice must be issued per payment, changes: the checkout breakdown wording, the amount
sent to the provider (if VAT is added on top), the receipt/invoice document, and the provider contract. None of this
is implemented until DEC-08 is decided.
