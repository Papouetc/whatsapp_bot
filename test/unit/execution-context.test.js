import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createCanonicalUserId,
    createExecutionContext,
    getDatabaseUserId,
    isLegacyUserId,
    SOURCES
} from '../../src/application/execution-context.js';

test('canonical user IDs are derived from positive database IDs', () => {
    assert.equal(createCanonicalUserId(12), 'user:12');
    assert.equal(getDatabaseUserId('user:12'), 12);
    assert.equal(getDatabaseUserId('web:12'), 12);
});

test('invalid internal user IDs are rejected', () => {
    assert.throws(() => createCanonicalUserId(0), /invalide/);
    assert.throws(() => createCanonicalUserId('not-a-number'), /invalide/);
    assert.equal(getDatabaseUserId('telegram:12'), null);
});

test('execution context requires an explicit user and known source', () => {
    const context = createExecutionContext({
        userId: 'user:12',
        source: 'telegram',
        conversationId: 'chat:12',
        messageId: 'message:1'
    });

    assert.deepEqual(context, {
        userId: 'user:12',
        source: 'telegram',
        conversationId: 'chat:12',
        messageId: 'message:1',
        requestId: null,
        sessionId: null
    });
    assert.equal(Object.isFrozen(context), true);
});

test('execution context rejects missing identity and unknown sources', () => {
    assert.throws(
        () => createExecutionContext({ source: 'telegram' }),
        /userId.*obligatoire/
    );
    assert.throws(
        () => createExecutionContext({ userId: 'user:12', source: 'unknown' }),
        /Source.*inconnue/
    );
});

test('only declared transport and execution sources are accepted', () => {
    assert.deepEqual(
        [...SOURCES].sort(),
        ['scheduler', 'system', 'telegram', 'web', 'whatsapp']
    );
    assert.equal(isLegacyUserId('legacy'), true);
    assert.equal(isLegacyUserId('user:12'), false);
});
