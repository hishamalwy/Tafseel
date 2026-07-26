# Notifications

Implemented business events write an in-app Notification and, when enabled, a transactional email outbox record. The primary operation never calls the external email provider.

The worker claims due rows using rowversion, retries with bounded backoff, recovers stale processing rows after five minutes, and stops after five failed attempts. Deduplication keys prevent duplicate user notifications. External delivery failure is logged without message body or recipient data and does not roll back business state.
