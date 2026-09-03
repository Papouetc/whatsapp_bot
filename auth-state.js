import {
    initAuthCreds,
    BufferJSON
} from '@whiskeysockets/baileys';

import { pool } from './database.js';
import {
    decryptText,
    encryptText,
    validateEncryptionKey
} from './encryption.js';

async function createAuthTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS auth_creds (
            user_id TEXT PRIMARY KEY,
            data JSONB NOT NULL
        )
    `);

    await pool.query(`
        ALTER TABLE auth_creds
        ADD COLUMN IF NOT EXISTS user_id TEXT
    `);

    await pool.query(`
        UPDATE auth_creds
        SET user_id = 'legacy'
        WHERE user_id IS NULL
    `);

    await pool.query(`
        ALTER TABLE auth_creds
        ALTER COLUMN user_id SET NOT NULL
    `);

    await pool.query(`
        ALTER TABLE auth_creds
        DROP CONSTRAINT IF EXISTS auth_creds_pkey
    `);

    await pool.query(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'auth_creds'
                  AND column_name = 'id'
            ) THEN
                ALTER TABLE auth_creds ALTER COLUMN id DROP NOT NULL;
            END IF;
        END $$;
    `);

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS auth_creds_user_id_key
        ON auth_creds (user_id)
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS auth_keys (
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            key_id TEXT NOT NULL,
            data JSONB,
            PRIMARY KEY (user_id, type, key_id)
        )
    `);

    await pool.query(`
        ALTER TABLE auth_keys
        ADD COLUMN IF NOT EXISTS user_id TEXT
    `);

    await pool.query(`
        UPDATE auth_keys
        SET user_id = 'legacy'
        WHERE user_id IS NULL
    `);

    await pool.query(`
        ALTER TABLE auth_keys
        ALTER COLUMN user_id SET NOT NULL
    `);

    await pool.query(`
        ALTER TABLE auth_keys
        DROP CONSTRAINT IF EXISTS auth_keys_pkey
    `);

    await pool.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'auth_keys_pkey'
            ) THEN
                ALTER TABLE auth_keys
                ADD PRIMARY KEY (user_id, type, key_id);
            END IF;
        END $$;
    `);
}

function serialize(data) {
    return JSON.stringify(data, BufferJSON.replacer);
}

function deserialize(data) {
    if (data === null || data === undefined) {
        return null;
    }

    return JSON.parse(data, BufferJSON.reviver);
}

function readStored(data) {
    if (typeof data === 'string') {
        const decrypted = decryptText(data);

        if (decrypted !== null) {
            return {
                value: deserialize(decrypted),
                encrypted: true
            };
        }
    }

    return {
        value: deserialize(JSON.stringify(data)),
        encrypted: false
    };
}

async function getCreds(userId) {
    const result = await pool.query(`
        SELECT data
        FROM auth_creds
        WHERE user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
        return null;
    }

    const stored = readStored(result.rows[0].data);

    if (!stored.encrypted) {
        await saveCredsData(userId, stored.value);
    }

    return stored.value;
}

async function saveCredsData(userId, creds) {
    if (!creds) {
        return;
    }

    const data = JSON.stringify(
        encryptText(serialize(creds))
    );

    await pool.query(`
        INSERT INTO auth_creds (user_id, data)
        VALUES ($1, $2::jsonb)
        ON CONFLICT (user_id)
        DO UPDATE SET data = EXCLUDED.data
    `, [userId, data]);

    console.log('💾 Credentials sauvegardés');
}

async function getKeys(userId, type, ids) {
    if (!ids || ids.length === 0) {
        return {};
    }

    const result = await pool.query(`
        SELECT key_id, data
        FROM auth_keys
        WHERE user_id = $1
        AND type = $2
        AND key_id = ANY($3)
    `, [userId, type, ids]);

    const keys = {};
    const legacyKeys = {};

    for (const row of result.rows) {
        if (row.data === null) {
            keys[row.key_id] = null;
            continue;
        }

        const stored = readStored(row.data);
        keys[row.key_id] = stored.value;

        if (!stored.encrypted) {
            if (!legacyKeys[type]) {
                legacyKeys[type] = {};
            }

            legacyKeys[type][row.key_id] = stored.value;
        }
    }

    if (Object.keys(legacyKeys).length > 0) {
        await setKeys(userId, legacyKeys);
    }

    return keys;
}

async function setKeys(userId, data) {
    for (const type of Object.keys(data)) {
        for (const keyId of Object.keys(data[type])) {
            const keyData = data[type][keyId];

            if (keyData === undefined) {
                continue;
            }

            const serialized = JSON.stringify(
                encryptText(serialize(keyData))
            );

            await pool.query(`
                INSERT INTO auth_keys (
                    user_id,
                    type,
                    key_id,
                    data
                )
                VALUES ($1, $2, $3, $4::jsonb)
                ON CONFLICT (user_id, type, key_id)
                DO UPDATE SET data = EXCLUDED.data
            `, [
                userId,
                type,
                keyId,
                serialized
            ]);
        }
    }
}

export async function createAuthState(userId = 'legacy') {
    if (typeof userId !== 'string' || !userId.trim()) {
        throw new Error('userId WhatsApp invalide');
    }

    userId = userId.trim();
    validateEncryptionKey();
    await createAuthTables();

    let creds = await getCreds(userId);

    if (!creds) {
        console.log(
            '🆕 Aucun compte WhatsApp trouvé dans Supabase'
        );

        creds = initAuthCreds();
    } else {
        console.log(
            '♻️ Credentials WhatsApp restaurés depuis Supabase'
        );
    }

    return {
        creds,

        keys: {
            get: async (type, ids) => {
                return await getKeys(userId, type, ids);
            },

            set: async (data) => {
                await setKeys(userId, data);
            }
        },

        saveCreds: async (updatedCreds) => {
            if (!updatedCreds) {
                return;
            }

            creds = {
                ...creds,
                ...updatedCreds
            };

            await saveCredsData(userId, creds);
        }
    };
}

