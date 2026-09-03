// scheduler.js
import cron from 'node-cron';
import { getUnsummarizedMessages, markAsSummarized, getSetting, saveTasks } from './database.js';
import { summarizeMessages } from './ai.js';
import { sendTelegramMessage } from './telegram.js';
import { sendWhatsAppMessage, getOwnJid } from './whatsapp.js';

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
      
      const { summary, tasks } = await summarizeMessages(messages);
      
      await sendTelegramMessage(`📋 Résumé automatique du jour:\n\n${summary}`);
      await sendWhatsAppMessage(getOwnJid(),`📋 Résumé automatique du jour:\n\n${summary}`)
      
      if (tasks && tasks.length > 0) {
        await saveTasks(tasks);
      }

      const ids = messages.map(m => m.id);
      await markAsSummarized(ids);
      
      console.log('✅ Résumé envoyé');
      
    } catch (err) {
      console.error('❌ Erreur résumé quotidien :', err);
    }
  });
  
  console.log(`⏰ Résumé programmé pour ${summaryHour}:00`);
}