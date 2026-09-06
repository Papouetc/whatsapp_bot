# ADR-002: Canonical Hakili user identity

## Context

Hakili accepts web, WhatsApp, and Telegram traffic while its data layer still receives several external identifiers directly. Web sessions use `web:<id>`, Telegram handlers previously forwarded the Telegram ID as `userId`, and WhatsApp pairing stored the JID by searching only `telegram_user_id`.

## Problem

External identities and technical session state can be confused with the Hakili user identity. In particular, a web account can authenticate successfully but fail to persist its WhatsApp JID because it has no `telegram_user_id`.

## Decision

`user:<database id>` is the canonical internal user ID for new web and Telegram flows. Email, Telegram IDs, WhatsApp JIDs, phone numbers, and sockets remain external identities or technical state.

The web and Telegram adapters resolve their database row before forwarding the user ID. WhatsApp association updates the user row by internal database ID for canonical IDs, while retaining compatibility lookup for existing `web:<id>` and raw Telegram IDs.

A small `ExecutionContext` validates the explicit `userId` and source at boundaries where context is introduced. Defaults using `legacy` remain temporarily for compatibility and are migration targets, not canonical identities.

## Consequences

### Positive

- User isolation has one explicit internal key for new channel flows.
- Web pairing no longer depends on a Telegram identity.
- Future channels can map external identities through the users table.
- Missing context fails explicitly at the new context boundary.

### Negative

- Existing data keyed by raw Telegram IDs or `web:<id>` needs a later migration strategy.
- Existing functions still expose legacy defaults until later phases.
- The full application is not yet context-first; this ADR establishes the boundary incrementally.

## Status

Accepted for Phase 2.
