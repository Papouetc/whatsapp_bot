import pg from 'pg';
import dotenv from 'dotenv';
import { decryptText, encryptText, hashText } from '../encryption.js';
import { logSafeError } from '../logger.js';
import { createTaskRepository } from './repositories/task-repository.js';
import { createSettingsRepository } from './repositories/settings-repository.js';
import { createUserRepository } from './repositories/user-repository.js';
import { createIdentityRepository } from './repositories/identity-repository.js';
import { createDraftRepository } from './repositories/draft-repository.js';
import { createCanonicalUserId, getDatabaseUserId } from '../../application/execution-context.js';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

export const DEFAULT_SETTINGS = {
    draft_mode: 'on',
    draft_mode_off_for: '[]',
    urgency_detection: 'on',
    summary_hour: String(process.env.SUMMARY_HOUR || '22'),
    search_window_days: '30',
    chat_memory_size: '20',
    ai_provider_priority: 'groq',
    urgence_mot_cle: 'urgent,urgence,vite,immédiat,immédiatement,rapidement,dépêche,dépêche-toi,critique,emergency,asap,important,maintenant,tout de suite,au secours,help,sos,problème grave,ça urge'
};

const taskRepository = createTaskRepository({ pool, encryptText, decryptText });
const settingsRepository = createSettingsRepository({ pool, defaults: DEFAULT_SETTINGS });
const userRepository = createUserRepository({ pool, createCanonicalUserId });
const identityRepository = createIdentityRepository({ pool, getDatabaseUserId });
const draftRepository = createDraftRepository({ pool, encryptText, decryptText });

async function decryptMessage(row) {
    let storedContent = row.content;

    try {
        const parsedContent = JSON.parse(storedContent);
        if (typeof parsedContent === 'string') {
            storedContent = parsedContent;
        }
    } catch {
        // legacy content
    }

    const decryptedContent = decryptText(storedContent);

    if (decryptedContent !== null) {
        if (storedContent !== row.content) {
            await pool.query('UPDATE messages SET content = $1 WHERE id = $2', [storedContent, row.id]);
        }
        return { ...row, content: decryptedContent };
    }

    const encryptedContent = encryptText(row.content);
    await pool.query('UPDATE messages SET content = $1 WHERE id = $2', [encryptedContent, row.id]);
    return row;
}

async function decryptMessages(rows) {
    return Promise.all(rows.map(decryptMessage));
}

async function migrateTasks() {
    const result = await pool.query('SELECT id, description, chat_id, sender FROM tasks');
    for (const row of result.rows) {
        const description = decryptText(row.description) || row.description;
        const chatId = decryptText(row.chat_id) || row.chat_id;
        const sender = decryptText(row.sender) || row.sender;

        await pool.query(
            `UPDATE tasks SET description = $1, chat_id = $2, sender = $3 WHERE id = $4`,
            [encryptText(description), chatId ? encryptText(chatId) : null, sender ? encryptText(sender) : null, row.id]
        );
    }
}

async function migrateMessageMetadata() {
    const result = await pool.query('SELECT id, chat_id, chat_name, sender, sender_name FROM messages');
    for (const row of result.rows) {
        const chatId = decryptText(row.chat_id) || row.chat_id;
        const chatName = decryptText(row.chat_name) || row.chat_name;
        const sender = decryptText(row.sender) || row.sender;
        const senderName = decryptText(row.sender_name) || row.sender_name;

        await pool.query(
            `UPDATE messages SET chat_id = $1, chat_name = $2, sender = $3, sender_name = $4, chat_id_hash = $5, sender_hash = $6 WHERE id = $7`,
            [encryptText(chatId), chatName ? encryptText(chatName) : null, sender ? encryptText(sender) : null, senderName ? encryptText(senderName) : null, hashText(chatId), sender ? hashText(sender) : null, row.id]
        );
    }
}

