# Attachment realtime after remount

Scenario `12-attachment-after-remount` PASS.

One remounted side received the counterpart attachment message without reload: `attachCount=1`, body token `ATTACH_AFTER_REMOUNT_*` present, no second bubble. Attachment-only messages remain unsupported (unchanged domain).
