import { validateEnvironment } from './config.js';

import {
    initDB,
    closeDB,
    getUnsummarizedMessages,
    markAsSummarized,
    getSetting,
    getAllSettings,
    setSetting,
    getPendingTasks,
    markTaskDone,
    saveTasks,
    getConversationHistory,
    getPendingDraft,
    markDraftSent,
    saveDraft,
    searchArchiveByKeyword,
    deleteAllStoredData
} from '../infrastructure/database/index.js';

import {
    startWhatsApp,
    requestPairingCode,
    sendWhatsAppMessage,
    logoutWhatsApp,
    getOwnJid
} from '../infrastructure/whatsapp/whatsapp-client.js';

import {
    startTelegramListener,
    sendTelegramMessageForUser
} from '../infrastructure/telegram/telegram-client.js';

import { scheduleDailySummary } from '../jobs/scheduler.js';
import { logSafeError } from '../infrastructure/logger.js';

import { PERSONALITY, createHakiliAIService } from '../application/services/hakili-ai-service.js';
import { createUrgencyService } from '../application/services/urgency-service.js';

import { createTaskUseCases } from '../application/use-cases/task-use-cases.js';
import { createSettingsUseCases } from '../application/use-cases/settings-use-cases.js';
import { createDraftUseCases } from '../application/use-cases/draft-use-cases.js';
import { createChatUseCase } from '../application/use-cases/chat-use-case.js';
import { createSearchUseCases } from '../application/use-cases/search-use-cases.js';
import { createMessageProcessingUseCase } from '../application/use-cases/message-processing-use-case.js';
import { createCommandUseCases } from '../application/use-cases/command-use-cases.js';
import { createCommandRouter } from '../interfaces/whatsapp/command-router.js';

// --- Services applicatifs (dépendent de la persistance et du provider IA) ---

const aiService = createHakiliAIService({ getSetting });
const { callAI, summarizeMessages, confirmUrgency, generateDraftReply, chatReply } = aiService;

const urgencyService = createUrgencyService({ getSetting });

// --- Use cases ---

const taskUseCases = createTaskUseCases({
    taskRepository: {
        listPending: getPendingTasks,
        complete: markTaskDone
    }
});

const settingsUseCases = createSettingsUseCases({
    settingsRepository: {
        list: getAllSettings,
        set: setSetting
    }
});

const draftUseCases = createDraftUseCases({
    draftRepository: {
        create: saveDraft,
        findPendingById: getPendingDraft,
        markSent: markDraftSent
    },
    sendWhatsAppMessage,
    sendTelegramMessageForUser,
    getOwnJid,
    logSafeError
});

const chatUseCase = createChatUseCase({
    sendWhatsAppMessage,
    chatReply,
    logSafeError
});

const searchUseCases = createSearchUseCases({
    searchArchiveByKeyword,
    callAI,
    logSafeError
});

const messageProcessingUseCase = createMessageProcessingUseCase({
    getSetting,
    isPotentiallyUrgent: urgencyService.isPotentiallyUrgent,
    confirmUrgency,
    sendTelegramMessageForUser,
    sendWhatsAppMessage,
    getOwnJid,
    getConversationHistory,
    generateDraftReply,
    addDraft: draftUseCases.addDraft,
    logSafeError
});

const commandUseCases = createCommandUseCases({
    getUnsummarizedMessages,
    summarizeMessages,
    saveTasks,
    markAsSummarized,
    hybridSearch: searchUseCases.hybridSearch,
    callAI,
    getOwnJid,
    taskUseCases,
    settingsUseCases,
    PERSONALITY,
    deleteAllStoredData,
    logoutWhatsApp,
    logSafeError
});

// --- Interfaces : routage des commandes WhatsApp/Telegram ---

async function pairWhatsApp(userId, phoneNumber) {
    await startWhatsApp(userId, getWhatsAppHandlers());
    return requestPairingCode(userId, phoneNumber);
}

const commandRouter = createCommandRouter({
    commandUseCases,
    draftUseCases,
    pairWhatsApp,
    sendWhatsAppMessage,
    sendTelegramMessageForUser,
    logSafeError
});

export function getWhatsAppHandlers() {
    return {
        onMessage: messageProcessingUseCase.handleWhatsAppMessage,
        onCommand: commandRouter.handleWhatsAppCommand,
        onSelfChat: chatUseCase.handleChatMessage
    };
}

function printAvailableCommands() {
    console.log(
        '\n📱 Commandes disponibles (WhatsApp + Telegram):'
    );

    console.log(
        '  /resume                 -> résumé immédiat'
    );

    console.log(
        '  /search <question>      -> recherche en langage naturel'
    );

    console.log(
        '  /taches                 -> tâches en attente'
    );

    console.log(
        '  /fait <id>              -> marquer une tâche finie'
    );

    console.log(
        '  /envoie <id>            -> envoyer brouillon'
    );

    console.log(
        '  /settings               -> voir tous les paramètres'
    );

    console.log(
        '  /set <clé> <valeur>     -> modifier un paramètre'
    );

    console.log(
        '  /help                   -> afficher les commandes'
    );

    console.log(
        '\nParle directement à ton propre chat WhatsApp pour discuter avec le bot.\n'
    );
}

process.on('uncaughtException', (err) => {
    logSafeError('Erreur non interceptée (le bot continue)', err);
});

process.on('unhandledRejection', (err) => {
    logSafeError('Rejet de promesse non intercepté (le bot continue)', err);
});

export async function main() {
    try {
        validateEnvironment();
        console.log('🚀 Démarrage du bot WhatsApp...');

        await initDB();
        console.log('✅ Base de données initialisée');

        await startWhatsApp('legacy', getWhatsAppHandlers());

        console.log('✅ WhatsApp connecté');

        startTelegramListener(commandRouter.handleTelegramCommand);
        console.log('✅ Telegram écouté');

        scheduleDailySummary();
        console.log('✅ Résumé quotidien programmé');

        printAvailableCommands();

    } catch (err) {
        logSafeError('Erreur fatale au démarrage', err);

        await closeDB();

        process.exit(1);
    }
}
