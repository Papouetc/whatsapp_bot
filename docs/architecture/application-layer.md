# Application layer

Hakili is migrating incrementally toward this boundary:

```text
interface adapter -> application use case -> repository/provider
```

The application layer owns orchestration and user-scoped decisions. It does not own
PostgreSQL queries or transport SDK details.

The first extracted slice is the task flow:

```text
/taches, /fait
      |
      v
index.js composition root
      |
      v
application/use-cases/task-use-cases.js
      |
      v
TaskRepository port
      |
      v
database.js compatibility facade -> repositories/task-repository.js
```

`createTaskUseCases` accepts a small repository port. This keeps the extraction
reversible while existing consumers still use the database facade. The use case
always forwards the `userId` to the repository.

The settings flow now follows the same pattern through
`createSettingsUseCases`: the command handler formats the response, while the
use case forwards reads and writes through a small settings repository port.

The remaining command handlers stay in `index.js` until each flow has a similarly
small, testable boundary. No agent runtime, memory, tools, or skills are part of
this phase.
