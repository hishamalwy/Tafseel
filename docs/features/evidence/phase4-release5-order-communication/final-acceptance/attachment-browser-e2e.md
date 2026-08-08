# Attachment browser E2E

- Playwright `setInputFiles` on open widget `[data-r5-file]` with `%PDF-1.4` test file.
- Message + attachment accepted; Teacher receives same message id/body without extra bubble (`attachment-live` PASS).
- Download uses authorized blob helper (no public storage URL in markup).
- API: unsupported `.exe` → `invalid_file_type`; PDF MIME with wrong bytes → `invalid_file_signature`; empty → `invalid_file_size`; outsider → 404.
- Malware scanning not claimed.
