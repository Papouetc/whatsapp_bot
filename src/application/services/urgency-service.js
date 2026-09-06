const FALLBACK_KEYWORDS = 'urgent,urgence,vite,immédiat,immédiatement,rapidement,dépêche,critique,emergency,asap,important,maintenant,tout de suite,au secours,help,sos,ça urge';

/**
 * Service de détection préliminaire d'urgence par mots-clés.
 * getSetting est injecté pour ne pas dépendre directement d'une
 * implémentation concrète de la persistance.
 */
export function createUrgencyService({ getSetting }) {
    if (typeof getSetting !== 'function') {
        throw new Error('createUrgencyService requires a getSetting function');
    }

    async function isPotentiallyUrgent(content, userId = 'legacy') {
        console.log('Verification urgence...');

        let key_words = await getSetting('urgence_mot_cle', userId);
        if (!key_words) {
            key_words = FALLBACK_KEYWORDS;
        }
        key_words = key_words.split(',');
        return (key_words.some((kw) => content.toLowerCase().includes(kw)));
    }

    return { isPotentiallyUrgent };
}
