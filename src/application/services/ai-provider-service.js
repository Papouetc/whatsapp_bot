import { callGroq, isGroqAvailable } from '../../infrastructure/ai/groq-provider.js';
import { callGemini, isGeminiAvailable } from '../../infrastructure/ai/gemini-provider.js';

/**
 * Sélectionne le fournisseur IA prioritaire selon le réglage utilisateur,
 * puis bascule automatiquement sur le fournisseur secondaire en cas de
 * rate-limit (429), payload trop gros (413) ou indisponibilité (503).
 *
 * getSetting est injecté pour que ce service ne dépende pas directement
 * d'une implémentation de persistance (PostgreSQL, etc.).
 */
export function createAIProviderService({ getSetting }) {
    if (typeof getSetting !== 'function') {
        throw new Error('createAIProviderService requires a getSetting function');
    }

    async function callAI(systemPrompt, userPrompt, opts = {}) {
        const priority = (await getSetting(
            'ai_provider_priority',
            opts.userId || 'legacy'
        )) || 'groq';
        const useGeminiFirst = priority === 'gemini';

        const primary = useGeminiFirst ? callGemini : callGroq;
        const secondary = useGeminiFirst ? callGroq : callGemini;
        const primaryName = useGeminiFirst ? 'Gemini' : 'Groq';
        const secondaryName = useGeminiFirst ? 'Groq' : 'Gemini';
        const secondaryAvailable = useGeminiFirst ? isGroqAvailable() : isGeminiAvailable();

        try {
            const result = await primary(systemPrompt, userPrompt, opts);
            console.log(`🟢 Réponse générée par ${primaryName}`);
            return result;
        } catch (err) {
            if ((err.status === 429 || err.status === 413 || err.status == 503) && secondaryAvailable) {
                console.warn(`⚠️  ${primaryName} en rate-limit (429), bascule sur ${secondaryName}...`);
                const result = await secondary(systemPrompt, userPrompt, opts);
                console.log(`🔵 Réponse générée par ${secondaryName} (fallback)`);
                return result;
            }
            throw err;
        }
    }

    return { callAI };
}
