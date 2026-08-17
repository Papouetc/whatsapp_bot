import {
  sendWhatsAppMessage,
  getOwnJid
} from './whatsapp.js';

import {
  sendTelegramMessage
} from './telegram.js';

const drafts = new Map();
let nextId = 1;

export function addDraft(sender, content,sender_name) {
  try {
    const id = nextId++;

    drafts.set(id, {
      sender,
      content,
      sender_name
    });

    console.log(
      `📝 Draft #${id} ajouté pour ${sender_name}`
    );

    return id;

  } catch (error) {
    console.error(
      '❌ Erreur ajout draft:',
      error
    );

    return null;
  }
}

export async function handleDraftCommand(
  draftId,
  requestingSender,
) {
  try {
    const id =
      parseInt(draftId, 10);

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      await sendTelegramMessage(
        `❌ Identifiant de brouillon invalide : ${draftId}`
      );

      return;
    }

    const draft =
      drafts.get(id);

    if (!draft) {
      await sendTelegramMessage(
        `❌ Brouillon #${id} introuvable ou déjà envoyé.`
      );

      return;
    }

    console.log(
      `📤 Envoi du brouillon #${id}`
    );

    console.log(
      `👤 Destinataire : ${draft.sender_name||draft.sender}`
    );

    console.log(
      `💬 Contenu : ${draft.content}`
    );

    await sendWhatsAppMessage(
      draft.sender,
      draft.content
    );

    drafts.delete(id);

    console.log(
      `✅ Brouillon #${id} envoyé à ${draft.sender_name||draft.sender}`
    );

    await sendTelegramMessage(
      `✅ Draft #${id} envoyé à ${draft.sender_name||draft.sender}`
    );

    await sendWhatsAppMessage(
      getOwnJid(),
      `✅ Draft #${id} envoyé à ${draft.sender_name||draft.sender}`
    );

  } catch (error) {
    console.error(
      `❌ Erreur envoi draft #${draftId}:`,
      error
    );

    await sendTelegramMessage(
      `❌ Échec de l'envoi du draft #${draftId}.\n\n` +
      `Destinataire : ${drafts.get(parseInt(draftId, 10))?.sender || 'inconnu'}`
    );
  }
}