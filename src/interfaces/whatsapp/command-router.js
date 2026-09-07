function requireFunction(fn, name) {
    if (typeof fn !== 'function') {
        throw new Error(`Command router requires a ${name} function`);
    }
    return fn;
}

const HELP_TEXT = `
📱 Commandes disponibles :

/resume
→ Résumé immédiat

/search <question>
→ Recherche dans l'historique

/taches
→ Afficher les tâches en attente

/fait <id>
→ Marquer une tâche comme terminée

/envoie <id>
→ Envoyer un brouillon

/settings
→ Voir les paramètres

/set <clé> <valeur>
→ Modifier un paramètre

/supprimer-donnees CONFIRMER
→ Supprimer toutes les données et la session WhatsApp
`;

/**
 * Interface de commande partagée entre WhatsApp et Telegram : parse le
 * texte brut d'une commande (ex: "/set draft_mode on") et appelle le use
 * case métier correspondant.
 *
 * Ne connaît pas le canal d'origine au niveau du parsing — construit une
 * fonction reply(message) adaptée au canal (WhatsApp ou Telegram) reçu en
 * paramètre. pairWhatsApp est injecté (déjà lié aux bons handlers
 * WhatsApp par le bootstrap) pour éviter toute dépendance circulaire
 * entre ce router et le module WhatsApp.
 */
export function createCommandRouter({
    commandUseCases,
   // draftUseCases,
    pairWhatsApp,
    sendWhatsAppMessage,
    sendTelegramMessageForUser,
    logSafeError
}) {
    if (!commandUseCases) {
        throw new Error('Command router requires commandUseCases');
    }
   /*  if (!draftUseCases || typeof draftUseCases.handleDraftCommand !== 'function') {
        throw new Error('Command router requires draftUseCases');
    } */
    requireFunction(pairWhatsApp, 'pairWhatsApp');
    requireFunction(sendWhatsAppMessage, 'sendWhatsAppMessage');
    requireFunction(sendTelegramMessageForUser, 'sendTelegramMessageForUser');
    requireFunction(logSafeError, 'logSafeError');

    function createReply(source, sender, userId = 'legacy') {
        if (source === 'whatsapp') {
            return async (message) => {
                await sendWhatsAppMessage(
                    userId,
                    sender,
                    message
                );
            };
        }

        return async (message) => {
            await sendTelegramMessageForUser(message, userId);
        };
    }

    async function handleHelpCommand(reply) {
        await reply(HELP_TEXT);
    }

    async function handleCommand(
        commandText,
        source,
        sender,
        userId = 'legacy'
    ) {
        const args =
            commandText.trim().split(/\s+/);

        const cmd =
            args[0]?.toLowerCase();

        const reply =
            createReply(source, sender, userId);

        switch (cmd) {

            case '/start':
                await reply(
                    'Bienvenue. Utilise /pair <numero WhatsApp> pour connecter ton compte, par exemple /pair 33612345678.'
                );
                break;

            case '/pair': {
                const phoneNumber = args[1];
                if (!phoneNumber) {
                    await reply('❌ Utilisation : /pair <numero WhatsApp>');
                    return;
                }

                try {
                    const code = await pairWhatsApp(userId, phoneNumber);
                    await reply(`📱 Code de pairing WhatsApp : ${code}`);
                } catch (err) {
                    logSafeError('Erreur /pair', err);
                    await reply('❌ Impossible de générer le code de pairing. Réessaie avec le numéro au format international.');
                }
                break;
            }

            case '/resume':
                await commandUseCases.handleResumeCommand(reply, userId);
                break;

            case '/search': {
                const query =
                    args.slice(1).join(' ');

                if (!query) {
                    await reply(
                        '❌ Utilisation : /search <question>'
                    );
                    return;
                }

                await commandUseCases.handleSearchCommand(
                    query,
                    reply,
                    userId
                );

                break;
            }

            case '/taches':
                await commandUseCases.handleTasksCommand(reply, userId);
                break;

            case '/fait': {
                const taskId = args[1];

                if (!taskId) {
                    await reply(
                        '❌ Utilisation : /fait <id>'
                    );
                    return;
                }

                await commandUseCases.handleTaskDoneCommand(
                    taskId,
                    reply,
                    userId
                );

                break;
            }

            case '/envoie': {
                const draftId = args[1];

                if (!draftId) {
                    await reply(
                        '❌ Utilisation : /envoie <id>'
                    );
                    return;
                }

                await draftUseCases.handleDraftCommand(
                    draftId,
                    sender,
                    userId
                );

                break;
            }

            case '/settings':
                await commandUseCases.handleSettingsCommand(reply, userId);
                break;

            case '/supprimer-donnees':
                await commandUseCases.handleDeleteDataCommand(args[1], reply, userId);
                break;

            case '/set': {
                const key = args[1];
                const value =
                    args.slice(2).join(' ');

                if (!key || !value) {
                    await reply(
                        '❌ Utilisation : /set <clé> <valeur>'
                    );
                    return;
                }

                await commandUseCases.handleSetCommand(
                    key,
                    value,
                    reply,
                    userId
                );

                break;
            }

            case '/help':
                await handleHelpCommand(reply);
                break;

            default:
                await reply(
                    `❓ Commande inconnue : ${cmd}\n\nTape /help pour voir les commandes.`
                );
        }
    }

    async function handleWhatsAppCommand(
        command,
        sender,
        userId = 'legacy'
    ) {
        await handleCommand(
            command,
            'whatsapp',
            sender,
            userId
        );
    }

    async function handleTelegramCommand(
        commandText,
        sender,
        userId = 'legacy'
    ) {
        await handleCommand(
            commandText,
            'telegram',
            sender,
            userId
        );
    }

    return {
        handleCommand,
        handleWhatsAppCommand,
        handleTelegramCommand,
        handleHelpCommand
    };
}
