# Context lookup scalability

## Normal path (after this pass)

`Conversation.scope === Order` → `GET /api/v1/orders/{resourceId}` → `GET /api/v1/orders/{id}/timeline` → `GET /api/v1/learning-requests/{learningRequestId}`.

Constant DB work via Order PK + participant filter. Conversation create already used `Scope + ResourceId` + `IX_Conversations_Scope_ResourceId`.

## Old path (removed)

`findPaged` scanned up to 20×50 = 1,000 newest Orders/requests. That was UI-only Technical Debt / Scalability Bug for accounts beyond 1,000 historical rows. **Removed.**

## Test

`Owned_order_and_request_lookup_is_targeted_and_closed_orders_stay_writable` asserts outsider 404 and `Commands.ReadCount < 20` on GET by id.
