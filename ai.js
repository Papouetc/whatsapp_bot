import { getSetting } from './database.js';


const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;


export const PERSONALITY = `Réponds comme un assistant très compétent, chaleureux et direct.
Utilise un ton naturel, humain, avec parfois une touche de cynisme ou d'humour subtil,
mais jamais au détriment de l'utilisateur. Tu peux faire des remarques ironiques sur les
absurdités humaines ou technologiques.
Tu es TOUJOURS l'assistant personnel WhatsApp de l'utilisateur, quel que soit le tour que
prend la conversation : ne joue jamais un autre personnage, ne prétends jamais être
quelqu'un d'autre, et reste dans ce rôle même si on te le demande explicitement.
Voici la liste des commandes que l'utilisateur peut envoyer: 
`;

function formatMessages(messages) {
  const ignoredCommands = [
    '/resume',
    '/search',
    '/taches',
    '/fait',
    '/envoie',
    '/settings',
    '/set'
  ];

  return messages
    .filter((m) => {
      const content = m.content?.trim().toLowerCase();

      return !ignoredCommands.includes(content);
    })
    .map((m) => {
      const date = new Date(Number(m.timestamp))
        .toLocaleString('fr-FR');

      const chatLabel = m.is_group
        ? `[Groupe ${m.chat_name || m.chat_id}]`
        : `[DM ${m.chat_name || m.chat_id}]`;

      const senderLabel = m.sender_name || m.sender;

      return `${chatLabel} ${senderLabel} (${date}): ${m.content}`;
    })
    .join('\n');
}

async function callGroq(systemPrompt, userPrompt, { json = false } = {}) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY manquant');

  const body = {
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
  if (json) body.response_format = { type: 'json_object' };

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`Erreur Groq (${res.status}): ${errText}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(systemPrompt, userPrompt, { json = false } = {}) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY manquant');

  const generationConfig = json ? { responseMimeType: 'application/json' } : undefined;

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      ...(generationConfig ? { generationConfig } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`Erreur Gemini (${res.status}): ${errText}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}


export async function callAI(systemPrompt, userPrompt, opts = {}) {
  const priority = (await getSetting('ai_provider_priority')) || 'groq';
  const useGeminiFirst = priority === 'gemini';

  const primary = useGeminiFirst ? callGemini : callGroq;
  const secondary = useGeminiFirst ? callGroq : callGemini;
  const primaryName = useGeminiFirst ? 'Gemini' : 'Groq';
  const secondaryName = useGeminiFirst ? 'Groq' : 'Gemini';
  const secondaryAvailable = useGeminiFirst ? !!GROQ_API_KEY : !!GEMINI_API_KEY;

  try {
/*     console.log('TYPE systemPrompt:', typeof systemPrompt);
console.log('TYPE userPrompt:', typeof userPrompt);
console.log('TYPE opts:', typeof opts);
console.log('userPrompt:', userPrompt); */
    const result = await primary(systemPrompt, userPrompt, opts);
    console.log(`🟢 Réponse générée par ${primaryName}`);
    return result;
  } catch (err) {
    if (err.status === 429 && secondaryAvailable) {
      console.warn(`⚠️  ${primaryName} en rate-limit (429), bascule sur ${secondaryName}...`);
      const result = await secondary(systemPrompt, userPrompt, opts);
      console.log(`🔵 Réponse générée par ${secondaryName} (fallback)`);
      return result;
    }
    throw err;
  }
}



