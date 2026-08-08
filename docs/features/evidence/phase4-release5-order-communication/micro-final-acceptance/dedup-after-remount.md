# Deduplication after remount

Harness: Student remount → wait `HubConnection.state === Connected` → Teacher authenticated API send unique token → Student DOM count.

Result: **`10-dedup-after-remount` PASS** — `renderCount=1`.

No second bubble from HTTP echo + SignalR `MessageReceived`. Message-id merge in the owner hub handler is unchanged. `hub-no-dup-widgets` PASS (`widgets=1`).
