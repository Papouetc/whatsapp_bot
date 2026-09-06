import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
    createSessionToken,
    hashPassword,
    parseCookies,
    readSessionToken,
    verifyPassword
} from '../../web-auth.js';

process.env.WEB_SESSION_SECRET = 'test-only-session-secret-with-at-least-32-characters';

test('password hashes verify correctly and do not expose the password', async () => {
    const password = 'test-password-not-a-secret';
    const storedHash = await hashPassword(password);

    assert.match(storedHash, /^scrypt:/);
    assert.notEqual(storedHash, password);
    assert.equal(await verifyPassword(password, storedHash), true);
    assert.equal(await verifyPassword('wrong-password', storedHash), false);
});

test('malformed password hashes are rejected', async () => {
    assert.equal(await verifyPassword('password', 'not-a-scrypt-hash'), false);
});

test('session tokens round-trip the user identity', () => {
    const token = createSessionToken('user:12');
    const session = readSessionToken(token);

    assert.equal(session.userId, 'user:12');
    assert.equal(Number.isSafeInteger(session.expiresAt), true);
});

test('tampered session tokens are rejected', () => {
    const token = createSessionToken('user:12');
    const [payload, signature] = token.split('.');

    assert.equal(readSessionToken(`${payload}.${signature}x`), null);
    assert.equal(readSessionToken(`${payload}x.${signature}`), null);
});

test('session tokens reject missing and legacy identities', () => {
    assert.throws(() => createSessionToken(), /invalide/);
    assert.throws(() => createSessionToken('legacy'), /invalide/);
});

test('malformed and expired session tokens are rejected', () => {
    assert.equal(readSessionToken('invalid-token'), null);

    const previousSecret = process.env.WEB_SESSION_SECRET;
    process.env.WEB_SESSION_SECRET = 'test-only-session-secret-with-at-least-32-characters';
    const expiredPayload = Buffer.from(JSON.stringify({
        userId: 'userA',
        expiresAt: 0
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', process.env.WEB_SESSION_SECRET)
        .update(expiredPayload)
        .digest('base64url');

    assert.equal(readSessionToken(`${expiredPayload}.${signature}`), null);
    process.env.WEB_SESSION_SECRET = previousSecret;
});

test('parseCookies decodes values and preserves current malformed-entry handling', () => {
    assert.deepEqual(
        parseCookies('hakili_session=abc%20123; malformed; theme=light'),
        { hakili_session: 'abc 123', malforme: 'malformed', theme: 'light' }
    );
});
