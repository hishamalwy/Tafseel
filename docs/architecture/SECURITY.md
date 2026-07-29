# Tafseel Security Architecture

## JWT

JWT validation checks issuer, audience, signature, lifetime and role/name claim mappings. Token validation reloads the user and rejects missing, suspended or security-stamp-mismatched accounts.

## Refresh Tokens

Refresh tokens are stored hashed, rotated on use and grouped into token families. Replay detection revokes the affected family. Password change/reset revokes active sessions.

## Identity

ASP.NET Core Identity enforces unique email, password complexity and lockout. Roles and permissions are server-side. Normal identity/catalog initialization is invoked only in Development; Testing uses its explicit factory setup.

## SignalR

The messaging hub requires authentication. Conversation membership is checked before joining or sending. User IDs derive from authenticated subjects, and persisted ownership prevents cross-user reads.

## File Uploads

Uploads enforce category allowlists, bounded sizes, permitted extensions/MIME types and file signatures. Storage keys are generated rather than trusted from filenames. Download endpoints enforce ownership and content disposition.

Known gaps include durable Production storage and malware scanning.

## Rate Limiting

The API has global and focused policies for authentication, uploads, confirmation, payments and messaging. Testing uses intentionally higher limits.

## Password Reset

Reset responses avoid account enumeration. Identity-generated tokens are delivered through the configured email provider. Successful reset revokes existing sessions.

## Email Confirmation

Registration requires confirmation before normal authenticated use. Confirmation requests have cooldown/rate limits. Delivery failure does not roll back the created identity and can be retried.

## Payment Callback Validation

Payment success is accepted only from the backend callback flow. Callbacks use a configured secret/signature, persisted provider event identity, payload hashing, transactions and idempotency checks.

## Secrets

JWT keys, Resend tokens, payment webhook secrets and production URLs are configuration-bound and validated on startup. Placeholder, short, Development or mock values are rejected where the environment contract requires it. Secrets are not committed as production values.

## Logging

Serilog provides request and application logging. Authentication and finance flows log stable identifiers/outcomes, not passwords or raw tokens. Problem responses receive trace/correlation IDs.

## Known Risks

- Real payment and live-session providers are not registered.
- Local file storage is not a proven durable/shared Production design.
- Malware scanning is not implemented.
- Multi-instance SignalR behavior is not verified.
- The DC/Babel runtime currently requires broader CSP inline/eval allowances.
- Identity-document verification storage/workflows do not exist and must not be implied.
