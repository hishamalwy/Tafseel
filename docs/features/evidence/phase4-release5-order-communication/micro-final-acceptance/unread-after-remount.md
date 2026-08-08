# Unread retention after remount

Unread business logic was not changed (`LastReadAt` + own-message exclusion).

Scenario `11-unread-after-remount` PASS:

```json
{"unreadBefore":0,"unreadAway":2,"unreadAfterOpen":0}
```

While Student was away/remounted, Teacher sends incremented unread. After Student reopened the conversation, unread returned to zero per the existing read-on-render rule.
