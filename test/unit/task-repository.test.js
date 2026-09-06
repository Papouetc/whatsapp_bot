import assert from 'node:assert/strict';
import test from 'node:test';

import { createTaskRepository } from '../../repositories/task-repository.js';

function createFakePool() {
    const rows = [];
    let nextId = 1;

    return {
        rows,
        async query(sql, values = []) {
            if (sql.includes('INSERT INTO tasks')) {
                const [description, chatId, sender, detectedAt, userId] = values;
                rows.push({
                    id: nextId++,
                    description,
                    chat_id: chatId,
                    sender,
                    detected_at: detectedAt,
                    done: false,
                    user_id: userId
                });
                return { rows: [] };
            }

            if (sql.startsWith('SELECT * FROM tasks')) {
                const [userId] = values;
                return {
                    rows: rows
                        .filter(row => !row.done && row.user_id === userId)
                        .sort((a, b) => b.detected_at - a.detected_at)
                };
            }

            if (sql.startsWith('SELECT id FROM tasks')) {
                const [id, userId, done] = values;
                return {
                    rows: rows.filter(row => (
                        row.id === id
                        && row.user_id === userId
                        && row.done === done
                    )).map(row => ({ id: row.id }))
                };
            }

            if (sql.startsWith('UPDATE tasks')) {
                const [done, id, userId] = values;
                const row = rows.find(item => item.id === id && item.user_id === userId);
                if (row) {
                    row.done = done;
                }
                return { rows: [] };
            }

            throw new Error(`Unexpected SQL in fake pool: ${sql}`);
        }
    };
}

function createRepository() {
    return createTaskRepository({
        pool: createFakePool(),
        encryptText: value => `encrypted:${value}`,
        decryptText: value => value?.startsWith('encrypted:')
            ? value.slice('encrypted:'.length)
            : null
    });
}

test('TaskRepository isolates pending tasks by user', async () => {
    const pool = createFakePool();
    const repository = createTaskRepository({
        pool,
        encryptText: value => `encrypted:${value}`,
        decryptText: value => value?.startsWith('encrypted:')
            ? value.slice('encrypted:'.length)
            : null
    });

    await repository.createMany([
        { description: 'Tâche A', chatId: 'chat-a', sender: 'sender-a' }
    ], 'userA');
    await repository.createMany([
        { description: 'Tâche B', chatId: 'chat-b', sender: 'sender-b' }
    ], 'userB');

    assert.deepEqual(
        (await repository.listPending('userA')).map(task => task.description),
        ['Tâche A']
    );
    assert.deepEqual(
        (await repository.listPending('userB')).map(task => task.description),
        ['Tâche B']
    );
});

test('a user cannot complete another user task', async () => {
    const pool = createFakePool();
    const repository = createTaskRepository({
        pool,
        encryptText: value => `encrypted:${value}`,
        decryptText: value => value?.startsWith('encrypted:')
            ? value.slice('encrypted:'.length)
            : null
    });

    await repository.createMany([{ description: 'Tâche privée' }], 'userA');
    const taskId = pool.rows[0].id;

    assert.equal(await repository.complete(taskId, 'userB'), false);
    assert.equal((await repository.listPending('userA')).length, 1);
    assert.equal(await repository.complete(taskId, 'userA'), true);
    assert.equal((await repository.listPending('userA')).length, 0);
});

test('user-scoped task operations reject missing user IDs', async () => {
    const repository = createRepository();

    await assert.rejects(
        () => repository.listPending(),
        /userId.*obligatoire/
    );
    await assert.rejects(
        () => repository.createMany([{ description: 'Task' }], ''),
        /userId.*obligatoire/
    );
    await assert.rejects(
        () => repository.complete(1, null),
        /userId.*obligatoire/
    );
});
