# Request to Order continuity

The commercial communication thread begins when teacher acceptance creates the Order. Request clarifications remain persisted `RequestClarification` workflow facts rather than being copied into Message rows. The Order conversation projects the persisted request-created event and exposes the canonical request attachments, so completed Order context retains the original brief/files without binary duplication.

This avoids falsely presenting request clarification records as chat speech. A future product decision may choose to create a LearningRequest conversation at submission, but historical conversations must never be heuristically attached by participant match.
