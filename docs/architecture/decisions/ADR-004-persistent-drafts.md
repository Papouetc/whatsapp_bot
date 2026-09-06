# ADR-004: Persist drafts in PostgreSQL

## Context

Hakili previously stored response drafts in a module-level `Map` with a process-local `nextId`. A process restart lost pending drafts, and the state was not a durable multi-user source of truth.

## Problem

Drafts are user-owned business data. They must survive a restart and must never be returned or sent across user boundaries.

## Decision

Persist drafts in PostgreSQL with an explicit textual `user_id`, encrypted recipient/name/content, stable database-generated IDs, and a minimal `pending`/`sent` status. Every repository operation receives the owner `userId` and includes it in its SQL predicate.

Keep `drafts.js` as a compatibility facade. It creates through `DraftRepository`, reads pending drafts by owner, sends through the existing WhatsApp adapter, and marks the draft sent only after a successful send. The old `Map` and `nextId` are removed as sources of truth.

No ORM, Redis, distributed lock, or new AI behavior is introduced.

## Positive consequences

- Pending drafts survive process restarts.
- Database-generated IDs preserve the `/envoie <id>` shape.
- Cross-user reads and sends are blocked by scoped queries.
- A consumed draft is not eligible for a second send.
- Failed WhatsApp sends leave the draft available for retry.

## Negative consequences

- Draft operations are now asynchronous.
- A successful send followed by a database failure can still create a duplicate-send risk on retry.
- The current textual user scope is not yet a foreign-key relationship to `users.id`.
- A database migration is still performed from the existing startup initializer.

## Status

Accepted for Phase 4.
