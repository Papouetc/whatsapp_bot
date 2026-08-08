import {sendWhatsAppMessage,  getOwnJid } from './whatsapp.js';
import {sendTelegramMessage} from './telegram.js';
const drafts = new Map();
let nextId = 1;

export function addDraft(sender, content) {
  try {
    drafts.set(nextId, {sender: sender, content: content})
    nextId++
  } catch (error) {
    console.error(error);
    
  }
}

export async function handleDraftCommand(draftId, requestingSender) {
  try {
    const id = parseInt(draftId);
    if (drafts.has(id)) {
        let draft= drafts.get(id)
        await sendWhatsAppMessage(draft.sender, draft.content)
        await sendTelegramMessage(`Draft ${draftId} envoyé a ${draft.sender}`)
        drafts.delete(id);
    }else{
      await sendWhatsAppMessage(getOwnJid(),"Erreur d'envoi du draft")
      await sendTelegramMessage("Erreur d'envoi du draft")
    }
  } catch (error) {
    console.error(error);
  }
} 