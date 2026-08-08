# Realtime evidence

The existing authenticated SignalR hub is reused. The widget joins only an authorized conversation group and handles `MessageReceived`/`NotificationChanged`. Incoming message IDs are de-duplicated before rendering, and the database remains system of record before broadcast.

The Phase 8 SignalR authentication test passed. A simultaneous two-browser authenticated exchange was not available. Multi-instance SignalR backplane support remains outside this release.
