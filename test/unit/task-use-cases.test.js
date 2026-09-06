import assert from 'node:assert/strict';
import test from 'node:test';

import { createTaskUseCases } from '../../application/use-cases/task-use-cases.js';

function createFakeRepository() {
    const calls = [];

    return {
        calls,
        async listPending(userId) {
            calls.push(['listPending', userId]);
            return [{ id: 4, description: 'Appeler Alice' }];
        },
        async complete(taskId, userId) {
            calls.push(['complete', taskId, userId]);
            return taskId === 4;
        }
    };
}

test('task use cases preserve the owner when listing and completing tasks', async () => {
    const repository = createFakeRepository();
    const useCases = createTaskUseCases({ taskRepository: repository });

    assert.deepEqual(await useCases.listPending('userA'), [
        { id: 4, description: 'Appeler Alice' }
    ]);
    assert.equal(await useCases.complete(4, 'userA'), true);
    assert.deepEqual(repository.calls, [
        ['listPending', 'userA'],
        ['complete', 4, 'userA']
    ]);
});

test('task use cases report an unknown task without changing repository behavior', async () => {
    const repository = createFakeRepository();
    const useCases = createTaskUseCases({ taskRepository: repository });

    assert.equal(await useCases.complete(99, 'userB'), false);
    assert.deepEqual(repository.calls, [['complete', 99, 'userB']]);
});
