# Attachment evidence

Release 5 reuses `MessageAttachment`, `IFileStorageService`, and `PrivateMediaRules`. Allowed formats remain PDF, PNG, JPEG, DOCX, PPTX, and ZIP, with canonical signature checks and the configured 50 MB maximum. Filenames are reduced to `Path.GetFileName` and private download uses authenticated blob retrieval.

Message attachments, original request attachments, and deliveries remain distinct domains and are displayed in separately labelled groups. Malware scanning remains a Production dependency; no scan was simulated.
