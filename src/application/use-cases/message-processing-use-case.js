function requireFunction(fn, name) {
    if (typeof fn !== 'function') {
        throw new Error(`Message processing use case requires a ${name} function`);
    }
    return fn;
}

/**
 * Use case central : traitement d'un message WhatsApp entrant.
 *
 * Deux comportements indépendants, chacun activable via un réglage
 * utilisateur :
 *  - détection d'urgence -> alerte sur Telegram et WhatsApp si confirmée ;
 *  - mode brouillon -> génère une proposition de réponse à partir de
 *    l'historique récent de la conversation, envoyée pour validation.
 *
 * Toutes les dépendances sont injectées pour ne pas dépendre directement
 * d'une implémentation concrète de la persistance, de WhatsApp, Telegram
 * ou de l'IA.
 */
export function createMessageProcessingUseCase({
    getSetting,
    isPotentiallyUrgent,
    confirmUrgency,
    sendTelegramMessageForUser,
    sendWhatsAppMessage,
    getOwnJid,
    getConversationHistory,
    generateDraftReply,
    addDraft,
    logSafeError
}) {
    requireFunction(getSetting, 'getSetting');
    requireFunction(isPotentiallyUrgent, 'isPotentiallyUrgent');
    requireFunction(confirmUrgency, 'confirmUrgency');
    requireFunction(sendTelegramMessageForUser, 'sendTelegramMessageForUser');
    requireFunction(sendWhatsAppMessage, 'sendWhatsAppMessage');
    requireFunction(getOwnJid, 'getOwnJid');
    requireFunction(getConversationHistory, 'getConversationHistory');
    requireFunction(generateDraftReply, 'generateDraftReply');
    requireFunction(addDraft, 'addDraft');
    requireFunction(logSafeError, 'logSafeError');

    async function handleWhatsAppMessage(msgData) {
        const {
            sender,
            sender_name,
            content,
            isGroup,
            isStatus,
            isNewsletter
        } = msgData;
        const userId = msgData.userId || 'legacy';

        console.log(
            `📩 Message reçu de ${sender_name || sender}`
        );

        const urgencyDetectionOn =
            (await getSetting('urgency_detection', userId)) === 'on';
        const potentiallyUrgent = await isPotentiallyUrgent(content, userId);

        if (
            urgencyDetectionOn &&
            potentiallyUrgent
        ) {
            try {
                const {
                    urgent,
                    reason
                } = await confirmUrgency({ sender, content }, userId);
                console.log('urgent', urgent);

                console.log('reason', reason);

                if (urgent) {
                    const alertMessage =
                        `🚨 Vous avez un message URGENT de ${sender_name || sender}:\n` +
                        `${content}\n`;

                    await sendTelegramMessageForUser(alertMessage, userId);

                    await sendWhatsAppMessage(
                        userId,
                        getOwnJid(userId),
                        alertMessage
                    );

                    console.log(
                        '🚨 Alerte urgence envoyée sur Telegram et WhatsApp'
                    );
                } else console.log("Pas urgent");


            } catch (err) {
                logSafeError('Erreur détection urgence', err);
            }
        }

        const draftModeOn =
            (await getSetting('draft_mode', userId)) === 'on';

        if (!draftModeOn) {
            return;
        }

        if (isGroup || isStatus || isNewsletter) {
            return;
        }

        if (!content?.trim()) {
            return;
        }

        if (content.trim().startsWith('/')) {
            return;
        }

        try {
            console.log(
                `📝 Génération draft pour ${sender_name || sender}`
            );

            const recentHistory =
                await getConversationHistory(
                    sender,
                    20,
                    msgData.id,
                    userId
                );

            console.log(
                `📚 Historique conversation : ${recentHistory.length} messages`
            );

            const draft =
                await generateDraftReply({
                    sender,
                    recentHistory,
                    incomingContent: content,
                    userId
                });

            if (!draft?.trim()) {
                console.log(
                    '⚠️ Aucun draft généré'
                );

                return;
            }

            const draftId =
                await addDraft(
                    sender,
                    draft.trim(),
                    sender_name,
                    userId
                );

            if (!draftId) {
                console.error(
                    '❌ Impossible de créer le draft'
                );

                return;
            }

            console.log(
                `📝 Draft #${draftId} créé`
            );

            const displayName = sender_name || sender;
            const draftMessage = `📝 Brouillon #${draftId}\n\n` +
                `Vous avez reçu un message de 👤 ${sender_name || sender}:\n\nMessage: ${content?.substring(0, 100)}...\n\n` +
                `Voici une proposition de réponse: \n\n` +
                `${draft.trim()}\n\n` +
                `📤 Entrez : /envoie ${draftId} pour que je lui envoie directement la réponse`
            let jid = getOwnJid(userId);
            console.log('jid: ', jid);

            await sendTelegramMessageForUser(draftMessage, userId
            );
            await sendWhatsAppMessage(userId, jid, draftMessage
            )
            console.log(
                `📲 Draft #${draftId} envoyé sur Telegram et whatsapp`
            );

        } catch (err) {
            logSafeError('Erreur génération brouillon', err);
        }
    }

    return { handleWhatsAppMessage };
}
