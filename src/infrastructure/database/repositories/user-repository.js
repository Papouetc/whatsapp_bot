function requirePool(pool) {
    if (!pool || typeof pool.query !== 'function') {
        throw new Error('UserRepository.pool est obligatoire');
    }
}

export function createUserRepository({ pool, createCanonicalUserId }) {
    requirePool(pool);

    if (typeof createCanonicalUserId !== 'function') {
        throw new Error('UserRepository user ID mapper is required');
    }

    const withUserId = row => ({
        ...row,
        userId: createCanonicalUserId(row.id)
    });

    return {
        async createFromTelegram(telegramUserId, telegramUsername = null, telegramChatId = null) {
            const result = await pool.query(
                `INSERT INTO users (telegram_user_id, telegram_username, telegram_chat_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (telegram_user_id)
         DO UPDATE SET telegram_username = EXCLUDED.telegram_username,
                       telegram_chat_id = EXCLUDED.telegram_chat_id,
                       last_seen_at = NOW()
         RETURNING id, telegram_user_id, telegram_username,
                   telegram_chat_id, whatsapp_jid`,
                [String(telegramUserId), telegramUsername, telegramChatId]
            );

            return withUserId(result.rows[0]);
        },

        async createFromWeb(email, passwordHash) {
            const result = await pool.query(
                `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email`,
                [email, passwordHash]
            );

            return withUserId(result.rows[0]);
        },

        async findByEmail(email) {
            const result = await pool.query(
                `SELECT id, email, password_hash, whatsapp_jid
         FROM users
         WHERE LOWER(email) = LOWER($1)`,
                [email]
            );

            return result.rows[0] ? withUserId(result.rows[0]) : null;
        }
    };
}
