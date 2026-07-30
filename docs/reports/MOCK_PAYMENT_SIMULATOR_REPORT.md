# Mock Payment End-to-End Simulator

**Date:** 2026-07-30  
**Scope:** Controlled Mock PSP simulator for Development and explicitly enabled Staging  
**Constraints:** No real PSP, no Order lifecycle changes, no frontend-paid shortcuts, no Production Mock

## Verdict

Implemented. Students can complete Student → Payment → Teacher work → Delivery in Development via the canonical `IPaymentProvider` + webhook verification path.

## Behavior

| Step | Mechanism |
|---|---|
| Initiate | Existing `POST /payments/orders/{id}` / live-session initiate |
| Checkout URL | When `Payments:Mock:SimulatorEnabled=true`, `CheckoutReference` is `/app/Tafseel-Mock-Checkout.dc.html?ref=mock_…` |
| Simulate outcome | Authorized `POST /payments/mock/simulator/complete` |
| Confirm paid | Server HMAC + `IFinancialService.ProcessWebhookAsync` → `Payment.Confirm` → `Order.ConfirmPayment` |
| Continue lifecycle | Unchanged Order/delivery/revision APIs |

## Configuration

| Environment | Provider | SimulatorEnabled |
|---|---|---|
| Development | Mock | **true** (default) |
| Staging | Mock | **false** (enable explicitly) |
| Testing | Mock | false (tests opt in) |
| Production | non-Mock required | **forbidden** |

## Security

- Webhook secret never exposed to the browser
- Simulator endpoints fail closed when disabled / Production
- Return path restricted to `/app/…` (open-redirect safe)
- Ownership check on `StudentId` + `mock_` provider reference
- Production config gate rejects `Payments__Mock__SimulatorEnabled=true`

## Not in scope

- Real PSP adapters, settlement, payouts, refunds, wallet accounting evidence
- Changing Order states for test convenience
- Enabling Mock in Production
