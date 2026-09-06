import cron from 'node-cron';
import { getUnsummarizedMessages, markAsSummarized, saveTasks } from '../infrastructure/database/index.js';
import { sendTelegramMessage } from '../infrastructure/telegram/telegram-client.js';
import { sendWhatsAppMessage, getOwnJid } from '../infrastructure/whatsapp/whatsapp-client.js';
import { logSafeError } from '../infrastructure/logger.js';

/**
 * Job planifié : résumé quotidien automatique.
 * summarizeMessages est injecté pour ne pas dépendre directement d'une
 * implémentation concrète du fournisseur IA (mêmes dépendances que le
 * use case /resume, câblées une seule fois dans le bootstrap).
 */
export function scheduleDailySummary({ summarizeMessages }) {
    if (typeof summarizeMessages !== 'function') {
        throw new Error('scheduleDailySummary requires a summarizeMessages function');
    }

    const userId = 'legacy';
    const summaryHour = parseInt(process.env.SUMMARY_HOUR || 22);
    const cronTime = `0 ${summaryHour} * * *`;

    cron.schedule(cronTime, async () => {
        try {
            console.log('📋 Résumé quotidien en cours...');

            const messages = await getUnsummarizedMessages(userId);

            if (messages.length === 0) {
                console.log('✅ Aucun message à résumer');
                return;
            }

            const { summary, tasks } = await summarizeMessages(messages, userId);

            await sendTelegramMessage(`📋 Résumé automatique du jour:\n\n${summary}`);
            await sendWhatsAppMessage(userId, getOwnJid(userId), `📋 Résumé automatique du jour:\n\n${summary}`)

            if (tasks && tasks.length > 0) {
                await saveTasks(tasks, userId);
            }

            const ids = messages.map(m => m.id);
            await markAsSummarized(ids, userId);

            console.log('✅ Résumé envoyé');

        } catch (err) {
            logSafeError('Erreur résumé quotidien', err);
        }
    });

    console.log(`⏰ Résumé programmé pour ${summaryHour}:00`);
}
