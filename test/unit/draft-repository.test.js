import assert from 'node:assert/strict';
import test from 'node:test';

import { createDraftRepository } from '../../repositories/draft-repository.js';

function createFakePool() {
    const rows = [];
    let nextId = 1;

    return {
        rows,
        async query(sql, values = []) {
            if (sql.startsWith('INSERT INTO drafts')) {
                const [userId, recipient, senderName, content] = values;
                const now = new Date().toISOString();
                const row = {
                    id: nextId++,
                    user_id: userId,
                    recipient,
                    sender_name: senderName,
                    content,
                    status: 'pending',
                    created_at: now,
                    updated_at: now
                };
                rows.push(row);
                return { rows: [row] };
            }

            if (sql.includes('FROM drafts') && sql.includes('id = $1')) {
                const [id, userId] = values;
                return {
                    rows: rows.filter(row => (
                        row.id === id
                        && row.user_id === userId
                        && row.status === 'pending'
                    ))
                };
            }

            if (sql.includes('FROM drafts') && sql.includes('user_id = $1')) {
                const [userId] = values;
                return {
                    rows: rows.filter(row => row.user_id === userId && row.status === 'pending')
                };
            }

            if (sql.startsWith('UPDATE drafts')) {
                const [id, userId] = values;
                const row = rows.find(item => (
                    item.id === id
                    && item.user_id === userId
                    && item.status === 'pending'
                ));
                if (!row) {
                    return { rows: [] };
                }
                row.status = 'sent';
                row.updated_at = new Date().toISOString();
                return { rows: [{ id: row.id }] };
            }

            throw new Error(`Unexpected SQL in fake pool: ${sql}`);
        }
    };
}

function createRepository(pool) {
    return createDraftRepository({
        pool,
        encryptText: value => `encrypted:${value}`,
        decryptText: value => value?.startsWith('encrypted:')
            ? value.slice('encrypted:'.length)
            : null
    });
}

test('DraftRepository creates and reads a draft for its owner', async () => {
    const pool = createFakePool();
    const repository = createRepository(pool);
    const created = await repository.create({
        sender: 'contact-a',
        sender_name: 'Contact A',
        content: 'Réponse proposée'
    }, 'userA');

    assert.equal(created.id, 1);
    assert.equal(created.userId, 'userA');
    assert.equal(created.content, 'Réponse proposée');
    assert.equal((await repository.findPendingById(created.id, 'userA')).sender, 'contact-a');
});

test('DraftRepository prevents cross-user access', async () => {
    const pool = createFakePool();
    const repository = createRepository(pool);
    const draft = await repository.create({
        sender: 'contact-a',
        content: 'Privé'
    }, 'userA');

    assert.equal(await repository.findPendingById(draft.id, 'userB'), null);
    assert.deepEqual(await repository.listPending('userB'), []);
});

test('a new repository instance can recover a persisted draft', async () => {
    const pool = createFakePool();
    const first = createRepository(pool);
    const draft = await first.create({ sender: 'contact-a', content: 'À reprendre' }, 'userA');

    const afterRestart = createRepository(pool);
    const recovered = await afterRestart.findPendingById(draft.id, 'userA');

    assert.equal(recovered.content, 'À reprendre');
});

test('markSent prevents a draft from being consumed twice', async () => {
    const pool = createFakePool();
    const repository = createRepository(pool);
    const draft = await repository.create({ sender: 'contact-a', content: 'Une fois' }, 'userA');

    assert.equal(await repository.markSent(draft.id, 'userA'), true);
    assert.equal(await repository.markSent(draft.id, 'userA'), false);
    assert.equal(await repository.findPendingById(draft.id, 'userA'), null);
});

test('DraftRepository rejects legacy and missing owners', async () => {
    const repository = createRepository(createFakePool());

    await assert.rejects(
        () => repository.create({ sender: 'contact', content: 'Texte' }, 'legacy'),
        /userId.*obligatoire/
    );
    await assert.rejects(
        () => repository.listPending(),
        /userId.*obligatoire/
    );
});
