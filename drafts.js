// Façade de compatibilité pendant le refactoring architectural.
// La logique métier (créer un brouillon, l'envoyer et confirmer sur les
// canaux) vit désormais dans src/application/use-cases/draft-use-cases.js.
// Cette façade instancie le use case avec ses dépendances réelles et
// réexpose la même API qu'avant la migration.
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
import { createDraftUseCases } from './src/application/use-cases/draft-use-cases.js';

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

export const addDraft = draftUseCases.addDraft;
export const handleDraftCommand = draftUseCases.handleDraftCommand;
