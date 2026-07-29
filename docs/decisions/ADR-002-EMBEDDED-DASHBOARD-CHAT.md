# ADR-002: Embedded Dashboard Chat Replaces Standalone Chat

## Status

Accepted.

## Context

Student and Teacher workflows already operate inside their dashboards. A separate chat page duplicated navigation and context.

## Decision

The canonical chat interface is embedded in the Student and Teacher dashboards. SignalR is the primary transport, persisted messages are authoritative and polling is fallback only. The old standalone route redirects to the Student dashboard message section.

## Consequences

- Dashboard role and conversation context are preserved.
- Realtime and fallback behavior share the same message store.
- Future chat work must extend the embedded widget rather than recreate a standalone page.

## Alternatives Considered

- Keep a separate chat page: rejected because it duplicates the existing dashboard experience.
- Transient SignalR-only chat: rejected because persistence, unread state and fallback are required.