export async function initDB() {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS users (...)`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_jid TEXT`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
        await pool.query(`ALTER TABLE users ALTER COLUMN telegram_user_id DROP NOT NULL`);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (LOWER(email)) WHERE email IS NOT NULL`);
        await pool.query(`CREATE TABLE IF NOT EXISTS settings (...)`);
        await pool.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id TEXT`);
        await pool.query(`UPDATE settings SET user_id = 'legacy' WHERE user_id IS NULL`);
        await pool.query(`ALTER TABLE settings ALTER COLUMN user_id SET NOT NULL`);
        await pool.query(`ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey`);
        await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'settings'::regclass AND contype = 'p') THEN ALTER TABLE settings ADD PRIMARY KEY (user_id, key); END IF; END $$;`);
        await pool.query(`CREATE TABLE IF NOT EXISTS messages (...)`);
        await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name TEXT`);
        await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_from_me BOOLEAN NOT NULL DEFAULT FALSE`);
        await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS chat_id_hash TEXT`);
        await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_hash TEXT`);
        await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id TEXT`);
        await pool.query(`UPDATE messages SET user_id = 'legacy' WHERE user_id IS NULL`);
        await pool.query(`ALTER TABLE messages ALTER COLUMN user_id SET NOT NULL`);
        await pool.query(`CREATE INDEX IF NOT EXISTS messages_user_id_timestamp_idx ON messages (user_id, timestamp)`);
        await migrateMessageMetadata();
        await pool.query(`CREATE TABLE IF NOT EXISTS tasks (...)`);
        await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id TEXT`);
        await pool.query(`UPDATE tasks SET user_id = 'legacy' WHERE user_id IS NULL`);
        await pool.query(`ALTER TABLE tasks ALTER COLUMN user_id SET NOT NULL`);
        await pool.query(`CREATE INDEX IF NOT EXISTS tasks_user_id_done_idx ON tasks (user_id, done)`);
        await migrateTasks();
        await pool.query(`CREATE TABLE IF NOT EXISTS drafts (...)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS drafts_user_id_status_idx ON drafts (user_id, status)`);
        for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
            await pool.query(`INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3) ON CONFLICT (user_id, key) DO NOTHING`, [key, 'legacy', value]);
        }
        console.log('✅ Base de données initialisée');
    } catch (err) {
        logSafeError('Erreur initialisation DB', err);
        throw err;
    }
}

export async function closeDB() {
    await pool.end();
    console.log('✅ Connexion base de données fermée');
}

export async function getOrCreateUser(telegramUserId, telegramUsername = null, telegramChatId = null) {
    return userRepository.createFromTelegram(telegramUserId, telegramUsername, telegramChatId);
}

export async function createWebUser(email, passwordHash) {
    return userRepository.createFromWeb(email, passwordHash);
}

export async function getWebUserByEmail(email) {
    return userRepository.findByEmail(email);
}

export async function setUserWhatsAppJid(userId, whatsappJid) {
    return identityRepository.linkWhatsApp(userId, whatsappJid);
}

export async function getUserTelegramChatId(userId) {
    return identityRepository.findTelegramChatId(userId);
}

export async function deleteAllStoredData(userId = 'legacy') {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM messages WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM tasks WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM drafts WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM auth_keys WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM auth_creds WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM settings WHERE user_id = $1', [userId]);

        for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
            await client.query('INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)', [key, userId, value]);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function getSetting(key, userId = 'legacy') {
    return settingsRepository.get(key, userId);
}
export async function setSetting(key, value, userId = 'legacy') { return settingsRepository.set(key, value, userId); }
export async function getAllSettings(userId = 'legacy') { return settingsRepository.getAll(userId); }
export async function markTaskDone(id, userId = 'legacy') { return taskRepository.complete(id, userId); }
export async function getPendingTasks(userId = 'legacy') { return taskRepository.listPending(userId); }
export async function saveTasks(tasks, userId = 'legacy') { return taskRepository.createMany(tasks, userId); }
export async function saveDraft(draft, userId) { return draftRepository.create(draft, userId); }
export async function getPendingDraft(id, userId) { return draftRepository.findPendingById(id, userId); }
export async function getPendingDrafts(userId) { return draftRepository.listPending(userId); }
export async function markDraftSent(id, userId) { return draftRepository.markSent(id, userId); }

export async function searchArchiveByKeyword(keyword, limit = 50, userId = 'legacy') {
    const result = await pool.query(`SELECT * FROM messages WHERE is_status = FALSE AND user_id = $1 ORDER BY timestamp DESC`, [userId]);
    const messages = await decryptMessages(result.rows);
    const normalizedKeyword = String(keyword || '').toLocaleLowerCase();

    return messages.filter((message) => {
        const content = message.content.trim().toLocaleLowerCase();
        return content.includes(normalizedKeyword) && !content.startsWith('/');
    }).slice(0, limit);
}

export async function saveMessage({ chatId, chatName, sender, sender_name, content, timestamp, isGroup, isStatus, is_from_me, userId = 'legacy' }) {
    await pool.query(
        `INSERT INTO messages (chat_id, chat_name, sender, sender_name, content, timestamp, is_group, is_status, is_from_me, chat_id_hash, sender_hash, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [encryptText(chatId), chatName ? encryptText(chatName) : null, sender ? encryptText(sender) : null, sender_name ? encryptText(sender_name) : null, encryptText(content), timestamp, isGroup, isStatus || false, is_from_me || false, hashText(chatId), sender ? hashText(sender) : null, userId]
    );
}

