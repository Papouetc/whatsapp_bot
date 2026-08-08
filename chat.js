import { sendWhatsAppMessage } from './whatsapp.js';
import { chatReply } from './ai.js';

const conversationHistory = [];
const MAX_HISTORY = 20;

export async function handleChatMessage(content, sender) {
try {
    conversationHistory.push({ role: 'user', content: content });
    const response= await chatReply({conversationHistory: conversationHistory, userMessage: content, archiveContext: []})
    conversationHistory.push({role: 'bot',content: response })
    if (conversationHistory.length > MAX_HISTORY) {
      conversationHistory.splice(0, conversationHistory.length - MAX_HISTORY);
    }
    await sendWhatsAppMessage(sender, response);
} catch (error) {
    console.error(error);
    
}
}