# ADR-003: Incremental persistence repositories

## Context

`database.js` currently combines PostgreSQL initialization, migrations, encryption, users, identities, messages, tasks, settings, WhatsApp credentials, and deletion. This makes simple user-scoped behavior difficult to test without PostgreSQL.

## Problem

Business-facing modules depend on a broad database module and indirectly depend on PostgreSQL details. Moving everything at once would create a large regression surface.

## Decision

Introduce repositories incrementally by persistence responsibility, starting with tasks and settings. Each repository receives its database pool and required utilities, requires an explicit non-empty `userId`, and uses parameterized SQL. Existing exports in `database.js` remain compatibility facades during migration.

No ORM is added because the current SQL and PostgreSQL pool are sufficient. Migrations remain in `database.js` for now. Repositories do not contain AI, channel, UI, or schema initialization logic.

## Consequences

### Positive

- Task and settings isolation can be tested with fake pools.
- Existing consumers keep their current imports and behavior.
- PostgreSQL details begin to leave the broad database facade.
- Cross-user mutation checks become explicit.

### Negative

- `database.js` remains during a transition period.
- Some responsibilities still use direct SQL.
- Repository construction currently happens in the database module until composition is extracted later.
- Integration tests still require a separately configured PostgreSQL database.

## Status

Accepted for Phase 3.
