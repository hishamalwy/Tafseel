# Notifications evidence

New messages continue through canonical `NotificationWriter`. Notification title now includes the sender display name when available; Order notifications include service/Order reference but never the private message body. The persisted link remains `/conversations/{id}` and `Tafseel.notificationRoute` resolves it to the correct dashboard Messages section with `conversationId`.

Focused SQL assertions prove notification persistence, contextual metadata, body non-leakage, and exact deep link. The existing outbox behavior is unchanged.
