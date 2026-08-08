# Notification / deep link E2E

- Notification body does not include private message text (Integration + existing Phase5 assert).
- Link remains `/conversations/{id}`.
- `notificationRoute` teacher **and** student hrefs now include `conversationId`.
- Teacher Dashboard Notifications section: click `[data-r5-notification]` → widget opens exact thread (**PASS** `teacher-deeplink`).
- Student `openNotification` now passes `{ conversationId }` into `TafseelChat.open`.
