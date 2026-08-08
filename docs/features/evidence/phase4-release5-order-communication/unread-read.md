# Unread/read evidence

Unread is derived in SQL from messages authored by the peer after the participant's persisted `LastReadAt`. The conversation list no longer loads every message. Opening and rendering the selected thread invokes the canonical read endpoint only for that conversation, then refreshes badges. Sender-authored messages are excluded.

Phase 8 SQL tests passed unread 1 → 0 persistence. Two-tab browser concurrency was not rerun because authenticated UAT credentials were unavailable.
