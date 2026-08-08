import { initDB, closeDB, getSetting, setSetting, getAllSettings, saveMessage, getUnsummarizedMessages, getPendingTasks, saveTasks } from './database.js';

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});


async function test() {
  try {
    console.log('🔄 Initialisation DB...');
    await initDB();
    
    console.log('\n✅ Test getSetting...');
    const heure = await getSetting('summary_hour');
    console.log(`  resume_heure = ${heure}`);
    
    console.log('\n✅ Test setSetting...');
    await setSetting('langue', 'en');
    const langue = await getSetting('langue');
    console.log(`  langue = ${langue}`);
    
    console.log('\n✅ Test getAllSettings...');
    const allSettings = await getAllSettings();
    console.log(`  ${Object.keys(allSettings).length} settings trouvés`);
    
    console.log('\n✅ Test saveMessage...');
    await saveMessage({
      chatId: '120@g.us',
      chatName: 'Groupe Test',
      sender: 'Abdrahamane',
      content: 'Ceci est un message de test',
      timestamp: 2,
      isGroup: true,
      isStatus: false
    });
    console.log('  Message sauvegardé');
    
    console.log('\n✅ Test getUnsummarizedMessages...');
    const unsummarized = await getUnsummarizedMessages();
    console.log(`  ${unsummarized.length} messages non-résumés`);
    
    console.log('\n✅ Test saveTasks...');
    await saveTasks([
      { description: 'Tâche 1', chatId: '120@g.us', sender: 'Test' },
      { description: 'Tâche 2', chatId: '120@g.us', sender: 'Test' }
    ]);
    console.log('  Tâches sauvegardées');
    
    console.log('\n✅ Test getPendingTasks...');
    const tasks = await getPendingTasks();
    console.log(`  ${tasks.length} tâches en attente`);
    
    console.log('\n✅ Tous les tests passent !');
    
  } catch (err) {
    console.error('❌ Erreur :', err);
  } finally {
    await closeDB();
  }
}

//test();


async function test2() {
   try {
    const result = await pool.query(
        'DELETE FROM auth_creds'
      );
      if (result.rows.length === 0) {
        console.log("null");
        
          return null;
        }
        console.log(result.rows);
        
        return result.rows[0].value;
   } catch (error) {
        console.error(error);
        
   }
}
test2();