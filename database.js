import pg from 'pg';
import dotenv from 'dotenv';
import { decryptText, encryptText, hashText } from './encryption.js';
import { logSafeError } from './logger.js';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export const DEFAULT_SETTINGS = {
  draft_mode: 'on',
  draft_mode_off_for: '[]', // JSON : liste de chatId exclus du mode brouillon
  urgency_detection: 'on',
  summary_hour: String(process.env.SUMMARY_HOUR || '22'),
  search_window_days: '30',
  chat_memory_size: '20',
  ai_provider_priority: 'groq',
  urgence_mot_cle: 'urgent,urgence,vite,immédiat,immédiatement,rapidement,dépêche,dépêche-toi,critique,emergency,asap,important,maintenant,tout de suite,au secours,help,sos,problème grave,ça urge'
};

async function decryptMessage(row) {
  let storedContent = row.content;

  try {
    const parsedContent = JSON.parse(storedContent);
    if (typeof parsedContent === 'string') {
      storedContent = parsedContent;
    }
  } catch {
    // Le contenu legacy est un texte brut.
  }

  const decryptedContent = decryptText(storedContent);

  if (decryptedContent !== null) {
    if (storedContent !== row.content) {
      await pool.query(
        'UPDATE messages SET content = $1 WHERE id = $2',
        [storedContent, row.id]
      );
    }

    return { ...row, content: decryptedContent };
  }

  const encryptedContent = encryptText(row.content);
  await pool.query(
    'UPDATE messages SET content = $1 WHERE id = $2',
    [encryptedContent, row.id]
  );

  return row;
}

async function decryptMessages(rows) {
  return Promise.all(rows.map(decryptMessage));
}

async function decryptTask(row) {
  return {
    ...row,
    description: decryptText(row.description) || row.description,
    chat_id: decryptText(row.chat_id) || row.chat_id,
    sender: decryptText(row.sender) || row.sender
  };
}

async function migrateTasks() {
  const result = await pool.query(
    'SELECT id, description, chat_id, sender FROM tasks'
  );

  for (const row of result.rows) {
    const description = decryptText(row.description) || row.description;
    const chatId = decryptText(row.chat_id) || row.chat_id;
    const sender = decryptText(row.sender) || row.sender;

    await pool.query(
      `UPDATE tasks
       SET description = $1, chat_id = $2, sender = $3
       WHERE id = $4`,
      [
        encryptText(description),
        chatId ? encryptText(chatId) : null,
        sender ? encryptText(sender) : null,
        row.id
      ]
    );
  }
}

async function migrateMessageMetadata() {
  const result = await pool.query(
    'SELECT id, chat_id, chat_name, sender, sender_name FROM messages'
  );

  for (const row of result.rows) {
    const chatId = decryptText(row.chat_id) || row.chat_id;
    const chatName = decryptText(row.chat_name) || row.chat_name;
    const sender = decryptText(row.sender) || row.sender;
    const senderName = decryptText(row.sender_name) || row.sender_name;

    await pool.query(
      `UPDATE messages
       SET chat_id = $1, chat_name = $2, sender = $3, sender_name = $4,
           chat_id_hash = $5, sender_hash = $6
       WHERE id = $7`,
      [
        encryptText(chatId),
        chatName ? encryptText(chatName) : null,
        sender ? encryptText(sender) : null,
        senderName ? encryptText(senderName) : null,
        hashText(chatId),
        sender ? hashText(sender) : null,
        row.id
      ]
    );
  }
}

// ===== Initialisation =====

