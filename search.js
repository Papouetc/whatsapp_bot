import { searchArchiveByKeyword } from './database.js';
import { callAI } from './ai.js';
import { logSafeError } from './logger.js';

export async function semanticSearch(query, userId = 'legacy') {
  try {
    const expansionRaw = await callAI(
      `Tu es un moteur d'expansion de recherche.

La question utilisateur est :
"${query}"

Génère entre 6 et 10 termes ou expressions susceptibles d'apparaître
dans les messages WhatsApp qui contiennent la réponse.

Règles :
- conserve les mots importants de la question ;
- ajoute des synonymes naturels ;
- ajoute des formulations conversationnelles ;
- ajoute les objets ou personnes implicitement recherchés ;
- privilégie des expressions courtes ;
- ne génère pas de phrases complètes ;
- ne réponds PAS à la question ;
- évite les termes trop génériques comme "information", "personne", "nom", "question".

Exemple :
Question : "à qui je devais transférer le fichier ?"

Bon résultat :
["fichier", "PDF", "envoyer le fichier", "envoyer le PDF",
"m'envoyer le PDF", "transférer le fichier", "destinataire"]

Réponds uniquement avec un JSON valide :
{"keywords":["..."]}`,
      query,
      { json: true, userId }
    );

    let keywords = [];

    try {
      const parsed = JSON.parse(expansionRaw);

      if (Array.isArray(parsed.keywords)) {
        keywords = parsed.keywords
          .filter(k => typeof k === 'string')
          .map(k => k.trim())
          .filter(Boolean);
      }
    } catch {
      console.warn('⚠️ Expansion sémantique invalide');
    }

    keywords = [
      query,
      ...keywords
    ];

    keywords = [...new Set(
      keywords.map(k => k.toLowerCase())
    )];

    const resultsMap = new Map();

    for (const keyword of keywords) {
      const results = await searchArchiveByKeyword(
        keyword,
        10,
        userId
      );

      for (const message of results) {

        if (
          !message.content ||
          message.content.trim().startsWith('/')
        ) {
          continue;
        }

        const existing = resultsMap.get(message.id);

        if (existing) {
          existing.matchCount += 1;
          existing.matchedKeywords.push(keyword);
        } else {
          resultsMap.set(message.id, {
            ...message,
            matchCount: 1,
            matchedKeywords: [keyword]
          });
        }
      }
    }

    const results = [...resultsMap.values()]
      .map(message => ({
        ...message,
        semanticScore:
          message.matchCount +
          (message.matchedKeywords.includes(query.toLowerCase())
            ? 2
            : 0)
      }))
      .sort((a, b) => {
        if (b.semanticScore !== a.semanticScore) {
          return b.semanticScore - a.semanticScore;
        }

        return Number(a.timestamp) - Number(b.timestamp);
      });

    return results.slice(0, 30);

  } catch (err) {
    logSafeError('Erreur recherche sémantique', err);
    return [];
  }
}


const MAX_RESULTS = 20;

function isCommandMessage(message) {
  const content = String(message?.content || '').trim();

  return content.startsWith('/');
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function lexicalScore(message, query) {
  const content = normalizeText(message.content);
  const queryTerms = normalizeText(query)
    .split(/\s+/)
    .filter(term => term.length >= 3);

  if (queryTerms.length === 0) {
    return 0;
  }

  let score = 0;

  for (const term of queryTerms) {
    if (content.includes(term)) {
      score += 2;
    }
  }

  return score;
}

export async function hybridSearch(query, userId = 'legacy') {
  const directResults = await searchArchiveByKeyword(
    query,
    MAX_RESULTS,
    userId
  );

  console.log(
    `🔎 Recherche directe : ${directResults.length} résultats`
  );

  const semanticResults = await semanticSearch(query, userId);

  console.log(
    `🧠 Recherche sémantique : ${semanticResults.length} résultats`
  );

  const resultsMap = new Map();

  for (const message of directResults) {
    if (isCommandMessage(message)) {
      continue;
    }

    resultsMap.set(message.id, {
      ...message,
      lexicalScore: lexicalScore(message, query),
      semanticScore: 0
    });
  }

  for (const message of semanticResults) {
    if (isCommandMessage(message)) {
      continue;
    }

    const existing = resultsMap.get(message.id);

    if (existing) {
      existing.semanticScore = message.semanticScore || 1;
    } else {
      resultsMap.set(message.id, {
        ...message,
        lexicalScore: 0,
        semanticScore: message.semanticScore || 1
      });
    }
  }

  const uniqueResults = new Map();

  for (const message of resultsMap.values()) {
    const key = normalizeText(message.content);

    const existing = uniqueResults.get(key);

    if (!existing) {
      uniqueResults.set(key, message);
      continue;
    }

    const currentScore =
      message.lexicalScore * 2 +
      message.semanticScore * 3;

    const existingScore =
      existing.lexicalScore * 2 +
      existing.semanticScore * 3;

    if (currentScore > existingScore) {
      uniqueResults.set(key, message);
    }
  }

  const results = [...uniqueResults.values()]
    .map(message => ({
      ...message,
      totalScore:
        message.lexicalScore * 2 +
        message.semanticScore * 3
    }))
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }

      return Number(a.timestamp) - Number(b.timestamp);
    })
    .slice(0, MAX_RESULTS);

  console.log(`🎯 Résultats hybrides : ${results.length}`);

  return results;
}