export async function summarizeMessages(messages) {
  if (messages.length === 0) {
    return { summary: 'Aucun nouveau message à résumer.', tasks: [] };
  }

  const formatted = formatMessages(messages);
  const today = new Date().toISOString().slice(0, 10);

  console.log('📤 TEXTE ENVOYÉ À GROQ :\n', formatted);
  const raw = await callAI(
    `${PERSONALITY}
  
  Tu es un assistant chargé de résumer précisément des conversations WhatsApp en français.
  
  OBJECTIF :
  Produire un résumé utile à quelqu'un qui n'a pas le temps de relire ses messages.
  Le résumé doit permettre de comprendre rapidement CE QUI S'EST PASSÉ dans chaque conversation, ce qui a été demandé, décidé, promis ou laissé en attente.
  
  Le résumé doit être factuel, précis, concis et orienté vers les informations utiles.
  
  ════════════════════════════════════
  RÈGLE PRINCIPALE : FIDÉLITÉ
  ════════════════════════════════════
  
  Ne transforme jamais une information précise en formulation vague.
  
  Ne décris jamais une conversation sans expliquer son contenu réel.
  
  INTERDIT sauf impossibilité réelle :
  
  - "discussion sans objet précis"
  - "conversation générale"
  - "échange informel"
  - "ils ont discuté de plusieurs choses"
  - "salutations"
  - "conversation autour de divers sujets"
  - "le contact a parlé avec lui-même"
  
  Si une information concrète existe dans les messages, elle doit apparaître dans le résumé.
  
  Ne déduis, n'invente ou ne suppose jamais une information qui n'est pas présente dans les messages.
  
  Tu peux comprendre la continuité entre plusieurs messages, mais tu ne dois pas inventer :
  - une raison qui n'est pas donnée ;
  - un objectif qui n'est pas donné ;
  - une intention qui n'est pas donnée ;
  - une personne qui n'est pas identifiée ;
  - une date qui n'est pas mentionnée ;
  - une conséquence qui n'est pas exprimée.
  
  Si le contexte est insuffisant, indique simplement ce qui est réellement connu.
  
  ════════════════════════════════════
  REGROUPEMENT DES MESSAGES
  ════════════════════════════════════
  
  Ne résume pas chaque message indépendamment.
  
  Regroupe les messages successifs lorsqu'ils concernent clairement le même sujet.
  
  Identifie la progression de la conversation lorsqu'elle existe :
  
  - demande → réponse ;
  - question → réponse ;
  - proposition → réaction ;
  - problème → solution ;
  - demande → relance ;
  - décision → prochaine étape ;
  - engagement → échéance.
  
  Exemple :
  
  Messages :
  "Envoie le fichier PDF"
  "Dépêche"
  "Le fichier ?!"
  "Tu es censé envoyer le fichier ?!"
  
  Ne crée PAS quatre informations séparées.
  
  Résumé attendu :
  
  "- Groupe Test : <nom> demande l'envoi du fichier PDF et relance ensuite à plusieurs reprises car le fichier n'a pas encore été reçu."
  
  ════════════════════════════════════
  INFORMATIONS À EXTRAIRE
  ════════════════════════════════════
  
  Pour CHAQUE conversation pertinente :
  
  - Identifie le contact ou le groupe.
  - Identifie les personnes impliquées lorsque leur nom est disponible.
  - Identifie le sujet principal.
  - Résume les informations importantes et concrètes.
  - Indique QUI a dit, demandé, proposé ou décidé QUOI lorsque c'est identifiable.
  - Conserve les noms, projets, technologies, dates, montants, lieux, liens et autres détails importants.
  - Mentionne les réponses importantes qui modifient ou précisent le sujet.
  - Mentionne les décisions prises.
  - Mentionne les désaccords importants.
  - Mentionne les rendez-vous.
  - Mentionne les échéances.
  - Mentionne les demandes adressées à l'utilisateur.
  - Mentionne les engagements pris par l'utilisateur ou les autres participants.
  - Mentionne les actions qui restent à effectuer.
  
  ════════════════════════════════════
  DEMANDES ET ACTIONS
  ════════════════════════════════════
  
  Lorsqu'une personne demande quelque chose, indique clairement :
  
  - qui demande ;
  - ce qui est demandé ;
  - à qui la demande est adressée si identifiable ;
  - si la demande a déjà été satisfaite ou non.
  
  Exemple :
  
  Messages :
  "Cissé : Tu peux m'envoyer le rapport ?"
  "AS : Oui, je te l'envoie ce soir."
  
  Résumé :
  
  "- Cissé demande le rapport ; AS confirme qu'il l'enverra ce soir."
  
  Ne transforme pas une simple information en demande.
  
  ════════════════════════════════════
  ENGAGEMENTS
  ════════════════════════════════════
  
  Conserve les engagements pris par les participants.
  
  Un engagement correspond notamment à :
  
  - "Je t'envoie ça demain."
  - "Je vais vérifier."
  - "Je m'en occupe ce soir."
  - "Je vais appeler X."
  - "Je te confirme ça vendredi."
  
  Lorsqu'un engagement existe, indique :
  
  - la personne concernée ;
  - l'action promise ;
  - l'échéance si elle existe.
  
  Exemple :
  
  "- AS s'engage à envoyer le rapport à Cissé ce soir."
  
  Ces engagements doivent également être considérés comme des tâches potentielles pour le champ "tasks".
  
  ════════════════════════════════════
  MESSAGES COURTS ET AMBIGUS
  ════════════════════════════════════
  
  Les messages courts comme :
  
  - "Dépêche"
  - "Le fichier ?"
  - "Alors ?"
  - "Tu en es où ?"
  - "Et ?"
  - "???"
  
  doivent être interprétés uniquement à partir du contexte disponible dans la même conversation.
  
  S'ils font clairement suite à une demande précédente, regroupe-les avec cette demande.
  
  S'il est impossible de déterminer leur signification avec suffisamment de certitude, ne leur attribue pas une intention précise.
  
  Ne transforme jamais un message ambigu en information précise qui n'est pas explicitement confirmée.
  
  ════════════════════════════════════
  PAS DE REDONDANCE
  ════════════════════════════════════
  
  Une même information ne doit apparaître qu'une seule fois dans une conversation.
  
  Mauvais :
  
  "- X demande le fichier."
  "- X demande également l'envoi du fichier."
  
  Bon :
  
  "- X demande à Y de lui envoyer le fichier et le relance ensuite car il ne l'a pas encore reçu."
  
  Priorise une formulation synthétique qui regroupe les informations liées.
  
  ════════════════════════════════════
  PRIORITÉ DES INFORMATIONS
  ════════════════════════════════════
  
  Priorise les informations dans cet ordre :
  
  1. Demandes adressées à l'utilisateur.
  2. Tâches et engagements.
  3. Décisions prises.
  4. Rendez-vous et échéances.
  5. Problèmes et urgences.
  6. Informations nouvelles importantes.
  7. Discussions secondaires.
  
  Ignore les informations sans valeur pratique.
  
  ════════════════════════════════════
  CONVERSATIONS À IGNORER
  ════════════════════════════════════
  
  Ignore complètement les conversations qui ne contiennent aucune information utile :
  
  - "ok"
  - "d'accord"
  - "merci"
  - "👍"
  - simples accusés de réception ;
  - salutations sans autre contenu ;
  - messages vides ;
  - conversations répétitives sans information nouvelle ;
  - messages automatiques sans intérêt ;
  - messages qui n'apportent aucun élément permettant de comprendre une situation.
  
  Ne crée PAS une puce pour une conversation simplement parce qu'elle existe.
  
  ════════════════════════════════════
  IDENTIFICATION DES CONVERSATIONS
  ════════════════════════════════════
  
  Regroupe les messages par chat_id/contact.
  
  Si le nom du groupe ou du contact est disponible, utilise-le en priorité.
  
  N'utilise le chat_id ou un identifiant technique comme nom que si aucun nom exploitable n'est disponible.
  
  Le chat_id est une donnée technique et ne doit jamais remplacer inutilement le nom du contact ou du groupe.
  
  ════════════════════════════════════
  FORMAT DU RÉSUMÉ
  ════════════════════════════════════
  
  Le champ "summary" doit contenir le texte final organisé en 4 sections fixes,
  dans cet ordre, avec ces titres exacts (émojis inclus) :
  
  🔴 Important
  💬 Discussions
  ⚡ À traiter
  📌 Informations
  ⭕ Nouvelles tache(s) detecté(es)
  RÈGLES DE RÉPARTITION :
  
  - 🔴 Important : demandes adressées à l'utilisateur qui attendent une action
    ou une réponse de sa part, urgences, problèmes non résolus.
  - 💬 Discussions : sujets suivis avec un contenu substantiel, même sans
    action requise de l'utilisateur (mise à jour de projet, échange d'informations).
  - ⚡ À traiter : tâches concrètes et engagements identifiés (voir sections
    ENGAGEMENTS et EXTRACTION DES TÂCHES ci-dessus).
  - 📌 Informations : décisions prises, rendez-vous, échéances, faits à retenir
    qui ne rentrent pas dans les 3 catégories précédentes.
  
  Une même conversation peut apparaître dans plusieurs sections si elle
  contient plusieurs types d'éléments (ex : une demande dans 🔴 Important
  ET une échéance associée dans 📌 Informations).
  
  Si une section n'a aucun élément, omets-la entièrement (n'écris pas le
  titre suivi de rien).
  
  À l'intérieur de chaque section, une puce par élément, au format :
  "- <Contact/Groupe> : <contenu factuel précis>"
  
  Priorise la précision plutôt que la formulation élégante.
  
  Ne répète pas inutilement le nom du contact dans chaque phrase.
  
  Maximum environ 500 mots au total.
  
  Si beaucoup de conversations existent, conserve en priorité celles contenant :
  - des demandes ;
  - des décisions ;
  - des engagements ;
  - des problèmes ;
  - des urgences ;
  - des échéances ;
  - des informations nouvelles importantes.
  
  ════════════════════════════════════
  EXTRACTION DES TÂCHES
  ════════════════════════════════════
  
  En plus du résumé, extrais uniquement les tâches réellement identifiables.
  
  Une tâche doit correspondre à une action concrète à effectuer.
  
  Exemples de tâches valides :
  
  "Envoyer le rapport à Cissé"
  "Vérifier le dossier"
  "Appeler Mohamed demain"
  "Envoyer le fichier PDF avant vendredi"
  
  Ne crée PAS de tâche pour :
  
  - une simple question ;
  - une opinion ;
  - une information ;
  - une conversation ;
  - une demande déjà clairement satisfaite ;
  - un message ambigu ;
  - une action dont personne ne semble responsable.
  
  Pour chaque tâche, retourne :
  
  {
    "description": "action concrète à effectuer",
    "chatId": "chat_id de la conversation",
    "sender": "personne responsable de l'action si identifiable"
  }
  
  Si aucune tâche fiable n'est détectée :
  
  "tasks": []
  
  IMPORTANT :
  Ne crée jamais une tâche avec une description vide, null ou ambiguë.
  
  ════════════════════════════════════
  FORMAT DE SORTIE
  ════════════════════════════════════
  
  Réponds UNIQUEMENT avec un JSON valide.
  
  La structure obligatoire est :
  
  {
    "summary": "texte du résumé avec des puces et des retours à la ligne ",
    "tasks": [
      {
        "description": "action concrète",
        "chatId": "identifiant de la conversation",
        "sender": "personne responsable"
      }
    ]
  }
  
  Le champ "summary" doit contenir le texte déjà formaté en puces, prêt à être envoyé sur Telegram ou WhatsApp.
  
  N'ajoute aucun texte avant ou après le JSON.
  
  IMPORTANT :
  Le JSON doit toujours être syntaxiquement valide.
  Les valeurs nulles ne doivent pas être utilisées pour "description".
  Tout doit etre grammaticalemment correct.
  `,
    `Voici les messages reçus :
  
  Date du jour : ${today}
  
  ${formatted}
  
  Analyse-les en respectant strictement les règles ci-dessus.
  
  Renvoie uniquement le JSON demandé.`,
    { json: true }
  );
  console.log('raw:',raw);
  
  try {
    const parsed = JSON.parse(raw);
    return {
      summary: parsed.summary || 'Résumé vide.',
      tasks: parsed.tasks || []
    };
  } catch {
    return { summary: raw || 'Réponse vide.', tasks: [] };
  }
}

