import {DEFAULT_SETTINGS, getSetting} from "./database.js"

const FALLBACK_KEYWORDS = 'urgent,urgence,vite,immédiat,immédiatement,rapidement,dépêche,critique,emergency,asap,important,maintenant,tout de suite,au secours,help,sos,ça urge';

export async function isPotentiallyUrgent(content) {
   let key_words= await getSetting('urgence_mot_cle')
    if (!key_words) {
        key_words = FALLBACK_KEYWORDS;
    }
    key_words= key_words.split(',')
    return (key_words.some((kw)=>content.toLowerCase().includes(kw))) 
}

//console.log(DEFAULT_SETTINGS.urgence_mot_cle);
