# Live remount realtime (pre-cycle console)

Date: 2026-08-08. Development `http://127.0.0.1:5090`. HubConnection.state inspected via `window.__tafseelMessageHub.state`, not `connectCount` alone.

| Scenario | Result | Notes |
|---|---|---|
| Student active conversation | PASS | hubState=Connected, widgets=1 |
| Teacher active conversation | PASS | hubState=Connected, widgets=1 |
| Baseline PRE_REMOUNT both directions | PASS | renderCount=1 each |
| Student remount realtime | PASS | POST_REMOUNT_TEACHER received, renderCount=1, Hub Connected |
| Teacher remount realtime | PASS | POST_REMOUNT_STUDENT received, renderCount=1, Hub Connected |
| Both-side remount | PASS | renderCount=1 each direction |
| Completed Order remount realtime | PASS | order `255f5c11-460f-4cc6-9310-a0ffde6699b7`, renderCount=1 |
| Hard reload realtime | PASS | Hub Connected, renderCount=1 |
| Back/forward | PASS | widget coherent; conversation reopened when query lacked conversationId |

A later full-harness pass continues unread, attachment, and 20-cycle after dedup send was switched to authenticated API send on the correct conversation.
