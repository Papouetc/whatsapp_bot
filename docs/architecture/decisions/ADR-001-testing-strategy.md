# ADR-001: Testing strategy before architectural refactoring

## Context

Hakili has important behavior spread across WhatsApp, Telegram, PostgreSQL, AI providers, scheduled jobs, and in-memory state. It currently has no reliable automated test command. The existing root scripts `test.js` and `test_wa.js` are manual scripts and can contact external systems.

Refactoring without a behavioral safety net would make regressions difficult to distinguish from existing behavior.

## Decision

Introduce tests of the current behavior before structural refactoring.

Use Node.js's built-in `node:test` runner and keep the default command scoped to `test/`. Start with deterministic unit tests that do not require PostgreSQL, WhatsApp, Telegram, Groq, Gemini, or a running web server. Add integration tests only with an explicitly isolated test database and sanitized fixtures.

Do not introduce production interfaces or architectural layers solely to make the first tests easier. When current coupling prevents a meaningful test, record the limitation and introduce the smallest reversible seam in a later step.

Tests are permanent behavioral contracts. They may be moved or rewritten when responsibility changes, but they must not be removed merely because an implementation changes. Removal requires an explicit product-behavior decision and a documented reason.

## Positive consequences

- Refactoring regressions become detectable.
- Existing security behavior can be checked independently.
- Test execution is available without adding a framework dependency.
- External services cannot be contacted accidentally by the default test command.
- Current coupling and untestable boundaries become visible.

## Negative consequences

- Some current behaviors remain uncovered until narrow seams can be introduced.
- A few characterization tests may need to move when responsibilities are extracted.
- Integration tests will require a separate database setup and cleanup policy.
- Tests may preserve behavior that is technically imperfect until a deliberate product decision changes it.

## Status

Accepted for Phase 1.
