# SignalR connection lifecycle

## Application

- Single widget `inject()` is idempotent (`querySelector('.tf-chat-widget')` guard).
- `disconnectHub()` on `pagehide` and before rebuilding a connection.
- `connect()` reuses a `Connected` hub and only `JoinConversation` for the active id.
- `selectSeq` cancels stale Order A/B switches.
- `TafseelChat` is assigned before `loadList` so a failed list fetch cannot leave the composer API undefined.
- `select()` catches message-page failures instead of throwing into the caller.
- Localhost-only `__tafseelChatDebug()` reports `connectCount`, `hubState`, widget count.

## Proof

- Two-context realtime (long-lived Student + Teacher pages, no reload): `renderCount = 1` both directions (`realtime-retention.json`).
- Open/close/reopen on one page: `widgets === 1`, `connectCount` does not grow unbounded.
- Remount 20-cycle: always 1 widget. Debug on remount pages often shows `connectCount: 0` / `hubState: none` on the active IIFE after DC script re-inject; REST history + composer still appear. Duplicate DOM widgets were not observed.

No second Chat domain. Hub authorization unchanged.
