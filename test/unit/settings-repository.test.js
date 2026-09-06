import assert from 'node:assert/strict';
import test from 'node:test';

import { createSettingsRepository } from '../../repositories/settings-repository.js';

function createFakePool() {
    const rows = [];

    return {
        rows,
        async query(sql, values = []) {
            if (sql.startsWith('SELECT value FROM settings')) {
                const [key, userId] = values;
                return { rows: rows.filter(row => row.key === key && row.user_id === userId) };
            }

            if (sql.startsWith('SELECT key, value FROM settings')) {
                const [userId] = values;
                return { rows: rows.filter(row => row.user_id === userId) };
            }

            if (sql.startsWith('INSERT INTO settings')) {
                const [key, userId, value] = values;
                const existing = rows.find(row => row.key === key && row.user_id === userId);
                if (existing) {
                    existing.value = value;
                } else {
                    rows.push({ key, user_id: userId, value });
                }
                return { rows: [] };
            }

            throw new Error(`Unexpected SQL in fake pool: ${sql}`);
        }
    };
}

test('SettingsRepository isolates values and preserves defaults', async () => {
    const repository = createSettingsRepository({
        pool: createFakePool(),
        defaults: { draft_mode: 'on', summary_hour: '22' }
    });

    await repository.set('draft_mode', 'off', 'userA');
    await repository.set('draft_mode', 'on', 'userB');

    assert.equal(await repository.get('draft_mode', 'userA'), 'off');
    assert.equal(await repository.get('draft_mode', 'userB'), 'on');
    assert.equal(await repository.get('summary_hour', 'userA'), '22');
    assert.deepEqual(await repository.getAll('userA'), {
        draft_mode: 'off',
        summary_hour: '22'
    });
});

test('user-scoped settings reject missing user IDs', async () => {
    const repository = createSettingsRepository({
        pool: createFakePool(),
        defaults: { draft_mode: 'on' }
    });

    await assert.rejects(
        () => repository.getAll(),
        /userId.*obligatoire/
    );
    await assert.rejects(
        () => repository.set('draft_mode', 'off', ''),
        /userId.*obligatoire/
    );
});
