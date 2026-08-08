// scheduler.js
import cron from 'node-cron';
import { getUnsummarizedMessages, markAsSummarized, getSetting } from './database.js';
import { summarizeMessages } from './ai.js';
import { sendTelegramMessage } from './telegram.js';

export function scheduleDailySummary() {
  const summaryHour = parseInt(process.env.SUMMARY_HOUR || 22);
  const cronTime = `0 ${summaryHour} * * *`;
  
  cron.schedule(cronTime, async () => {
    try {
      console.log('📋 Résumé quotidien en cours...');
      
      const messages = await getUnsummarizedMessages();
      
      if (messages.length === 0) {
        console.log('✅ Aucun message à résumer');
        return;
      }
      
      const summary = await summarizeMessages(messages);
      
      await sendTelegramMessage(`📋 Résumé du jour:\n\n${summary}`);
      
      const ids = messages.map(m => m.id);
      await markAsSummarized(ids);
      
      console.log('✅ Résumé envoyé');
      
    } catch (err) {
      console.error('❌ Erreur résumé quotidien :', err);
    }
  });
  
  console.log(`⏰ Résumé programmé pour ${summaryHour}:00`);
}