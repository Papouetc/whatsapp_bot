import assert from 'node:assert/strict';
import test from 'node:test';

import {
    decryptText,
    encryptText,
    hashText,
    validateEncryptionKey
} from '../../encryption.js';

const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

process.env.WA_AUTH_ENCRYPTION_KEY = TEST_KEY;

test('encryption key validation accepts a 32-byte hexadecimal key', () => {
    assert.doesNotThrow(() => validateEncryptionKey());
});

test('encryptText and decryptText round-trip plaintext', () => {
    const plaintext = 'message de test sans donnees reelles';
    const encrypted = encryptText(plaintext);

    assert.notEqual(encrypted, plaintext);
    assert.equal(decryptText(encrypted), plaintext);
});

test('encryptText uses a fresh IV for repeated plaintext', () => {
    const first = encryptText('same value');
    const second = encryptText('same value');

    assert.notEqual(first, second);
    assert.equal(decryptText(first), 'same value');
    assert.equal(decryptText(second), 'same value');
});

test('decryptText returns null for legacy plaintext', () => {
    assert.equal(decryptText('ancien texte'), null);
});

test('hashText is deterministic without exposing plaintext', () => {
    const first = hashText('contact-test');
    const second = hashText('contact-test');

    assert.equal(first, second);
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.notEqual(first, 'contact-test');
});

test('invalid encryption key is rejected', () => {
    const previousKey = process.env.WA_AUTH_ENCRYPTION_KEY;
    process.env.WA_AUTH_ENCRYPTION_KEY = 'invalid';

    assert.throws(() => validateEncryptionKey(), /invalide/);

    process.env.WA_AUTH_ENCRYPTION_KEY = previousKey;
});