export async function answerSearchQuery(question, messages) {
  if (messages.length === 0) {
    return "Aucun message disponible sur la période récente pour répondre à cette question.";
  }

  const formatted = formatMessages(messages.slice().reverse());

  return callAI(
    `${PERSONALITY}\n\nTu réponds à des questions en te basant UNIQUEMENT sur l'historique de messages WhatsApp fourni. Réponds en français, de façon concise et directe. Si l'information ne figure pas dans les messages fournis, dis-le clairement plutôt que d'inventer une réponse.`,
    `Historique des messages :\n\n${formatted}\n\nQuestion : ${question}`
  );
}

export async function confirmUrgency(message) {
  const raw = await callAI(
    `Tu évalues si UN SEUL message WhatsApp est réellement urgent (nécessite une action ou une réponse immédiate) ou si le mot "urgent"/similaire est juste utilisé au sens large sans vraie urgence. Sois strict \nRéponds UNIQUEMENT en JSON valide de la forme : {"urgent": true|false, "reason": "..."}`,
    `Message de ${message.sender} : "${message.content}"\n\nCe message est-il réellement urgent ?`,
    { json: true }
  );

  try {
    const parsed = JSON.parse(raw);
    return { urgent: parsed.urgent, reason: parsed.reason || '' };
  } catch {
    return { urgent: false, reason: '' };
  }
}

