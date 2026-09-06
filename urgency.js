// Façade de compatibilité pendant le refactoring architectural.
// La logique réelle vit désormais dans
// src/application/services/urgency-service.js.
// Note : l'import de DEFAULT_SETTINGS présent dans l'ancien fichier
// n'était utilisé que dans une ligne commentée (code mort) ; il n'a pas
// été repris.
import { getSetting } from './database.js';
import { createUrgencyService } from './src/application/services/urgency-service.js';

const urgencyService = createUrgencyService({ getSetting });

export const isPotentiallyUrgent = urgencyService.isPotentiallyUrgent;
