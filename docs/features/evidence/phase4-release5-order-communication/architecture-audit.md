# Architecture audit

Classification: **Missing Feature / UX Gap**. The generic messaging system worked; Order entry points and commercial context were incomplete.

- `Conversation` is the canonical thread. `ConversationScope.Order` plus `ResourceId` already models an Order relationship.
- `Message` is immutable and contains sender, body, timestamp, and canonical `MessageAttachment` children. There is no edit/delete API.
- `ConversationParticipant` is keyed by `(ConversationId, UserId)` and persists `LastReadAt`.
- Participant membership gates messages, attachments, read state, and SignalR group joins. Admin/Quality receive no implicit access.
- `MessagingHub` supplies authenticated user/conversation groups. `NotificationWriter` and `NotificationOutbox` isolate message persistence from optional email delivery.
- Persistence indexes include participant lookup and `(ConversationId, CreatedAt, Id)` ordering.
- Conversations already support General, LearningRequest, Order, and LiveSession scopes. No second messaging domain was created.

The pre-release inbox projection loaded full message histories. Release 5 replaced that with database-side latest-message and unread aggregates.
