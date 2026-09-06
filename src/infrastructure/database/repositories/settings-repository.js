function requireUserId(userId) {
    if (typeof userId !== 'string' || !userId.trim()) {
        throw new Error('SettingsRepository.userId est obligatoire');
    }

    return userId.trim();
}

export function createSettingsRepository({ pool, defaults }) {
    if (!pool || typeof pool.query !== 'function') {
        throw new Error('SettingsRepository.pool est obligatoire');
    }

    if (!defaults || typeof defaults !== 'object') {
        throw new Error('SettingsRepository.defaults sont obligatoires');
    }

    return {
        async get(key, userId) {
            const ownerId = requireUserId(userId);
            const result = await pool.query(
                'SELECT value FROM settings WHERE key = $1 AND user_id = $2',
                [key, ownerId]
            );

            if (result.rows.length === 0) {
                return Object.prototype.hasOwnProperty.call(defaults, key)
                    ? defaults[key]
                    : null;
            }

            return result.rows[0].value;
        },

        async set(key, value, userId) {
            const ownerId = requireUserId(userId);
            await pool.query(
                `INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
                [key, ownerId, String(value)]
            );
        },

        async getAll(userId) {
            const ownerId = requireUserId(userId);
            const result = await pool.query(
                'SELECT key, value FROM settings WHERE user_id = $1',
                [ownerId]
            );
            const settings = { ...defaults };

            for (const row of result.rows) {
                settings[row.key] = row.value;
            }

            return settings;
        }
    };
}
