function requireFunction(fn, name) {
    if (typeof fn !== 'function') {
        throw new Error(`Chat use case requires a ${name} function`);
    }
    return fn;
}

const MAX_HISTORY = 20;

/**
 * Use case Chat : conversation directe avec Hakili sur le self-chat
 * WhatsApp. L'historique de conversation est gardé en mémoire par
 * utilisateur (non persisté en base) — comportement identique à
 * l'implémentation d'origine.
 *
 * Dépendances injectées pour ne pas dépendre directement d'une
 * implémentation concrète de WhatsApp ou du service IA.
 */
export function createChatUseCase({ sendWhatsAppMessage, chatReply, logSafeError }) {
    requireFunction(sendWhatsAppMessage, 'sendWhatsAppMessage');
    requireFunction(chatReply, 'chatReply');
    requireFunction(logSafeError, 'logSafeError');

    const conversationHistories = new Map();

    async function handleChatMessage(content, sender, userId = 'legacy') {
        try {
            const conversationHistory = conversationHistories.get(userId) || [];
            conversationHistories.set(userId, conversationHistory);
            conversationHistory.push({ role: 'user', content: content });
            const response = await chatReply({ conversationHistory: conversationHistory, userMessage: content, archiveContext: [], userId });
            conversationHistory.push({ role: 'bot', content: response });
            if (conversationHistory.length > MAX_HISTORY) {
                conversationHistory.splice(0, conversationHistory.length - MAX_HISTORY);
            }
            await sendWhatsAppMessage(userId, sender, response);
        } catch (error) {
            logSafeError('Erreur conversation', error);
        }
    }

    return { handleChatMessage };
}
