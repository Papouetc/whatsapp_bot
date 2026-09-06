# Adapters

Adapters translate external systems into application-facing operations.

Current state:

```text
WhatsApp (Baileys) -> index.js handlers -> database/AI/services
Telegram polling   -> index.js handlers -> database/AI/services
Web                -> server.js/web-auth.js
```

The transport boundary is not complete yet. `whatsapp.js` still owns session
lifecycle and message callbacks. `telegram.js` still creates its polling bot at
module load when a token is present. These are known migration limits, not new
application behavior.

Target direction:

```text
WhatsApp adapter -> internal message/command -> use case
Telegram adapter -> internal command       -> use case
Web adapter     -> internal request        -> use case
```

Adapters must carry the canonical `userId` or an `ExecutionContext`; they must
not decide task, urgency, summary, or draft rules.
