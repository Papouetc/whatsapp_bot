import {
  sendWhatsAppMessage,
  getOwnJid
} from './whatsapp.js';

import {
  sendTelegramMessageForUser
} from './telegram.js';
import {
  getPendingDraft,
  markDraftSent,
  saveDraft
} from './database.js';
import { logSafeError } from './logger.js';

export async function addDraft(sender, content, sender_name, userId) {
  try {
    const draft = await saveDraft({
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

export async function handleDraftCommand(
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

    const draft = await getPendingDraft(id, userId);

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

    const markedSent = await markDraftSent(id, userId);

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