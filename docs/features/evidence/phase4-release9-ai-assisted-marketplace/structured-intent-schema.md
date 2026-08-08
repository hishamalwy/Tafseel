# Structured Intent Schema

Discovery returns only: allowlisted intent type, subject text, allowlisted service intent, service text, preferred language text, education-level text, optional bounded maximum price, clarification flag, and at most two bounded questions. It has no Teacher ID, score, rank, availability, policy, or free-form filter operator.

Request drafting and Product Help use separate strict schemas. All properties are required, unknown JSON properties are rejected, strings/arrays are bounded, and application validation runs after deserialization.
