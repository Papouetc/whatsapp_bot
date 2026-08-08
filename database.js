import pg from 'pg';
import dotenv from 'dotenv';

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

  // ===== Initialisation =====

export async function initDB() {
  try {
    // Créer les tables si elles n'existent pas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
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
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        description TEXT NOT NULL,
        chat_id TEXT,
        sender TEXT,
        detected_at INTEGER NOT NULL,
        done BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);

    // Insérer les settings par défaut s'ils n'existent pas
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO NOTHING`,
        [key, value]
      );
    }

    console.log('✅ Base de données initialisée');
  } catch (err) {
    console.error('❌ Erreur lors de l\'initialisation de la DB :', err);
    throw err;
  }
}

// ===== Fermeture propre =====

export async function closeDB() {
  await pool.end();
  console.log('✅ Connexion base de données fermée');
}
export async function getSetting(key) {
    const result = await pool.query(
      'SELECT value FROM settings WHERE key = $1',
      [key]  
    );
    if (result.rows.length === 0) {
        return null;
      }
      return result.rows[0].value;
  }
export async function setSetting(key, value) {
    const result = await pool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
        [key, String(value)]  
      );
}
export async function getAllSettings() {
    const result = await pool.query('SELECT key, value FROM settings');
    const obj = { ...DEFAULT_SETTINGS };
    for (const r of result.rows) obj[r.key] = r.value;
    return obj;
  }
  export async function markTaskDone(id ) {
    const result = await pool.query(
        'SELECT id FROM tasks WHERE id =$1 AND done = $2',
        [id, false]  
      );
      if (result.rows.length == 0) {
        return false
      }
      await pool.query(`UPDATE tasks SET done = $1 WHERE id = $2`, [true,id]);
      return true;
    
  }
      
  export async function getPendingTasks() {
    const result = await pool.query(
      'SELECT * FROM tasks WHERE done = FALSE ORDER BY detected_at ASC'
    );
    return result.rows;
  }
export async function saveTasks(tasks) {
    if (!tasks || tasks.length === 0) return;
    const now = Date.now();
    for (const t of tasks) {
        await pool.query(
          'INSERT INTO tasks (description, chat_id, sender, detected_at, done) VALUES ($1, $2, $3, $4, FALSE)',
          [t.description, t.chatId || null, t.sender || null, now]
        );
      }
}
export async function searchArchiveByKeyword(keyword, limit = 40) {
    const like = `%${keyword}%`;
    const result = await pool.query(
      `SELECT * FROM messages 
       WHERE (sender LIKE $1 OR content LIKE $2) 
       AND is_status = FALSE 
       ORDER BY timestamp DESC 
       LIMIT $3`,
      [like, like, limit]
    );
    return result.rows.reverse();
  }

  export async function saveMessage({ chatId, chatName, sender, content, timestamp, isGroup, isStatus }) {
    await pool.query(
      `INSERT INTO messages (chat_id, chat_name, sender, content, timestamp, is_group, is_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [chatId, chatName || null, sender || null, content, timestamp, isGroup, isStatus || false]
    );
  }
  
  export async function getUnsummarizedMessages() {
    const result = await pool.query(
      `SELECT * FROM messages 
       WHERE summarized = FALSE AND is_status = FALSE
       ORDER BY timestamp ASC`
    );
    return result.rows;
  }
  
  export async function markAsSummarized(ids) {
    if (!ids || ids.length === 0) return;
    await pool.query(
      `UPDATE messages SET summarized = TRUE WHERE id = ANY($1)`,
      [ids]
    );
  }
  
  export async function getRecentMessagesForSearch(days, maxMessages) {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);
    const result = await pool.query(
      `SELECT * FROM messages
       WHERE timestamp > $1 AND is_status = FALSE
       ORDER BY timestamp DESC
       LIMIT $2`,
      [since, maxMessages]
    );
    return result.rows;
  }
  
  export async function getRecentMessagesForChat(chatId, limit = 20) {
    const result = await pool.query(
      `SELECT * FROM messages
       WHERE chat_id = $1 AND is_status = FALSE
       ORDER BY timestamp DESC
       LIMIT $2`,
      [chatId, limit]
    );
    return result.rows.reverse();
  }

