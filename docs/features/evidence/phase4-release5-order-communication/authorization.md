# Authorization evidence

- API endpoints require `Permissions.MessagesUse`; JWT validation rejects suspended accounts.
- `ValidateScopeAsync` proves the actor, peer, and Order pair before creation.
- Reads return not-found semantics unless `(ConversationId, UserId)` exists.
- Sends call `Conversation.RequireParticipant`.
- Attachment upload requires the original message sender; attachment read joins through a participant row.
- SignalR `JoinConversation` repeats membership authorization.
- Focused SQL tests: Phase 8 messaging plus Order lifecycle passed 4/4, including outsider conversation and attachment denial.
