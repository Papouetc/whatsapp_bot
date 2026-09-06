# Hakili testing strategy

## Run tests

Run the automated suite with:

```bash
npm test
```

On Windows PowerShell, use `npm.cmd test` if the PowerShell execution policy blocks `npm.ps1`.

The test script is intentionally scoped to `test/`. The root files `test.js` and `test_wa.js` are legacy manual scripts and are not automated tests. They can connect to PostgreSQL or WhatsApp and must not run as part of the default suite.

## Current test categories

- `test/unit/`: deterministic tests that do not call external services or PostgreSQL.
- `test/integration/`: reserved for tests that use an explicitly isolated local test database.
- `test/fixtures/`: reserved for sanitized WhatsApp, AI, and persistence fixtures.
- `test/fakes/`: reserved for test doubles when a behavior can be tested without a real provider.

The unit tests cover encryption, password hashing, web session tokens, cookie parsing,
the active command-dispatch boundary, draft persistence, and the extracted task use
case.

## External dependencies

The current production modules are tightly coupled to PostgreSQL, Baileys, Telegram, and the AI providers. The Phase 1 unit tests do not import paths that start those services. No real API key, WhatsApp account, Telegram bot, or user conversation is used.

Integration tests must use a dedicated local database and sanitized identifiers. They must never use the development database or a real account. They should be opt-in until the isolation and cleanup strategy is implemented.

## Environment variables

The current unit tests override `WA_AUTH_ENCRYPTION_KEY` and `WEB_SESSION_SECRET` with test-only values. They do not require `DATABASE_URL`, provider API keys, Telegram credentials, or WhatsApp credentials.

## Current limits

The following behaviors are not yet safely isolated from production dependencies:

- PostgreSQL message, task, settings, credential, and deletion flows;
- the full draft send flow, because `drafts.js` still imports channel adapters directly;
- WhatsApp message classification, because the relevant function is private and the module owns the Baileys session;
- the real command effects in `index.js`, because the dispatcher directly imports database, AI, WhatsApp, Telegram, and scheduler modules;
- Groq/Gemini fallback behavior, because provider calls are private functions in `ai.js`;
- scheduler behavior and reconnection timers.

Draft repository behavior is covered independently with fake pools. The Telegram
adapter now starts polling only from `startTelegramListener`; the full draft send
flow is still avoided because `drafts.js` directly imports channel adapters and
does not yet expose injectable ports.

These limits are recorded rather than hidden. They are candidates for the next phase, where narrow seams can be introduced without changing product behavior.

## Test preservation rule

Tests are part of Hakili's behavioral contract. Keep a test when the behavior still exists. Move or rewrite it when responsibility changes. Delete it only when the product behavior is intentionally removed, and document that reason before deletion.
