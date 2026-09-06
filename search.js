// Façade de compatibilité pendant le refactoring architectural.
// La logique réelle vit désormais dans
// src/application/use-cases/search-use-cases.js.
import { searchArchiveByKeyword } from './database.js';
import { callAI } from './ai.js';
import { logSafeError } from './logger.js';
import { createSearchUseCases } from './src/application/use-cases/search-use-cases.js';

const searchUseCases = createSearchUseCases({ searchArchiveByKeyword, callAI, logSafeError });

export const semanticSearch = searchUseCases.semanticSearch;
export const hybridSearch = searchUseCases.hybridSearch;
