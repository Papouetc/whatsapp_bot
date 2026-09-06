# Hakili identity model

## Canonical identity

`userId` is the canonical internal identity of a Hakili user. New persisted users use the form `user:<database id>`.

An email address, Telegram user ID, WhatsApp JID, phone number, or WhatsApp socket is not a Hakili user identity. They are external identities or technical session state associated with a user.

## External identities

```text
Hakili userId
  |-- web account (email)
  |-- WhatsApp identity (JID)
  `-- Telegram identity (telegram_user_id and chat id)
```

The database `users.id` is the stable source for new canonical IDs. Existing `web:<id>` IDs remain readable during migration, and existing raw Telegram IDs remain supported by compatibility lookup where required.

## Mapping rules

```text
web session       -> canonical userId
Telegram user ID  -> database users row -> canonical userId
WhatsApp session  -> explicit userId -> WhatsApp JID stored on that user row
```

The web pairing flow uses the authenticated session userId. WhatsApp connection state is attached to that userId and no longer requires a matching `telegram_user_id` for web accounts.

## Execution context

[execution-context.js](../../execution-context.js) defines the small context used at important boundaries:

```text
ExecutionContext
  - userId
  - source
  - conversationId (optional)
  - messageId (optional)
  - requestId (optional)
  - sessionId (optional)
```

Sources currently supported are `web`, `whatsapp`, `telegram`, `scheduler`, and `system`. A context without a non-empty `userId` fails explicitly.

## Legacy compatibility

`legacy` is retained temporarily for the historical single-user mode. It is not a valid canonical user identity and must not be selected for an unknown external identity. Defaults using it remain migration targets for later phases.

Compatibility lookup accepts existing `web:<id>` values and raw Telegram IDs while new Telegram and web flows use `user:<database id>`.

## Prohibited identity shortcuts

Never use these as the primary business identity:

- `legacy`;
- `PHONE_NUMBER`;
- Telegram user ID;
- WhatsApp JID;
- WhatsApp socket/session;
- email address;
- a global or singleton current-user variable;
- the first or last user found in the database.