export async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_user_id TEXT UNIQUE NOT NULL,
        telegram_username TEXT,
        telegram_chat_id TEXT,
        whatsapp_jid TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT
    `);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS whatsapp_jid TEXT
    `);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email TEXT
    `);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_hash TEXT
    `);

    await pool.query(`
      ALTER TABLE users
      ALTER COLUMN telegram_user_id DROP NOT NULL
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_key
      ON users (LOWER(email))
      WHERE email IS NOT NULL
    `);

    // Créer les tables si elles n'existent pas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT 'legacy',
        PRIMARY KEY (user_id, key),
        value TEXT NOT NULL
      )
    `);

    await pool.query(`
      ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS user_id TEXT
    `);

    await pool.query(`
      UPDATE settings
      SET user_id = 'legacy'
      WHERE user_id IS NULL
    `);

    await pool.query(`
      ALTER TABLE settings
      ALTER COLUMN user_id SET NOT NULL
    `);

    await pool.query(`
      ALTER TABLE settings
      DROP CONSTRAINT IF EXISTS settings_pkey
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'settings'::regclass
            AND contype = 'p'
        ) THEN
          ALTER TABLE settings
          ADD PRIMARY KEY (user_id, key);
        END IF;
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        chat_id TEXT NOT NULL,
        chat_name TEXT,
        sender TEXT,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        is_group BOOLEAN NOT NULL,
        summarized BOOLEAN NOT NULL DEFAULT FALSE,
        is_status BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);

    await pool.query(`
        ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS sender_name TEXT
      `)

    await pool.query(`
        ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS is_from_me BOOLEAN NOT NULL DEFAULT FALSE
      `)

    await pool.query(`
        ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS chat_id_hash TEXT
      `)

    await pool.query(`
        ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS sender_hash TEXT
      `)

    await pool.query(`
        ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS user_id TEXT
      `)

    await pool.query(`
        UPDATE messages
        SET user_id = 'legacy'
        WHERE user_id IS NULL
      `)

    await pool.query(`
        ALTER TABLE messages
        ALTER COLUMN user_id SET NOT NULL
      `)

    await pool.query(`
        CREATE INDEX IF NOT EXISTS messages_user_id_timestamp_idx
        ON messages (user_id, timestamp)
      `)

    await migrateMessageMetadata();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        description TEXT NOT NULL,
        chat_id TEXT,
        sender TEXT,
        detected_at INTEGER NOT NULL,
        done BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);

    await pool.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS user_id TEXT
    `)

    await pool.query(`
      UPDATE tasks
      SET user_id = 'legacy'
      WHERE user_id IS NULL
    `)

    await pool.query(`
      ALTER TABLE tasks
      ALTER COLUMN user_id SET NOT NULL
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS tasks_user_id_done_idx
      ON tasks (user_id, done)
    `)

    await migrateTasks();

    // Insérer les settings par défaut s'ils n'existent pas
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await pool.query(
        `INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, key) DO NOTHING`,
        [key, 'legacy', value]
      );
    }

    console.log('✅ Base de données initialisée');
  } catch (err) {
    logSafeError('Erreur initialisation DB', err);
    throw err;
  }
}

// ===== Fermeture propre =====

export async function closeDB() {
  await pool.end();
  console.log('✅ Connexion base de données fermée');
}

export async function getOrCreateUser(
  telegramUserId,
  telegramUsername = null,
  telegramChatId = null
) {
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

  return result.rows[0];
}

export async function createWebUser(email, passwordHash) {
  const result = await pool.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     RETURNING id, email`,
    [email, passwordHash]
  );

  return {
    ...result.rows[0],
    userId: `web:${result.rows[0].id}`
  };
}

export async function getWebUserByEmail(email) {
  const result = await pool.query(
    `SELECT id, email, password_hash, whatsapp_jid
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    [email]
  );

  if (!result.rows[0]) {
    return null;
  }

  return {
    ...result.rows[0],
    userId: `web:${result.rows[0].id}`
  };
}

export async function setUserWhatsAppJid(userId, whatsappJid) {
  await pool.query(
    `UPDATE users
     SET whatsapp_jid = $1, last_seen_at = NOW()
     WHERE telegram_user_id = $2`,
    [whatsappJid, String(userId)]
  );
}

export async function getUserTelegramChatId(userId) {
  const result = await pool.query(
    'SELECT telegram_chat_id FROM users WHERE telegram_user_id = $1',
    [String(userId)]
  );

  return result.rows[0]?.telegram_chat_id || null;
}

export async function deleteAllStoredData(userId = 'legacy') {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM messages WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM tasks WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM auth_keys WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM auth_creds WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM settings WHERE user_id = $1', [userId]);

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await client.query(
        'INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)',
        [key, userId, value]
      );
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
  const result = await pool.query(
    'SELECT value FROM settings WHERE key = $1 AND user_id = $2',
    [key, userId]
  );
  if (result.rows.length === 0) {
    return Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)
      ? DEFAULT_SETTINGS[key]
      : null;
  }
  return result.rows[0].value;
}
export async function setSetting(key, value, userId = 'legacy') {
  await pool.query(
    `INSERT INTO settings (key, user_id, value) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [key, userId, String(value)]
  );
}
export async function getAllSettings(userId = 'legacy') {
  const result = await pool.query(
    'SELECT key, value FROM settings WHERE user_id = $1',
    [userId]
  );
  const obj = { ...DEFAULT_SETTINGS };
  for (const r of result.rows) obj[r.key] = r.value;
  return obj;
}
export async function markTaskDone(id, userId = 'legacy') {
  const result = await pool.query(
    'SELECT id FROM tasks WHERE id = $1 AND user_id = $2 AND done = $3',
    [id, userId, false]
  );
  if (result.rows.length == 0) {
    return false
  }
  await pool.query(
    `UPDATE tasks SET done = $1 WHERE id = $2 AND user_id = $3`,
    [true, id, userId]
  );
  return true;

}

