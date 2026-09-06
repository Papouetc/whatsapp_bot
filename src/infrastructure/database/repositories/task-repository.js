function requireUserId(userId) {
    if (typeof userId !== 'string' || !userId.trim()) {
        throw new Error('TaskRepository.userId est obligatoire');
    }

    return userId.trim();
}

function decryptTask(decryptText, row) {
    return {
        ...row,
        description: decryptText(row.description) || row.description,
        chat_id: decryptText(row.chat_id) || row.chat_id,
        sender: decryptText(row.sender) || row.sender
    };
}

export function createTaskRepository({ pool, encryptText, decryptText }) {
    if (!pool || typeof pool.query !== 'function') {
        throw new Error('TaskRepository.pool est obligatoire');
    }

    if (typeof encryptText !== 'function' || typeof decryptText !== 'function') {
        throw new Error('TaskRepository crypto functions are required');
    }

    return {
        async createMany(tasks, userId) {
            const ownerId = requireUserId(userId);

            if (!Array.isArray(tasks) || tasks.length === 0) {
                return;
            }

            const now = Date.now();

            for (const task of tasks) {
                if (
                    !task
                    || typeof task.description !== 'string'
                    || !task.description.trim()
                ) {
                    console.warn('⚠️ Tâche ignorée : description invalide');
                    continue;
                }

                await pool.query(
                    `INSERT INTO tasks (
                    description,
                    chat_id,
                    sender,
                    detected_at,
                    done,
                    user_id
                )
                  VALUES ($1, $2, $3, $4, FALSE, $5)`,
                    [
                        encryptText(task.description.trim()),
                        task.chatId ? encryptText(task.chatId) : null,
                        task.sender ? encryptText(task.sender) : null,
                        now,
                        ownerId
                    ]
                );
            }
        },

        async listPending(userId) {
            const ownerId = requireUserId(userId);
            const result = await pool.query(
                'SELECT * FROM tasks WHERE done = FALSE AND user_id = $1 ORDER BY detected_at DESC',
                [ownerId]
            );

            return result.rows.map(row => decryptTask(decryptText, row));
        },

        async complete(id, userId) {
            const ownerId = requireUserId(userId);
            const result = await pool.query(
                'SELECT id FROM tasks WHERE id = $1 AND user_id = $2 AND done = $3',
                [id, ownerId, false]
            );

            if (result.rows.length === 0) {
                return false;
            }

            await pool.query(
                'UPDATE tasks SET done = $1 WHERE id = $2 AND user_id = $3',
                [true, id, ownerId]
            );
            return true;
        }
    };
}
