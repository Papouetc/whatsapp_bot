import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'v1';

function getEncryptionKey() {
    const rawKey = process.env.WA_AUTH_ENCRYPTION_KEY;

    if (!rawKey) {
        throw new Error(
            'WA_AUTH_ENCRYPTION_KEY manquante : définissez une clé hexadécimale de 64 caractères ou Base64 de 32 octets.'
        );
    }

    let key;

    if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
        key = Buffer.from(rawKey, 'hex');
    } else {
        try {
            key = Buffer.from(rawKey, 'base64');
        } catch {
            key = null;
        }
    }

    if (!key || key.length !== 32) {
        throw new Error(
            'WA_AUTH_ENCRYPTION_KEY invalide : utilisez une clé hexadécimale de 64 caractères ou Base64 de 32 octets.'
        );
    }

    return key;
}

export function validateEncryptionKey() {
    getEncryptionKey();
}

export function hashText(value) {
    return crypto
        .createHmac('sha256', getEncryptionKey())
        .update(String(value), 'utf8')
        .digest('hex');
}

export function encryptText(plainText) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(String(plainText), 'utf8'),
        cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    return [
        PREFIX,
        iv.toString('base64url'),
        tag.toString('base64url'),
        encrypted.toString('base64url')
    ].join(':');
}

export function decryptText(payload) {
    if (typeof payload !== 'string' || !payload.startsWith(PREFIX)) {
        return null;
    }

    const [version, ivText, tagText, encryptedText] = payload.split(':');

    if (version !== 'v1' || !ivText || !tagText || encryptedText === undefined) {
        throw new Error('Donnée chiffrée invalide');
    }

    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        getEncryptionKey(),
        Buffer.from(ivText, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));

    return Buffer.concat([
        decipher.update(Buffer.from(encryptedText, 'base64url')),
        decipher.final()
    ]).toString('utf8');
}