export async function getPendingTasks(userId = 'legacy') {
  const result = await pool.query(
    'SELECT * FROM tasks WHERE done = FALSE AND user_id = $1 ORDER BY detected_at DESC',
    [userId]
  );
  return Promise.all(result.rows.map(decryptTask));
}
export async function saveTasks(tasks, userId = 'legacy') {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return;
  }

  const now = Date.now();

  for (const t of tasks) {
    if (
      !t ||
      typeof t.description !== 'string' ||
      !t.description.trim()
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
        encryptText(t.description.trim()),
        t.chatId ? encryptText(t.chatId) : null,
        t.sender ? encryptText(t.sender) : null,
        now,
        userId
      ]
    );
  }
}
export async function searchArchiveByKeyword(keyword, limit = 50, userId = 'legacy') {
  const result = await pool.query(
    `SELECT *
       FROM messages
       WHERE is_status = FALSE AND user_id = $1
       ORDER BY timestamp DESC`,
    [userId]
  );

  const messages = await decryptMessages(result.rows);
  const normalizedKeyword = String(keyword || '').toLocaleLowerCase();

  return messages
    .filter((message) => {
      const content = message.content.trim().toLocaleLowerCase();
      return content.includes(normalizedKeyword) && !content.startsWith('/');
    })
    .slice(0, limit);
}

export async function saveMessage({ chatId, chatName, sender, sender_name, content, timestamp, isGroup, isStatus, is_from_me, userId = 'legacy' }) {
  await pool.query(
    `INSERT INTO messages (chat_id, chat_name, sender, sender_name, content, timestamp, is_group, is_status, is_from_me, chat_id_hash, sender_hash, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      encryptText(chatId),
      chatName ? encryptText(chatName) : null,
      sender ? encryptText(sender) : null,
      sender_name ? encryptText(sender_name) : null,
      encryptText(content),
      timestamp,
      isGroup,
      isStatus || false,
      is_from_me || false,
      hashText(chatId),
      sender ? hashText(sender) : null,
      userId
    ]
  );
}

export async function getUnsummarizedMessages(userId = 'legacy') {
  const result = await pool.query(
    `SELECT * FROM messages 
       WHERE summarized = FALSE AND is_status = FALSE AND user_id = $1
       ORDER BY timestamp ASC`,
    [userId]
  );
  console.log(`🔎 ${result.rows.length} message(s) à résumer`);
  return decryptMessages(result.rows);
}

export async function markAsSummarized(ids, userId = 'legacy') {
  if (!ids || ids.length === 0) return;
  await pool.query(
    `UPDATE messages SET summarized = TRUE WHERE id = ANY($1) AND user_id = $2`,
    [ids, userId]
  );
}

export async function getRecentMessagesForSearch(days, maxMessages, userId = 'legacy') {
  const since = Date.now() - (days * 24 * 60 * 60 * 1000);
  const result = await pool.query(
    `SELECT * FROM messages
      WHERE timestamp > $1 AND is_status = FALSE AND user_id = $3
       ORDER BY timestamp DESC
       LIMIT $2`,
    [since, maxMessages, userId]
  );
  return decryptMessages(result.rows);
}

export async function getRecentMessagesForChat(chatId, limit = 20, userId = 'legacy') {
  const result = await pool.query(
    `SELECT * FROM messages
      WHERE chat_id_hash = $1 AND is_status = FALSE AND user_id = $3
       ORDER BY timestamp DESC
       LIMIT $2`,
    [hashText(chatId), limit, userId]
  );
  return (await decryptMessages(result.rows)).reverse();
}

export async function getConversationHistory(
  chatId,
  limit = 20,
  excludeId = null,
  userId = 'legacy'
) {
  try {
    let result;

    if (excludeId) {
      result = await pool.query(
        `
          SELECT *
          FROM messages
           WHERE chat_id_hash = $1
            AND id != $2
            AND user_id = $4
            AND COALESCE(is_status, false) = false
          ORDER BY CAST(timestamp AS BIGINT) DESC
          LIMIT $3
          `,
        [hashText(chatId), excludeId, limit, userId]
      );
    } else {
      result = await pool.query(
        `
          SELECT *
          FROM messages
           WHERE chat_id_hash = $1
            AND COALESCE(is_status, false) = false
            AND user_id = $3
          ORDER BY CAST(timestamp AS BIGINT) DESC
          LIMIT $2
          `,
        [hashText(chatId), limit, userId]
      );
    }

    return (await decryptMessages(result.rows)).reverse();

  } catch (err) {
    logSafeError('Erreur récupération historique conversation', err);

    return [];
  }
}
