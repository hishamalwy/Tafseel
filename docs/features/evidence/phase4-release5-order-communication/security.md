# Security evidence

IDOR is denied at conversation, message, read, attachment, timeline, request-file, delivery-file, and SignalR membership boundaries. User text is rendered through `textContent`-based escaping; Markdown/HTML is unsupported. Scope/peer/resource IDs are validated server-side. Users cannot set a system-message type. Canonical file extension, MIME, signature, size, storage-category, and safe-key checks remain active.

Remaining boundary: Production malware scanning is not implemented. SignalR scale-out and durable Production media/storage configuration remain platform dependencies.
