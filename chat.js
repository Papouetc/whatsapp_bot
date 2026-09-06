// Façade de compatibilité pendant le refactoring architectural.
// La logique réelle vit désormais dans
// src/application/use-cases/chat-use-case.js.
import { sendWhatsAppMessage } from './whatsapp.js';
import { chatReply } from './ai.js';
import { logSafeError } from './logger.js';
import { createChatUseCase } from './src/application/use-cases/chat-use-case.js';

const chatUseCase = createChatUseCase({ sendWhatsAppMessage, chatReply, logSafeError });

export const handleChatMessage = chatUseCase.handleChatMessage;
