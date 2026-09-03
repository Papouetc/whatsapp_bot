import { sendWhatsAppMessage, sendWhatsAppMessageReaction } from './whatsapp.js';
import { chatReply } from './ai.js';
import { logSafeError } from './logger.js';

const conversationHistories = new Map();
const MAX_HISTORY = 20;

export async function handleChatMessage(content, sender, userId = 'legacy') {
    try {
        const conversationHistory = conversationHistories.get(userId) || [];
        conversationHistories.set(userId, conversationHistory);
        conversationHistory.push({ role: 'user', content: content });
        const response = await chatReply({ conversationHistory: conversationHistory, userMessage: content, archiveContext: [], userId })
        conversationHistory.push({ role: 'bot', content: response })
        if (conversationHistory.length > MAX_HISTORY) {
            conversationHistory.splice(0, conversationHistory.length - MAX_HISTORY);
        }
        await sendWhatsAppMessage(userId, sender, response);
    } catch (error) {
        logSafeError('Erreur conversation', error);

    }
}