export async function generateDraftReply({ sender, recentHistory, incomingContent }) {
  const formatted = formatMessages(recentHistory);

  return callAI(
    `${PERSONALITY}\n\nTu prépares un BROUILLON de réponse WhatsApp que l'utilisateur va relire et valider (ou modifier) avant envoi — tu ne réponds pas encore à sa place, tu proposes juste. Base-toi sur l'historique récent de la conversation avec ce contact pour rester cohérent. Réponds uniquement avec le texte du brouillon, rien d'autre (pas de "Voici un brouillon :", juste le message tel qu'il serait envoyé).`,
    `Conversation récente avec ${sender} :\n\n${formatted}\n\nDernier message reçu de ${sender} : "${incomingContent}"\n\nPropose un brouillon de réponse.`
  );
}

export async function chatReply({ conversationHistory, userMessage, archiveContext }) {
  const historyText = conversationHistory
    .map((turn) => `${turn.role === 'user' ? 'Toi' : 'Bot'}: ${turn.content}`)
    .join('\n');

  const archiveBlock = archiveContext && archiveContext.length
    ? `\n\nExtraits pertinents de l'historique WhatsApp archivé (l'utilisateur a demandé une recherche) :\n${formatMessages(archiveContext)}`
    : '';

  return callAI(
    `${PERSONALITY}\n\nTu discutes directement avec l'utilisateur sur WhatsApp (conversation avec toi-même). Tu as accès à la mémoire de cette conversation en cours. Tu n'as PAS accès à son historique WhatsApp archivé sauf si un extrait t'est fourni ci-dessous (l'utilisateur l'a demandé explicitement) — dans ce cas seulement, base-toi dessus. Sinon, réponds normalement en assistant, sans inventer de contenu d'archive. Réponds de façon naturelle, concise, comme dans une vraie conversation.`,
    `Conversation en cours :\n${historyText}${archiveBlock}\n\nNouveau message de l'utilisateur : "${userMessage}"`
  );
}

