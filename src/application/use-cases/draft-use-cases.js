function requireDraftRepository(draftRepository) {
    if (!draftRepository
        || typeof draftRepository.create !== 'function'
        || typeof draftRepository.findPendingById !== 'function'
        || typeof draftRepository.markSent !== 'function') {
        throw new Error('Draft use cases require a draft repository');
    }

    return draftRepository;
}

function requireFunction(fn, name) {
    if (typeof fn !== 'function') {
        throw new Error(`Draft use cases require a ${name} function`);
    }
    return fn;
}

/**
 * Use cases Drafts : créer un brouillon de réponse en attente de validation,
 * puis l'envoyer sur WhatsApp avec confirmation sur WhatsApp et Telegram.
 *
 * Dépendances injectées pour ne pas dépendre directement d'une
 * implémentation concrète de la persistance ou des canaux de messagerie.
 */
export function createDraftUseCases({
    draftRepository,
    sendWhatsAppMessage,
    sendTelegramMessageForUser,
    getOwnJid,
    logSafeError
}) {
    const repository = requireDraftRepository(draftRepository);
    requireFunction(sendWhatsAppMessage, 'sendWhatsAppMessage');
    requireFunction(sendTelegramMessageForUser, 'sendTelegramMessageForUser');
    requireFunction(getOwnJid, 'getOwnJid');
    requireFunction(logSafeError, 'logSafeError');

    async function addDraft(sender, content, sender_name, userId) {
        try {
            const draft = await repository.create({
                sender,
                content,
                sender_name,
            }, userId);

            console.log(
                `📝 Draft #${draft.id} ajouté pour l'utilisateur ${userId}`
            );

            return draft.id;

        } catch (error) {
            logSafeError('Erreur ajout draft', error);

            return null;
        }
    }

    async function handleDraftCommand(
        draftId,
        requestingSender,
        userId = 'legacy'
    ) {
        try {
            const id =
                parseInt(draftId, 10);

            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {
                await sendTelegramMessageForUser(
                    `❌ Identifiant de brouillon invalide : ${draftId}`,
                    userId
                );

                return;
            }

            const draft = await repository.findPendingById(id, userId);

            if (!draft || draft.userId !== userId) {
                await sendTelegramMessageForUser(
                    `❌ Brouillon #${id} introuvable ou déjà envoyé.`,
                    userId
                );

                return;
            }

            console.log(
                `📤 Envoi du brouillon #${id}`
            );

            await sendWhatsAppMessage(
                userId,
                draft.sender,
                draft.content
            );

            const markedSent = await repository.markSent(id, userId);

            if (!markedSent) {
                throw new Error(`Draft #${id} déjà consommé ou introuvable`);
            }

            console.log(
                `✅ Brouillon #${id} envoyé à ${draft.sender_name || draft.sender}`
            );

            await sendTelegramMessageForUser(
                `✅ Draft #${id} envoyé à ${draft.sender_name || draft.sender}`,
                userId
            );

            await sendWhatsAppMessage(
                userId,
                getOwnJid(userId),
                `✅ Draft #${id} envoyé à ${draft.sender_name || draft.sender}`
            );

        } catch (error) {
            logSafeError(`Erreur envoi draft #${draftId}`, error);

            await sendTelegramMessageForUser(
                `❌ Échec de l'envoi du draft #${draftId}.\n\n` +
                `Le brouillon reste disponible pour une nouvelle tentative.`,
                userId
            );
        }
    }

    return { addDraft, handleDraftCommand };
}
