# OmnyID Engineering Guardrails

These rules are mandatory for all new implementation work.

1. Keep all new files under 1000 lines.
2. Prefer extending existing modules over creating new files.
3. If a file approaches 1000 lines, split by bounded responsibility before adding more logic.
4. New migrations should be minimal, backward compatible, and additive.
5. AFP compatibility is non-negotiable: no required field additions to existing message contracts.
