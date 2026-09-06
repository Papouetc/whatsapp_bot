# AI provider boundary

`ai.js` currently combines provider calls, fallback selection, prompts, and
application-specific AI tasks. This is intentionally retained for now to avoid a
large rewrite.

The desired incremental boundary is:

```text
use case -> AI task/service -> AIProvider
                              |-> Groq
                              `-> Gemini fallback
```

A provider should expose a small generation capability and should not decide
whether a message is urgent, a task should be created, or a draft should be sent.
The existing Groq/Gemini fallback behavior must remain unchanged while the
provider seam is extracted.

Every future provider call must retain the requesting `userId` in its execution
context and must not log message content, drafts, credentials, or tokens.
