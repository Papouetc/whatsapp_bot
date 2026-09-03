import crypto from 'node:crypto';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function getSessionKey() {
    const value = process.env.WEB_SESSION_SECRET;

    if (!value || value.length < 32) {
        throw new Error('WEB_SESSION_SECRET doit contenir au moins 32 caractères');
    }

    return value;
}

export function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16);

        crypto.scrypt(password, salt, 64, (error, derivedKey) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(`scrypt:${salt.toString('base64url')}:${derivedKey.toString('base64url')}`);
        });
    });
}

export function verifyPassword(password, storedHash) {
    return new Promise((resolve, reject) => {
        const [algorithm, saltText, hashText] = String(storedHash || '').split(':');

        if (algorithm !== 'scrypt' || !saltText || !hashText) {
            resolve(false);
            return;
        }

        crypto.scrypt(password, Buffer.from(saltText, 'base64url'), 64, (error, derivedKey) => {
            if (error) {
                reject(error);
                return;
            }

            const expected = Buffer.from(hashText, 'base64url');
            resolve(expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey));
        });
    });
}

export function createSessionToken(userId) {
    const payload = Buffer.from(JSON.stringify({
        userId,
        expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', getSessionKey())
        .update(payload)
        .digest('base64url');

    return `${payload}.${signature}`;
}

export function readSessionToken(token) {
    try {
        const [payload, signature] = String(token || '').split('.');
        if (!payload || !signature) return null;

        const expected = crypto.createHmac('sha256', getSessionKey())
            .update(payload)
            .digest('base64url');
        const actualBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expected);

        if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
            return null;
        }

        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return data.expiresAt > Math.floor(Date.now() / 1000) ? data : null;
    } catch {
        return null;
    }
}

export function parseCookies(header = '') {
    return Object.fromEntries(header.split(';').filter(Boolean).map((part) => {
        const index = part.indexOf('=');
        return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
    }));
}