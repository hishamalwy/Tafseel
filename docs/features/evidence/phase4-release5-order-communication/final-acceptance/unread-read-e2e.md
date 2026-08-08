# Unread / read E2E

Canonical API (Integration `Release5OrderCommunicationAcceptanceTests`):

- Student sends 2 messages → Teacher `unreadCount=2`; Student `unreadCount=0` (own messages excluded).
- Teacher `POST /conversations/{id}/read` → `unreadCount=0` persists on reload of list.

Browser: Teacher nav badge uses the same `liveConversations.unreadCount` projection.
