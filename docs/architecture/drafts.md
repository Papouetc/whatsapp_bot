# Persistent drafts

## Lifecycle

```text
generated -> pending -> sent
```

A draft is owned by exactly one explicit `userId`. `pending` drafts are available to `/envoie <id>`. After a successful WhatsApp send, the draft is marked `sent` and is no longer eligible for a second send.

## Persistence model

The `drafts` table contains:

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `SERIAL PRIMARY KEY` | Stable user-visible draft ID |
| `user_id` | `TEXT NOT NULL` | Logical owner; scoped on every repository operation |
| `recipient` | `TEXT NOT NULL` | Encrypted WhatsApp recipient |
| `sender_name` | `TEXT` | Encrypted display name when available |
| `content` | `TEXT NOT NULL` | Encrypted proposed response |
| `status` | `TEXT NOT NULL` | `pending` or `sent` |
| `created_at` | `TIMESTAMPTZ` | Creation time |
| `updated_at` | `TIMESTAMPTZ` | Last lifecycle update |

The existing schema uses textual logical user IDs and does not define a foreign key to the integer `users.id`. The repository therefore enforces ownership through explicit `user_id` predicates while the broader identity/schema migration remains pending.

The `(user_id, status)` index supports pending-draft lookup. No source-message column was added because the current application does not provide or use one in the draft API.

## Repository contract

[DraftRepository](../../repositories/draft-repository.js) provides:

- `create(draft, userId)`;
- `findPendingById(id, userId)`;
- `listPending(userId)`;
- `markSent(id, userId)`.

Missing, empty, and `legacy` owners are rejected. A draft lookup always includes both its ID and owner.

## Compatibility

[drafts.js](../../drafts.js) remains the temporary application facade. `addDraft` is now asynchronous and delegates to PostgreSQL. `handleDraftCommand` reads by owner, sends through the existing WhatsApp adapter, then marks the draft as sent. The old process-level `Map` and `nextId` are no longer used.

If WhatsApp sending fails, `markSent` is not called and the draft remains pending for another attempt. If sending succeeds but marking fails, a duplicate-send risk remains and is intentionally documented rather than replaced with distributed locking in this phase.

Logs contain only the owner ID and draft ID. Draft content is never logged.
