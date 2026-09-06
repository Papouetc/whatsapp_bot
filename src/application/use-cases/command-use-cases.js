function requireFunction(fn, name) {
    if (typeof fn !== 'function') {
        throw new Error(`Command use cases require a ${name} function`);
    }
    return fn;
}

/**
 * Use cases des commandes métier de Hakili (/resume, /search, /taches,
 * /fait, /settings, /set, /supprimer-donnees).
 *
 * Chaque use case reçoit une fonction `reply(message)` déjà liée au bon
 * canal (WhatsApp ou Telegram) par l'appelant — ces use cases ne
 * connaissent donc pas la différence entre les deux canaux, seulement
 * comment répondre.
 *
 * Dépendances injectées pour ne pas dépendre directement d'une
 * implémentation concrète de la persistance, de WhatsApp ou de l'IA.
 */
export function createCommandUseCases({
    getUnsummarizedMessages,
    summarizeMessages,
    saveTasks,
    markAsSummarized,
    hybridSearch,
    callAI,
    getOwnJid,
    taskUseCases,
    settingsUseCases,
    PERSONALITY,
    deleteAllStoredData,
    logoutWhatsApp,
    logSafeError
}) {
    requireFunction(getUnsummarizedMessages, 'getUnsummarizedMessages');
    requireFunction(summarizeMessages, 'summarizeMessages');
    requireFunction(saveTasks, 'saveTasks');
    requireFunction(markAsSummarized, 'markAsSummarized');
    requireFunction(hybridSearch, 'hybridSearch');
    requireFunction(callAI, 'callAI');
    requireFunction(getOwnJid, 'getOwnJid');
    requireFunction(deleteAllStoredData, 'deleteAllStoredData');
    requireFunction(logoutWhatsApp, 'logoutWhatsApp');
    requireFunction(logSafeError, 'logSafeError');
    if (!taskUseCases || typeof taskUseCases.listPending !== 'function' || typeof taskUseCases.complete !== 'function') {
        throw new Error('Command use cases require taskUseCases');
    }
    if (!settingsUseCases || typeof settingsUseCases.list !== 'function' || typeof settingsUseCases.set !== 'function') {
        throw new Error('Command use cases require settingsUseCases');
    }

    async function handleResumeCommand(reply, userId = 'legacy') {
        try {
            const messages =
                await getUnsummarizedMessages(userId);

            if (messages.length === 0) {
                await reply(
                    '✅ Aucun nouveau message à résumer.'
                );
                return;
            }

            const {
                summary,
                tasks
            } = await summarizeMessages(messages, userId);

            await reply(
                `📋 Résumé :\n${summary}`
            );

            if (
                tasks &&
                tasks.length > 0
            ) {
                await saveTasks(tasks, userId);
            }

            const ids =
                messages.map(
                    message => message.id
                );

            await markAsSummarized(ids, userId);

        } catch (err) {
            logSafeError('Erreur /resume', err);

            await reply(
                '❌ Erreur lors de la génération du résumé.'
            );
        }
    }

    async function handleSearchCommand(
        query,
        reply,
        userId = 'legacy'
    ) {
        reply(`Je lance la recherche dans vos messages récent...`);

        try {
            if (!query?.trim()) {
                await reply(
                    '❌ Utilisation : /search <question>'
                );
                return;
            }

            const results =
                await hybridSearch(query, userId);

            if (results.length === 0) {
                await reply(
                    `🔎 Aucun message pertinent trouvé pour : "${query}"`
                );
                return;
            }

            const context =
                results
                    .map((msg) => {
                        const date =
                            new Date(
                                Number(msg.timestamp)
                            ).toLocaleString('fr-FR');

                        const chatName =
                            msg.chat_name ||
                            msg.chat_id;

                        const senderName =
                            msg.sender_name ||
                            msg.sender;

                        return `[${date}] ${chatName} | ${senderName}: ${msg.content}`;
                    })
                    .join('\n');

            const jid =
                getOwnJid(userId);

            const answer =
                await callAI(
                    `
Tu es un assistant personnel qui recherche des informations dans l'historique WhatsApp.

QUESTION DE L'UTILISATEUR :
"${query}"

MESSAGES RETROUVÉS :
${context}

Réponds directement à la question en utilisant UNIQUEMENT les informations présentes dans les messages.

RÈGLES :
- Ne fabrique aucune information.
- Ne déduis pas une personne, une date ou une action qui n'est pas identifiable dans les messages.
- Regroupe les messages qui parlent du même événement.
- Si la réponse est identifiable, donne-la directement.
- Si les messages permettent seulement une réponse partielle, indique précisément ce qui est certain.
- Si les messages ne permettent pas de répondre, dis-le clairement.
- Utilise les noms des contacts et des groupes lorsqu'ils sont disponibles.
- Ne mentionne pas la recherche, la base de données, Groq ou ton fonctionnement.
- Sois concis mais précis.

IMPORTANT :

Certains messages peuvent contenir des identifiants WhatsApp comme
@198509831667939 ou 198509831667939@lid.

Si l'identifiant correspond au compte de l'utilisateur, considère qu'il désigne l'utilisateur lui-même.

Ne réponds pas simplement en répétant l'identifiant technique.

Transforme les informations techniques en une réponse naturelle.

Le compte utilisateur est : ${jid}
        `,
                    context,
                    { userId }
                );

            await reply(
                `🔎 Recherche : ${query}\n\n${answer}`
            );

        } catch (err) {
            logSafeError('Erreur /search', err);

            await reply(
                '❌ Une erreur est survenue pendant la recherche.'
            );
        }
    }

    async function handleTasksCommand(reply, userId = 'legacy') {
        try {
            const tasks =
                await taskUseCases.listPending(userId);

            if (tasks.length === 0) {
                await reply(
                    '✅ Aucune tâche en attente.'
                );
                return;
            }

            let response =
                '📝 Tâches en attente\n\n';

            tasks.forEach(task => {
                response +=
                    `[${task.id}] ${task.description}\n`;
            });

            response +=
                '\n💡 /fait <id> → terminer une tâche';

            await reply(response);

        } catch (err) {
            logSafeError('Erreur /taches', err);

            await reply(
                '❌ Impossible de récupérer les tâches.'
            );
        }
    }

    async function handleTaskDoneCommand(
        taskId,
        reply,
        userId = 'legacy'
    ) {
        try {
            const id =
                parseInt(taskId, 10);

            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {
                await reply(
                    '❌ Identifiant de tâche invalide.'
                );
                return;
            }

            const success =
                await taskUseCases.complete(id, userId);

            if (success) {
                await reply(
                    `✅ Tâche ${id} marquée comme terminée.`
                );
            } else {
                await reply(
                    `❌ Tâche ${id} introuvable ou déjà terminée.`
                );
            }

        } catch (err) {
            logSafeError('Erreur /fait', err);

            await reply(
                '❌ Erreur lors de la mise à jour de la tâche.'
            );
        }
    }

    async function handleSettingsCommand(reply, userId = 'legacy') {
        try {
            const settings =
                await settingsUseCases.list(userId);

            let response = await callAI(`${PERSONALITY} Tu es un assistant personnelle sur whatsapp, tu as un certains nombre de fo
      fonctinnalité. L'utilisateur te demande de faire le point sur tes settings. Présente les paramètres sous forme de sections courtes et clairement séparées.

      Utilise exactement cette structure :
      
      ⚙️ Mes paramètres
      
      📝 Brouillons
      [statut + courte explication]
      
      🚨 Détection d'urgence
      [statut + courte explication]
      
      📋 Résumé quotidien
      [heure]
      
      🔎 Recherche
      [période disponible]
      
      🧠 Mémoire
      [nombre de messages]
      
      🤖 IA
      [fournisseur]
      
      🌐 Langue
      [langue]
      
      ⚙️ Pour modifier un paramètre :
      /set <clé> <valeur>
      
      Règles :
      - N'invente aucune information.
      - Utilise uniquement les paramètres fournis.
      - N'affiche pas les paramètres techniques internes.
      - Traduis les valeurs techniques en langage naturel.
      - Si un paramètre n'est pas présent, ne crée pas de section pour celui-ci.
      - Garde les descriptions très courtes.
      - Conserve les emojis et la structure indiquée.
      - Réponds uniquement avec le message destiné à l'utilisateur.
      
      n'invente pas de settings et cache les paramètres techniques comme :

      draft_mode_off_for: []
      `, `Parametres: ${JSON.stringify(settings)}`,
                { json: false, userId })


            await reply(response);

        } catch (err) {
            logSafeError('Erreur /settings', err);

            await reply(
                '❌ Erreur lors de la récupération des paramètres.'
            );
        }
    }

    async function handleDeleteDataCommand(confirmation, reply, userId = 'legacy') {
        if (confirmation !== 'CONFIRMER') {
            await reply(
                '⚠️ Cette action supprimera messages, tâches, réglages et session WhatsApp. Pour confirmer, utilise : /supprimer-donnees CONFIRMER'
            );
            return;
        }

        try {
            await deleteAllStoredData(userId);
            await logoutWhatsApp(userId);
            await reply(
                '✅ Toutes les données ont été supprimées. Un nouveau pairing WhatsApp sera nécessaire.'
            );
        } catch (err) {
            logSafeError('Erreur suppression des données', err);
            await reply('❌ Impossible de supprimer toutes les données.');
        }
    }

    async function handleSetCommand(
        key,
        value,
        reply,
        userId = 'legacy'
    ) {
        try {
            await settingsUseCases.set(
                key,
                value,
                userId
            );

            await reply(
                `✅ ${key} défini à ${value}`
            );

        } catch (err) {
            logSafeError('Erreur /set', err);

            await reply(
                '❌ Erreur lors de la mise à jour du paramètre.'
            );
        }
    }

    return {
        handleResumeCommand,
        handleSearchCommand,
        handleTasksCommand,
        handleTaskDoneCommand,
        handleSettingsCommand,
        handleDeleteDataCommand,
        handleSetCommand
    };
}
