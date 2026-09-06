function requireUserId(userId) {
    if (typeof userId !== 'string' || !userId.trim()) {
        throw new Error('IdentityRepository.userId est obligatoire');
    }

    return userId.trim();
}

export function createIdentityRepository({ pool, getDatabaseUserId }) {
    if (!pool || typeof pool.query !== 'function') {
        throw new Error('IdentityRepository.pool est obligatoire');
    }

    if (typeof getDatabaseUserId !== 'function') {
        throw new Error('IdentityRepository user ID mapper is required');
    }

    return {
        async linkWhatsApp(userId, whatsappJid) {
            const ownerId = requireUserId(userId);
            const databaseUserId = getDatabaseUserId(ownerId);

            if (databaseUserId) {
                await pool.query(
                    `UPDATE users
           SET whatsapp_jid = $1, last_seen_at = NOW()
           WHERE id = $2`,
                    [whatsappJid, databaseUserId]
                );
                return;
            }

            await pool.query(
                `UPDATE users
         SET whatsapp_jid = $1, last_seen_at = NOW()
         WHERE telegram_user_id = $2`,
                [whatsappJid, ownerId]
            );
        },

        async findTelegramChatId(userId) {
            const ownerId = requireUserId(userId);
            const databaseUserId = getDatabaseUserId(ownerId);
            const result = databaseUserId
                ? await pool.query(
                    'SELECT telegram_chat_id FROM users WHERE id = $1',
                    [databaseUserId]
                )
                : await pool.query(
                    'SELECT telegram_chat_id FROM users WHERE telegram_user_id = $1',
                    [ownerId]
                );

            return result.rows[0]?.telegram_chat_id || null;
        }
    };
}
