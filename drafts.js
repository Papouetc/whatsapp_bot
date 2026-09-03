import {
  sendWhatsAppMessage,
  getOwnJid
} from './whatsapp.js';

import {
  sendTelegramMessageForUser
} from './telegram.js';
import { logSafeError } from './logger.js';

const drafts = new Map();
let nextId = 1;

export function addDraft(sender, content, sender_name, userId = 'legacy') {
  try {
    const id = nextId++;

    drafts.set(id, {
      sender,
      content,
      sender_name,
      userId
    });

    console.log(
      `📝 Draft #${id} ajouté pour ${sender_name}`
    );

    return id;

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

    const draft =
      drafts.get(id);

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

    drafts.delete(id);

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
      `Destinataire : ${drafts.get(parseInt(draftId, 10))?.sender || 'inconnu'}`,
      userId
    );
  }
}