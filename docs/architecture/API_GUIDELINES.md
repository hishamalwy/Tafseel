# Tafseel API Guidelines

These are observed repository conventions, not new standards.

## Authentication

- API base routes use `/api/v1`.
- JWT Bearer is the authenticated API scheme.
- SignalR may receive the access token in the query string only for `/hubs/messages`.
- Authentication failures return the existing problem response rather than redirects.

## Authorization

- Controllers apply role/permission policies.
- Application services enforce resource ownership and hide cross-user resources with the existing not-found/forbidden conventions.
- Public endpoints return only published and approved data.
- Frontend visibility is not treated as authorization.

## DTO Conventions

- API contracts are explicit request/response records in `Tafseel.Application`.
- Controllers do not expose EF entities directly.
- DTOs carry stable identifiers, UTC timestamps and concurrency versions where updates require them.
- Money uses `decimal` and an explicit currency code.

## Pagination

- Potentially unbounded lists use page/page-size contracts and deterministic ordering.
- Page sizes are server-bounded.
- Existing single-resource and bounded lifecycle collections are not wrapped in artificial pagination.

## Validation

- Request DTOs use validation attributes where applicable.
- Domain and service layers enforce state transitions, ownership and cross-entity rules.
- Database constraints enforce uniqueness and critical integrity.
- Cancellation tokens flow from controllers into async service/database calls.

## Error Responses

- Errors use the existing Problem Details shape with stable application error codes.
- Validation errors include field error arrays.
- Trace and correlation identifiers are added centrally.
- Production exception responses do not expose stack traces or internal payloads.

## Ownership Rules

- Students can access only their own requests, orders, sessions, payments, conversations, notifications and files.
- Teachers can access only assigned/accepted work and their own managed profile resources.
- Quality access is policy-controlled for qualification review.
- Admin actions remain policy-protected and audited where implemented.

## Versioning

- Current HTTP routes use `/api/v1`.
- Optimistic concurrency uses row versions and `If-Match` on affected update endpoints.
- Backward-compatible additions remain within v1; no second API version is currently implemented.

## Naming Conventions

- Routes use lowercase plural resource names and nested action/resource segments.
- JSON follows ASP.NET Core camel-case serialization.
- Commands use HTTP verbs consistently: GET read, POST create/action, PUT replacement/idempotent update, DELETE removal.
- Application error codes use stable lowercase snake_case identifiers.
