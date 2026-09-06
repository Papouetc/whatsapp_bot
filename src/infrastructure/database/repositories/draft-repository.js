function requireUserId(userId) {
    if (typeof userId !== 'string' || !userId.trim() || userId === 'legacy') {
        throw new Error('DraftRepository.userId est obligatoire');
    }

    return userId.trim();
}

function mapDraft(decryptText, row) {
    return {
        id: row.id,
        sender: decryptText(row.recipient) || row.recipient,
        content: decryptText(row.content) || row.content,
        sender_name: row.sender_name
            ? (decryptText(row.sender_name) || row.sender_name)
            : null,
        userId: row.user_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

export function createDraftRepository({ pool, encryptText, decryptText }) {
    if (!pool || typeof pool.query !== 'function') {
        throw new Error('DraftRepository.pool est obligatoire');
    }

    if (typeof encryptText !== 'function' || typeof decryptText !== 'function') {
        throw new Error('DraftRepository crypto functions are required');
    }

    return {
        async create({ sender, content, sender_name }, userId) {
            const ownerId = requireUserId(userId);
            const result = await pool.query(
                `INSERT INTO drafts (
           user_id, recipient, sender_name, content, status
         )
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id, user_id, recipient, sender_name, content,
                   status, created_at, updated_at`,
                [
                    ownerId,
                    encryptText(sender),
                    sender_name ? encryptText(sender_name) : null,
                    encryptText(content)
                ]
            );

            return mapDraft(decryptText, result.rows[0]);
        },

        async findPendingById(id, userId) {
            const ownerId = requireUserId(userId);
            const result = await pool.query(
                `SELECT id, user_id, recipient, sender_name, content,
                status, created_at, updated_at
         FROM drafts
         WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
                [id, ownerId]
            );

            return result.rows[0] ? mapDraft(decryptText, result.rows[0]) : null;
        },

        async listPending(userId) {
            const ownerId = requireUserId(userId);
            const result = await pool.query(
                `SELECT id, user_id, recipient, sender_name, content,
                status, created_at, updated_at
         FROM drafts
         WHERE user_id = $1 AND status = 'pending'
         ORDER BY created_at ASC, id ASC`,
                [ownerId]
            );

            return result.rows.map(row => mapDraft(decryptText, row));
        },

        async markSent(id, userId) {
            const ownerId = requireUserId(userId);
            const result = await pool.query(
                `UPDATE drafts
         SET status = 'sent', updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'pending'
         RETURNING id`,
                [id, ownerId]
            );

            return result.rows.length > 0;
        }
    };
}