export async function getUnsummarizedMessages(userId = 'legacy') {
    const result = await pool.query(`SELECT * FROM messages WHERE summarized = FALSE AND is_status = FALSE AND user_id = $1 ORDER BY timestamp ASC`, [userId]);
    console.log(`🔎 ${result.rows.length} message(s) à résumer`);
    return decryptMessages(result.rows);
}

export async function markAsSummarized(ids, userId = 'legacy') {
    if (!ids || ids.length === 0) return;
    await pool.query(`UPDATE messages SET summarized = TRUE WHERE id = ANY($1) AND user_id = $2`, [ids, userId]);
}

export async function getRecentMessagesForSearch(days, maxMessages, userId = 'legacy') {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);
    const result = await pool.query(`SELECT * FROM messages WHERE timestamp > $1 AND is_status = FALSE AND user_id = $3 ORDER BY timestamp DESC LIMIT $2`, [since, maxMessages, userId]);
    return decryptMessages(result.rows);
}

export async function getRecentMessagesForChat(chatId, limit = 20, userId = 'legacy') {
    const result = await pool.query(`SELECT * FROM messages WHERE chat_id_hash = $1 AND is_status = FALSE AND user_id = $3 ORDER BY timestamp DESC LIMIT $2`, [hashText(chatId), limit, userId]);
    return (await decryptMessages(result.rows)).reverse();
}

export async function getConversationHistory(chatId, limit = 20, excludeId = null, userId = 'legacy') {
    try {
        let result;
        if (excludeId) {
            result = await pool.query(`SELECT * FROM messages WHERE chat_id_hash = $1 AND id != $2 AND user_id = $4 AND COALESCE(is_status, false) = false ORDER BY CAST(timestamp AS BIGINT) DESC LIMIT $3`, [hashText(chatId), excludeId, limit, userId]);
        } else {
            result = await pool.query(`SELECT * FROM messages WHERE chat_id_hash = $1 AND COALESCE(is_status, false) = false AND user_id = $3 ORDER BY CAST(timestamp AS BIGINT) DESC LIMIT $2`, [hashText(chatId), limit, userId]);
        }
        return (await decryptMessages(result.rows)).reverse();
    } catch (err) {
        logSafeError('Erreur récupération historique conversation', err);
        return [];
    }
}
