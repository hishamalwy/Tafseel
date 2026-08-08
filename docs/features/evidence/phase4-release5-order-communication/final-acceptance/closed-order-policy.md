# Closed-order communication policy

No new business rule invented. Current **consistent** behavior (ValidateScope/Send ignore `Order.Status`):

| State | Readable | Writable | Attachments | SignalR join | Notifications |
|---|---|---|---|---|---|
| InProgress / Delivered / RevisionRequested | yes | yes | yes (participant) | participant | yes (no body leak) |
| Completed | yes | **yes** (tested) | yes | participant | yes |
| Cancelled (unpaid) | yes | **yes** (tested) | yes | participant | yes |
| Refunded | same as paid+refund timeline projection; send not status-gated (code audit; no extra financial fixture) | yes | yes | participant | yes |
| Disputed | Complete blocked while open dispute; messaging not status-gated (code audit) | yes | yes | participant | yes |

**Product Decision Required** before restricting write after Completed/Cancelled/Refunded/Disputed.
