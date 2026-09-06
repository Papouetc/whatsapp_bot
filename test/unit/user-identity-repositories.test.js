import assert from 'node:assert/strict';
import test from 'node:test';

import { createIdentityRepository } from '../../repositories/identity-repository.js';
import { createUserRepository } from '../../repositories/user-repository.js';

function createFakePool() {
    const users = [
        {
            id: 1,
            email: 'a@example.test',
            password_hash: 'hash-a',
            telegram_user_id: 'telegram-a',
            telegram_chat_id: 'chat-a',
            whatsapp_jid: null
        },
        {
            id: 2,
            email: 'b@example.test',
            password_hash: 'hash-b',
            telegram_user_id: 'telegram-b',
            telegram_chat_id: 'chat-b',
            whatsapp_jid: null
        }
    ];

    return {
        users,
        async query(sql, values = []) {
            if (sql.startsWith('SELECT id, email')) {
                const [email] = values;
                return { rows: users.filter(user => user.email === email) };
            }

            if (sql.startsWith('SELECT telegram_chat_id FROM users WHERE id')) {
                const [id] = values;
                return { rows: users.filter(user => user.id === id) };
            }

            if (sql.startsWith('SELECT telegram_chat_id FROM users WHERE telegram_user_id')) {
                const [telegramId] = values;
                return { rows: users.filter(user => user.telegram_user_id === telegramId) };
            }

            if (sql.startsWith('UPDATE users') && sql.includes('WHERE id')) {
                const [whatsappJid, id] = values;
                const user = users.find(item => item.id === id);
                if (user) user.whatsapp_jid = whatsappJid;
                return { rows: [] };
            }

            throw new Error(`Unexpected SQL in fake pool: ${sql}`);
        }
    };
}

test('UserRepository returns canonical IDs for web users', async () => {
    const repository = createUserRepository({
        pool: createFakePool(),
        createCanonicalUserId: id => `user:${id}`
    });

    const user = await repository.findByEmail('a@example.test');

    assert.equal(user.userId, 'user:1');
    assert.equal(await repository.findByEmail('missing@example.test'), null);
});

test('IdentityRepository links WhatsApp and reads Telegram per internal user', async () => {
    const pool = createFakePool();
    const repository = createIdentityRepository({
        pool,
        getDatabaseUserId: userId => /^user:(\d+)$/.test(userId)
            ? Number(userId.slice('user:'.length))
            : null
    });

    await repository.linkWhatsApp('user:1', 'jid-a');
    assert.equal(pool.users[0].whatsapp_jid, 'jid-a');
    assert.equal(pool.users[1].whatsapp_jid, null);
    assert.equal(await repository.findTelegramChatId('user:1'), 'chat-a');
    assert.equal(await repository.findTelegramChatId('user:2'), 'chat-b');
});

test('identity repository rejects missing owners', async () => {
    const repository = createIdentityRepository({
        pool: createFakePool(),
        getDatabaseUserId: () => null
    });

    await assert.rejects(
        () => repository.findTelegramChatId(),
        /userId.*obligatoire/
    );
    await assert.rejects(
        () => repository.linkWhatsApp('', 'jid'),
        /userId.*obligatoire/
    );
});
