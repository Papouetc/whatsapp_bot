# ADR-005: Progressive application boundaries

- Status: accepted
- Date: 2026-09-05

## Decision

Hakili will separate interfaces, application orchestration, and infrastructure
progressively inside the existing modular monolith.

The first Phase 4 extraction introduces `application/use-cases/task-use-cases.js`.
It receives a small repository port and preserves the existing database facade as
the composition-root adapter.

## Why

The current `index.js` combines transport callbacks, command routing, business
orchestration, persistence, AI calls, and notifications. Small use-case modules
make behavior testable and reduce the number of details known by each layer.

## Why not microservices

The product does not need distributed deployment, brokers, or the operational
complexity of microservices. A modular monolith is sufficient for the current
scale and keeps user-scoped operations local and observable.

## Why progressive file reorganization

Directories should reflect real responsibility boundaries. Moving every legacy
file at once would create import churn without reducing coupling. Files move only
when a responsibility has been extracted and its consumers are known.

## Consequences

- Existing exports and compatibility facades remain during migration.
- Each extracted use case gets focused tests with fake dependencies.
- `userId` remains explicit at every repository boundary.
- Telegram polling and other module-load side effects remain tracked migration debt
  until an adapter factory can be introduced without changing startup behavior.
