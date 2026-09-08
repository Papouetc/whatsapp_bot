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
function isneedDraft(content){
      let key_words= 
      key_words= key_words.split(',')
      return (key_words.some((kw)=>content.toLowerCase().includes(kw)))
}
export async function createDraft(msgData){
  const {
    sender,
    sender_name,
    content
  } = msgData;
  try {
  console.log(
    `Génération draft pour ${sender_name || sender}`
  );

  const recentHistory =
    await getConversationHistory(
      sender,
      20,
      msgData.id
    );

  console.log(
    `Historique conversation : ${recentHistory.length} messages`
  );

  const draft =
    await generateDraftReply({
      sender,
      recentHistory,
      incomingContent: content
    });

  if (!draft?.trim()) {
    console.log(
      'Aucun draft généré'
    );

    return;
  }

  const draftId =
    addDraft(
      sender,
      draft.trim(),
      sender_name
    );

  if (!draftId) {
    console.error(
      'Impossible de créer le draft'
    );

    return;
  }

  console.log(
    ` Draft #${draftId} créé`
  );

  const displayName = sender_name || sender;
  const draftMessage=  `📝 Brouillon #${draftId}\n\n` +
  `Vous avez reçu un message de 👤 ${sender_name || sender}:\n\nMessage: ${content?.substring(0, 100)}...\n\n`+
  `Voici une proposition de réponse: \n\n` +
  `${draft.trim()}\n\n` +
  `📤 Entrez : /envoie ${draftId} pour que je lui envoie directement la réponse`
  let jid= getOwnJid();
  console.log('jid: ',jid);
  
  await sendTelegramMessage( draftMessage
  );
  await sendWhatsAppMessage(jid,draftMessage
   )
  console.log(
    ` Draft #${draftId} envoyé sur Telegram et whatsapp`
  );

} catch (err) {
  console.error(
    'Erreur génération brouillon:',
    err
  );
}
}