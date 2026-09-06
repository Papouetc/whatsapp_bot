# Persistence repositories

## Purpose

Repositories encapsulate PostgreSQL queries and map database rows to application data. They provide a small, testable boundary around persistence without introducing an ORM or changing the schema.

## Current repositories

- `repositories/task-repository.js`: create, list pending, and complete tasks with explicit `userId` scope.
- `repositories/settings-repository.js`: read, write, and list user settings while preserving current defaults.

The public functions in `database.js` remain temporary compatibility facades. They delegate task and settings persistence to these repositories, so existing consumers can migrate incrementally.

## Responsibilities

Repositories may contain:

- parameterized SQL;
- database row mapping;
- encryption/decryption at the persistence boundary when the existing schema requires it;
- a transaction when one operation spans several writes.

Repositories must not contain:

- AI prompts or provider selection;
- WhatsApp or Telegram behavior;
- UI formatting;
- complex business rules;
- schema creation or migrations.

## User isolation

Every user-scoped method requires an explicit non-empty `userId`. The temporary compatibility value `legacy` is still accepted by the old facade, but it is not a default inside repository methods and is not a canonical user identity.

Every SQL read, update, and insert that handles tasks or settings includes the owner scope. A repository test must verify both positive isolation and cross-user mutation rejection.

## Migration rule

Extract one coherent persistence responsibility at a time. Keep the old `database.js` function as a facade until all consumers are migrated and characterization tests cover the behavior. Do not extract migrations into repositories during this phase.
