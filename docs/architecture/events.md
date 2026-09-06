# Local events

No event bus is introduced yet. The critical paths remain explicit function
calls so that the current behavior stays easy to trace.

When an event reduces real coupling, a local `EventEmitter` may be introduced
for narrow side effects such as notifications or archival work:

```text
adapter -> application use case -> primary result
                                  `-> optional local event
```

External brokers, queues, CQRS, and event sourcing are out of scope. An event
must carry an explicit `userId` or `ExecutionContext`; it must never rely on a
process-global or implicit legacy owner.
