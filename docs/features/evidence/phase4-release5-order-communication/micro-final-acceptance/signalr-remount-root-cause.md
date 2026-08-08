# SignalR remount root cause

Date: 2026-08-08. Proof uses `window.__tafseelMessageHub.state` (`HubConnection.state`), not `connectCount` alone.

## Historical observation

After some DC script / widget reinjection paths, diagnostics showed `connectCount = 0` while REST send, composer, and history still worked. Long-lived two-context realtime was already proven; remount continuity was not.

## Classification

**UI/View Issue** (fixed), plus a **Test Issue / diagnostic limitation**.

Not a silent Production Bug that dropped an already-Connected hub while the same IIFE stayed mounted. Actual `HubConnection.state` after remount is **Connected**, and counterpart tokens arrive with `renderCount = 1`.

## Exact mechanism

1. `chat-widget.js` is an IIFE. DC / dashboard remount re-executes the script.
2. The second IIFE created a **new** `connectCount` (0) and a **new** `__tafseelChatDebug` that overwrote the first, so diagnostics looked disconnected even when a hub might still exist.
3. `boot()` early-returned when `.tf-chat-widget` was already in the DOM, skipping `connect()`. After `pagehide` stopped the hub, remount left **zero** live connection — REST-only mode.
4. `select()` did not always ensure the shared hub before `JoinConversation`.

## Fix (narrow)

Page-scoped singleton:

- `window.__tafseelMessageHub`
- `window.__tafseelEnsureHub` (only the owner IIFE starts/stops)
- `window.__tafseelConnectCount` (does not reset on reinject)
- `__tafseelChatDebug` reads the shared hub + `__tafseelActiveConversationId`
- `boot()` still calls `ensureHub` when the widget already exists
- `select()` connects then joins
- `pagehide` disconnects owner; persisted `pageshow` reconnects
- `connect()` no-ops when state is Connected / Connecting / Reconnecting (no start storm)

CI `check-release5-order-communication.mjs` asserts the singleton symbols.

## Proof

See `micro-browser-cert.json`, remount JSON files, and `remount-20-cycle.json`: after remount, `hubState`/`rawState` = `Connected`, `widgets` = 1, `connectCount` = 1, counterpart message received without reload.
