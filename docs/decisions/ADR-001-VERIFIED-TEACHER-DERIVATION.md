# ADR-001: Verified Teacher Derives From Active Qualifications

## Status

Accepted.

## Context

Teacher subject approval is established through the qualification application, immutable demo submission and Quality review lifecycle. Public trust must reflect that evidence and its revocation state.

## Decision

A teacher is verified only when they have at least one active approved subject qualification. Verification is derived; it is not a manually writable profile boolean.

## Consequences

- Approval can make an eligible profile verifiable.
- Revocation removes the affected qualification and can unpublish dependent services/samples.
- Public verification remains tied to persisted review evidence.

## Alternatives Considered

- Manual administrator verification flag: rejected because it can diverge from qualification evidence.
- Email confirmation alone: rejected because it proves email control, not teaching qualification.
