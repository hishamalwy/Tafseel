# Domain decision

Selected **Option A**: reuse `ConversationScope.Order` and set `ResourceId = Order.Id`.

`MessagingService.CreateAsync` validates the exact Student/Teacher ownership pair, runs a serializable transaction, and uses a SQL Server application lock keyed by `Order:{OrderId}`. An existing scoped conversation is returned, preventing duplicate Order threads. No schema or migration changed. Historical conversations are untouched.

Communication starts at Order creation/teacher acceptance because that is the first persisted Order relationship. Existing request clarification records remain request workflow history; they are not copied into chat or impersonated as messages.
