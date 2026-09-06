import assert from 'node:assert/strict';
import test from 'node:test';

import { createSettingsUseCases } from '../../application/use-cases/settings-use-cases.js';

function createFakeRepository() {
    const calls = [];

    return {
        calls,
        async list(userId) {
            calls.push(['list', userId]);
            return { draft_mode: 'on' };
        },
        async set(key, value, userId) {
            calls.push(['set', key, value, userId]);
            return { key, value, userId };
        }
    };
}

test('settings use cases preserve the owner for reads and writes', async () => {
    const repository = createFakeRepository();
    const useCases = createSettingsUseCases({ settingsRepository: repository });

    assert.deepEqual(await useCases.list('userA'), { draft_mode: 'on' });
    assert.deepEqual(await useCases.set('draft_mode', 'off', 'userA'), {
        key: 'draft_mode',
        value: 'off',
        userId: 'userA'
    });
    assert.deepEqual(repository.calls, [
        ['list', 'userA'],
        ['set', 'draft_mode', 'off', 'userA']
    ]);
});
