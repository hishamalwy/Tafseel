# ADR-003: Qualification Submissions Are Immutable Versions

## Status

Accepted.

## Context

Quality review must retain the exact task, instructions, official resources and uploaded demo associated with every submission attempt.

## Decision

Every demo upload creates a new immutable submission version. The assigned task, instructions and resource manifest are snapshotted. Earlier versions are never replaced or mutated.

## Consequences

- Reviews and disputes can reference historical evidence.
- Re-upload creates a new version and preserves earlier files.
- Approved qualification samples derive from approved evidence without modifying it.

## Alternatives Considered

- Replace the previous upload: rejected because it destroys review evidence.
- Keep only the latest database row with file history elsewhere: rejected because snapshot integrity would be split and easier to corrupt.
