// Façade de compatibilité pendant le refactoring architectural.
// La logique réelle vit désormais dans :
//   - src/infrastructure/ai/{groq,gemini}-provider.js (détails techniques des fournisseurs)
//   - src/application/services/ai-provider-service.js (orchestration/fallback)
//   - src/application/services/hakili-ai-service.js (personnalité, prompts, logique métier)
// Cette façade instancie le service applicatif avec ses dépendances réelles
// (getSetting depuis la base de données) et réexpose la même API qu'avant
// la migration, pour ne casser aucun import existant.
import { getSetting } from './database.js';
import { PERSONALITY, createHakiliAIService } from './src/application/services/hakili-ai-service.js';

export { PERSONALITY };

const service = createHakiliAIService({ getSetting });

export const callAI = service.callAI;
export const summarizeMessages = service.summarizeMessages;
export const answerSearchQuery = service.answerSearchQuery;
export const confirmUrgency = service.confirmUrgency;
export const generateDraftReply = service.generateDraftReply;
export const chatReply = service.chatReply;
export const parseSettingsIntent = service.parseSettingsIntent;
