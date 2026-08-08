import { initDB, closeDB } from './database.js';
import { startWhatsApp } from './whatsapp.js';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  try {
    console.log('🔄 Initialisation DB...');
    await initDB();
    
    console.log('🔄 Démarrage WhatsApp...');
    await startWhatsApp({
      onMessage: (msg) => {
        console.log(`📩 Message reçu : ${msg.content}`);
      }
    });
    
    console.log('✅ Test démarré, en attente de messages...');
    // Garder le process actif
    
  } catch (err) {
    console.error('❌ Erreur :', err);
    await closeDB();
    process.exit(1);
  }
}

test();