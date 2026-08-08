import {
    initAuthCreds,
    BufferJSON
} from '@whiskeysockets/baileys';

import { pool } from './database.js';

async function createAuthTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS auth_creds (
            id INTEGER PRIMARY KEY DEFAULT 1,
            data JSONB NOT NULL
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS auth_keys (
            type TEXT NOT NULL,
            key_id TEXT NOT NULL,
            data JSONB,
            PRIMARY KEY (type, key_id)
        )
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

async function getCreds() {
    const result = await pool.query(`
        SELECT data
        FROM auth_creds
        WHERE id = 1
    `);

    if (result.rows.length === 0) {
        return null;
    }

    return deserialize(
        JSON.stringify(result.rows[0].data)
    );
}

async function saveCredsData(creds) {
    if (!creds) {
        return;
    }

    const data = serialize(creds);

    await pool.query(`
        INSERT INTO auth_creds (id, data)
        VALUES ($1, $2::jsonb)
        ON CONFLICT (id)
        DO UPDATE SET data = EXCLUDED.data
    `, [1, data]);

    console.log('💾 Credentials sauvegardés');
}

async function getKeys(type, ids) {
    if (!ids || ids.length === 0) {
        return {};
    }

    const result = await pool.query(`
        SELECT key_id, data
        FROM auth_keys
        WHERE type = $1
        AND key_id = ANY($2)
    `, [type, ids]);

    const keys = {};

    for (const row of result.rows) {
        if (row.data === null) {
            keys[row.key_id] = null;
            continue;
        }

        keys[row.key_id] = deserialize(
            JSON.stringify(row.data)
        );
    }

    return keys;
}

async function setKeys(data) {
    for (const type of Object.keys(data)) {
        for (const keyId of Object.keys(data[type])) {
            const keyData = data[type][keyId];

            if (keyData === undefined) {
                continue;
            }

            const serialized = serialize(keyData);

            await pool.query(`
                INSERT INTO auth_keys (
                    type,
                    key_id,
                    data
                )
                VALUES ($1, $2, $3::jsonb)
                ON CONFLICT (type, key_id)
                DO UPDATE SET data = EXCLUDED.data
            `, [
                type,
                keyId,
                serialized
            ]);
        }
    }
}

export async function createAuthState() {
    await createAuthTables();

    let creds = await getCreds();

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
                return await getKeys(type, ids);
            },

            set: async (data) => {
                await setKeys(data);
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

            await saveCredsData(creds);
        }
    };
}

