# SignalR widget lifecycle

Expected transitions after the singleton fix:

```
Initial page
  → IIFE boot / inject widget
  → __tafseelEnsureHub() creates one HubConnection (Disconnected → Connecting → Connected)
  → select(conversationId) → JoinConversation
  → MessageReceived + id de-dupe → renderCount 1
  → navigate away / pagehide
  → owner disconnectHub() (Connected → Disconnected); shared hub cleared
  → navigate back / DC reinject
  → second IIFE delegates to __tafseelEnsureHub (does not start a second connection)
  → boot-if-widget-exists still ensureHub()
  → select() ensureHub + JoinConversation
  → HubConnection.state Connected; realtime resume
```

Hard reload: full new IIFE, new hub, query `conversationId` reopens + joins.

Back/forward: if `conversationId` is absent from the restored URL, the widget stays coherent but does not invent a selected thread (canonical). When the conversation is visibly open, hub must be Connected.

State machine in `connect()`:

| HubConnection.state | Action |
|---|---|
| Connected | join active conversation if any; return |
| Connecting / Reconnecting | return (no concurrent `start()`) |
| Disconnected / none | stop any stale instance, build with `withAutomaticReconnect()`, `start()`, join |

One widget DOM node (`widgets=1`). No timer reconnect loop. 12s interval only polls the inbox list when there is no hub and the tab is visible (pre-existing REST fallback).