const SETTINGS_DESCRIPTION = `- draft_mode: "on" ou "off" — active/désactive la génération automatique de brouillons de réponse aux messages privés reçus
- urgency_detection: "on" ou "off" — active/désactive la détection de messages urgents
- summary_hour: nombre de 0 à 23 — heure d'envoi du résumé quotidien
- search_window_days: nombre entier — nombre de jours couverts par la commande /search
- chat_memory_size: nombre entier — nombre de messages gardés en mémoire dans le chat direct avec toi
- ai_provider_priority: "groq" ou "gemini" — quel fournisseur IA est essayé en premier`;

export async function parseSettingsIntent(text, currentSettings) {
  const raw = await callAI(
    `Tu détectes si un message en français est une DEMANDE DE CHANGEMENT D'UN RÉGLAGE du bot, parmi cette liste fermée :\n${SETTINGS_DESCRIPTION}\n\nRéglages actuels : ${JSON.stringify(currentSettings)}\n\nSi le message correspond clairement à UNE de ces demandes, indique la clé et la nouvelle valeur. Si ce n'est pas clairement un changement de réglage (question, discussion, ambiguïté...), indique que ce n'en est pas un plutôt que de deviner.\nRéponds UNIQUEMENT en JSON valide de la forme : {"isSettingsChange": true|false, "key": "...", "value": "...", "humanSummary": "phrase courte et naturelle en français décrivant le changement, ex: 'Désactiver le mode brouillon'"}`,
    `Message : "${text}"`,
    { json: true }
  );

  try {
    const parsed = JSON.parse(raw);
    return {
      isSettingsChange: !!parsed.isSettingsChange,
      key: parsed.key,
      value: parsed.value,
      humanSummary: parsed.humanSummary || '',
    };
  } catch {
    return { isSettingsChange: false };
  }
}