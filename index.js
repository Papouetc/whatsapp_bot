import 'dotenv/config';
import { validateEnvironment } from './config.js';

import {
  initDB,
  closeDB,
  getUnsummarizedMessages,
  markAsSummarized,
  getSetting,
  getAllSettings,
  setSetting,
  getPendingTasks,
  markTaskDone,
  saveTasks,
  getConversationHistory
  , deleteAllStoredData
} from './database.js';

import {
  startWhatsApp,
  requestPairingCode,
  sendWhatsAppMessage,
  logoutWhatsApp,
  getOwnJid
} from './whatsapp.js';

import {
  startTelegramListener,
  sendTelegramMessage,
  sendTelegramMessageForUser
} from './telegram.js';

import { scheduleDailySummary } from './scheduler.js';

import {
  isPotentiallyUrgent
} from './urgency.js';

import {
  confirmUrgency,
  generateDraftReply,
  summarizeMessages,
  callAI,
  PERSONALITY
} from './ai.js';

import {
  addDraft,
  handleDraftCommand
} from './drafts.js';

import { handleChatMessage } from './chat.js';

import { hybridSearch } from './search.js';
import { json } from 'express';
import { logSafeError } from './logger.js';

process.on('uncaughtException', (err) => {
  logSafeError('Erreur non interceptée (le bot continue)', err);
});

process.on('unhandledRejection', (err) => {
  logSafeError('Rejet de promesse non intercepté (le bot continue)', err);
});

export async function main() {
  try {
    validateEnvironment();
    console.log('🚀 Démarrage du bot WhatsApp...');

    await initDB();
    console.log('✅ Base de données initialisée');

    await startWhatsApp('legacy', {
      onMessage: handleWhatsAppMessage,
      onCommand: handleWhatsAppCommand,
      onSelfChat: handleChatMessage
    });

    console.log('✅ WhatsApp connecté');

    startTelegramListener(handleTelegramCommand);
    console.log('✅ Telegram écouté');

    scheduleDailySummary();
    console.log('✅ Résumé quotidien programmé');

    printAvailableCommands();

  } catch (err) {
    logSafeError('Erreur fatale au démarrage', err);

    await closeDB();

    process.exit(1);
  }
}

async function handleWhatsAppMessage(msgData) {
  const {
    sender,
    sender_name,
    content,
    isGroup,
    isStatus,
    isNewsletter
  } = msgData;
  const userId = msgData.userId || 'legacy';

  console.log(
    `📩 Message reçu de ${sender_name || sender}`
  );

  const urgencyDetectionOn =
    (await getSetting('urgency_detection', userId)) === 'on';
  const potentiallyUrgent = await isPotentiallyUrgent(content, userId);

  if (
    urgencyDetectionOn &&
    potentiallyUrgent
  ) {
    try {
      const {
        urgent,
        reason
      } = await confirmUrgency({ sender, content }, userId);
      console.log('urgent', urgent);

      console.log('reason', reason);

      if (urgent) {
        const alertMessage =
          `🚨 Vous avez un message URGENT de ${sender_name || sender}:\n` +
          `${content}\n`;

        await sendTelegramMessageForUser(alertMessage, userId);

        await sendWhatsAppMessage(
          userId,
          getOwnJid(userId),
          alertMessage
        );

        console.log(
          '🚨 Alerte urgence envoyée sur Telegram et WhatsApp'
        );
      } else console.log("Pas urgent");


    } catch (err) {
      logSafeError('Erreur détection urgence', err);
    }
  }

  const draftModeOn =
    (await getSetting('draft_mode', userId)) === 'on';

  if (!draftModeOn) {
    return;
  }

  if (isGroup || isStatus || isNewsletter) {
    return;
  }

  if (!content?.trim()) {
    return;
  }

  if (content.trim().startsWith('/')) {
    return;
  }

  try {
    console.log(
      `📝 Génération draft pour ${sender_name || sender}`
    );

    const recentHistory =
      await getConversationHistory(
        sender,
        20,
        msgData.id,
        userId
      );

    console.log(
      `📚 Historique conversation : ${recentHistory.length} messages`
    );

    const draft =
      await generateDraftReply({
        sender,
        recentHistory,
        incomingContent: content,
        userId
      });

    if (!draft?.trim()) {
      console.log(
        '⚠️ Aucun draft généré'
      );

      return;
    }

    const draftId =
      addDraft(
        sender,
        draft.trim(),
        sender_name,
        userId
      );

    if (!draftId) {
      console.error(
        '❌ Impossible de créer le draft'
      );

      return;
    }

    console.log(
      `📝 Draft #${draftId} créé`
    );

    const displayName = sender_name || sender;
    const draftMessage = `📝 Brouillon #${draftId}\n\n` +
      `Vous avez reçu un message de 👤 ${sender_name || sender}:\n\nMessage: ${content?.substring(0, 100)}...\n\n` +
      `Voici une proposition de réponse: \n\n` +
      `${draft.trim()}\n\n` +
      `📤 Entrez : /envoie ${draftId} pour que je lui envoie directement la réponse`
    let jid = getOwnJid(userId);
    console.log('jid: ', jid);

    await sendTelegramMessageForUser(draftMessage, userId
    );
    await sendWhatsAppMessage(userId, jid, draftMessage
    )
    console.log(
      `📲 Draft #${draftId} envoyé sur Telegram et whatsapp`
    );

  } catch (err) {
    logSafeError('Erreur génération brouillon', err);
  }
}

function createReply(source, sender, userId = 'legacy') {
  if (source === 'whatsapp') {
    return async (message) => {
      await sendWhatsAppMessage(
        userId,
        sender,
        message
      );
    };
  }

  return async (message) => {
    await sendTelegramMessageForUser(message, userId);
  };
}

async function handleCommand(
  commandText,
  source,
  sender,
  userId = 'legacy'
) {
  const args =
    commandText.trim().split(/\s+/);

  const cmd =
    args[0]?.toLowerCase();

  const reply =
    createReply(source, sender, userId);

  switch (cmd) {

    case '/start':
      await reply(
        'Bienvenue. Utilise /pair <numero WhatsApp> pour connecter ton compte, par exemple /pair 33612345678.'
      );
      break;

    case '/pair': {
      const phoneNumber = args[1];
      if (!phoneNumber) {
        await reply('❌ Utilisation : /pair <numero WhatsApp>');
        return;
      }

      try {
        await startWhatsApp(userId, {
          onMessage: handleWhatsAppMessage,
          onCommand: handleWhatsAppCommand,
          onSelfChat: handleChatMessage
        });
        const code = await requestPairingCode(userId, phoneNumber);
        await reply(`📱 Code de pairing WhatsApp : ${code}`);
      } catch (err) {
        logSafeError('Erreur /pair', err);
        await reply('❌ Impossible de générer le code de pairing. Réessaie avec le numéro au format international.');
      }
      break;
    }

    case '/resume':
      await handleResumeCommand(reply, userId);
      break;

    case '/search': {
      const query =
        args.slice(1).join(' ');

      if (!query) {
        await reply(
          '❌ Utilisation : /search <question>'
        );
        return;
      }

      await handleSearchCommand(
        query,
        reply,
        userId
      );

      break;
    }

    case '/taches':
      await handleTasksCommand(reply, userId);
      break;

    case '/fait': {
      const taskId = args[1];

      if (!taskId) {
        await reply(
          '❌ Utilisation : /fait <id>'
        );
        return;
      }

      await handleTaskDoneCommand(
        taskId,
        reply,
        userId
      );

      break;
    }

    case '/envoie': {
      const draftId = args[1];

      if (!draftId) {
        await reply(
          '❌ Utilisation : /envoie <id>'
        );
        return;
      }

      await handleDraftCommand(
        draftId,
        sender,
        userId
      );

      break;
    }

    case '/settings':
      await handleSettingsCommand(reply, userId);
      break;

    case '/supprimer-donnees':
      await handleDeleteDataCommand(args[1], reply, userId);
      break;

    case '/set': {
      const key = args[1];
      const value =
        args.slice(2).join(' ');

      if (!key || !value) {
        await reply(
          '❌ Utilisation : /set <clé> <valeur>'
        );
        return;
      }

      await handleSetCommand(
        key,
        value,
        reply,
        userId
      );

      break;
    }

    case '/help':
      await handleHelpCommand(reply);
      break;

    default:
      await reply(
        `❓ Commande inconnue : ${cmd}\n\nTape /help pour voir les commandes.`
      );
  }
}

async function handleWhatsAppCommand(
  command,
  sender,
  userId = 'legacy'
) {
  await handleCommand(
    command,
    'whatsapp',
    sender,
    userId
  );
}

async function handleTelegramCommand(
  commandText,
  sender,
  userId = 'legacy'
) {
  await handleCommand(
    commandText,
    'telegram',
    sender,
    userId
  );
}

async function handleResumeCommand(reply, userId = 'legacy') {
  try {
    const messages =
      await getUnsummarizedMessages(userId);

    if (messages.length === 0) {
      await reply(
        '✅ Aucun nouveau message à résumer.'
      );
      return;
    }

    const {
      summary,
      tasks
    } = await summarizeMessages(messages, userId);

    await reply(
      `📋 Résumé :\n${summary}`
    );

    if (
      tasks &&
      tasks.length > 0
    ) {
      await saveTasks(tasks, userId);
    }

    const ids =
      messages.map(
        message => message.id
      );

    await markAsSummarized(ids, userId);

  } catch (err) {
    logSafeError('Erreur /resume', err);

    await reply(
      '❌ Erreur lors de la génération du résumé.'
    );
  }
}

async function handleSearchCommand(
  query,
  reply,
  userId = 'legacy'
) {
  reply(`Je lance la recherche dans vos messages récent...`);

  try {
    if (!query?.trim()) {
      await reply(
        '❌ Utilisation : /search <question>'
      );
      return;
    }

    const results =
      await hybridSearch(query, userId);

    if (results.length === 0) {
      await reply(
        `🔎 Aucun message pertinent trouvé pour : "${query}"`
      );
      return;
    }

    const context =
      results
        .map((msg) => {
          const date =
            new Date(
              Number(msg.timestamp)
            ).toLocaleString('fr-FR');

          const chatName =
            msg.chat_name ||
            msg.chat_id;

          const senderName =
            msg.sender_name ||
            msg.sender;

          return `[${date}] ${chatName} | ${senderName}: ${msg.content}`;
        })
        .join('\n');

    const jid =
      getOwnJid(userId);

    const answer =
      await callAI(
        `
Tu es un assistant personnel qui recherche des informations dans l'historique WhatsApp.

QUESTION DE L'UTILISATEUR :
"${query}"

MESSAGES RETROUVÉS :
${context}

Réponds directement à la question en utilisant UNIQUEMENT les informations présentes dans les messages.

RÈGLES :
- Ne fabrique aucune information.
- Ne déduis pas une personne, une date ou une action qui n'est pas identifiable dans les messages.
- Regroupe les messages qui parlent du même événement.
- Si la réponse est identifiable, donne-la directement.
- Si les messages permettent seulement une réponse partielle, indique précisément ce qui est certain.
- Si les messages ne permettent pas de répondre, dis-le clairement.
- Utilise les noms des contacts et des groupes lorsqu'ils sont disponibles.
- Ne mentionne pas la recherche, la base de données, Groq ou ton fonctionnement.
- Sois concis mais précis.

IMPORTANT :

Certains messages peuvent contenir des identifiants WhatsApp comme
@198509831667939 ou 198509831667939@lid.

Si l'identifiant correspond au compte de l'utilisateur, considère qu'il désigne l'utilisateur lui-même.

Ne réponds pas simplement en répétant l'identifiant technique.

Transforme les informations techniques en une réponse naturelle.

Le compte utilisateur est : ${jid}
        `,
        context,
        { userId }
      );

    await reply(
      `🔎 Recherche : ${query}\n\n${answer}`
    );

  } catch (err) {
    logSafeError('Erreur /search', err);

    await reply(
      '❌ Une erreur est survenue pendant la recherche.'
    );
  }
}

async function handleTasksCommand(reply, userId = 'legacy') {
  try {
    const tasks =
      await getPendingTasks(userId);

    if (tasks.length === 0) {
      await reply(
        '✅ Aucune tâche en attente.'
      );
      return;
    }

    let response =
      '📝 Tâches en attente\n\n';

    tasks.forEach(task => {
      response +=
        `[${task.id}] ${task.description}\n`;
    });

    response +=
      '\n💡 /fait <id> → terminer une tâche';

    await reply(response);

  } catch (err) {
    logSafeError('Erreur /taches', err);

    await reply(
      '❌ Impossible de récupérer les tâches.'
    );
  }
}

async function handleTaskDoneCommand(
  taskId,
  reply,
  userId = 'legacy'
) {
  try {
    const id =
      parseInt(taskId, 10);

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      await reply(
        '❌ Identifiant de tâche invalide.'
      );
      return;
    }

    const success =
      await markTaskDone(id, userId);

    if (success) {
      await reply(
        `✅ Tâche ${id} marquée comme terminée.`
      );
    } else {
      await reply(
        `❌ Tâche ${id} introuvable ou déjà terminée.`
      );
    }

  } catch (err) {
    logSafeError('Erreur /fait', err);

    await reply(
      '❌ Erreur lors de la mise à jour de la tâche.'
    );
  }
}

async function handleSettingsCommand(reply, userId = 'legacy') {
  try {
    const settings =
      await getAllSettings(userId);

    let response = await callAI(`${PERSONALITY} Tu es un assistant personnelle sur whatsapp, tu as un certains nombre de fo
      fonctinnalité. L'utilisateur te demande de faire le point sur tes settings. Présente les paramètres sous forme de sections courtes et clairement séparées.

      Utilise exactement cette structure :
      
      ⚙️ Mes paramètres
      
      📝 Brouillons
      [statut + courte explication]
      
      🚨 Détection d'urgence
      [statut + courte explication]
      
      📋 Résumé quotidien
      [heure]
      
      🔎 Recherche
      [période disponible]
      
      🧠 Mémoire
      [nombre de messages]
      
      🤖 IA
      [fournisseur]
      
      🌐 Langue
      [langue]
      
      ⚙️ Pour modifier un paramètre :
      /set <clé> <valeur>
      
      Règles :
      - N'invente aucune information.
      - Utilise uniquement les paramètres fournis.
      - N'affiche pas les paramètres techniques internes.
      - Traduis les valeurs techniques en langage naturel.
      - Si un paramètre n'est pas présent, ne crée pas de section pour celui-ci.
      - Garde les descriptions très courtes.
      - Conserve les emojis et la structure indiquée.
      - Réponds uniquement avec le message destiné à l'utilisateur.
      
      n'invente pas de settings et cache les paramètres techniques comme :

      draft_mode_off_for: []
      `, `Parametres: ${JSON.stringify(settings)}`,
      { json: false, userId })


    await reply(response);

  } catch (err) {
    logSafeError('Erreur /settings', err);

    await reply(
      '❌ Erreur lors de la récupération des paramètres.'
    );
  }
}

async function handleDeleteDataCommand(confirmation, reply, userId = 'legacy') {
  if (confirmation !== 'CONFIRMER') {
    await reply(
      '⚠️ Cette action supprimera messages, tâches, réglages et session WhatsApp. Pour confirmer, utilise : /supprimer-donnees CONFIRMER'
    );
    return;
  }

  try {
    await deleteAllStoredData(userId);
    await logoutWhatsApp(userId);
    await reply(
      '✅ Toutes les données ont été supprimées. Un nouveau pairing WhatsApp sera nécessaire.'
    );
  } catch (err) {
    logSafeError('Erreur suppression des données', err);
    await reply('❌ Impossible de supprimer toutes les données.');
  }
}

async function handleSetCommand(
  key,
  value,
  reply,
  userId = 'legacy'
) {
  try {
    await setSetting(
      key,
      value,
      userId
    );

    await reply(
      `✅ ${key} défini à ${value}`
    );

  } catch (err) {
    logSafeError('Erreur /set', err);

    await reply(
      '❌ Erreur lors de la mise à jour du paramètre.'
    );
  }
}

async function handleHelpCommand(reply) {
  const help = `
📱 Commandes disponibles :

/resume
→ Résumé immédiat

/search <question>
→ Recherche dans l'historique

/taches
→ Afficher les tâches en attente

/fait <id>
→ Marquer une tâche comme terminée

/envoie <id>
→ Envoyer un brouillon

/settings
→ Voir les paramètres

/set <clé> <valeur>
→ Modifier un paramètre

/supprimer-donnees CONFIRMER
→ Supprimer toutes les données et la session WhatsApp
`;

  await reply(help);
}

function printAvailableCommands() {
  console.log(
    '\n📱 Commandes disponibles (WhatsApp + Telegram):'
  );

  console.log(
    '  /resume                 -> résumé immédiat'
  );

  console.log(
    '  /search <question>      -> recherche en langage naturel'
  );

  console.log(
    '  /taches                 -> tâches en attente'
  );

  console.log(
    '  /fait <id>              -> marquer une tâche finie'
  );

  console.log(
    '  /envoie <id>            -> envoyer brouillon'
  );

  console.log(
    '  /settings               -> voir tous les paramètres'
  );

  console.log(
    '  /set <clé> <valeur>     -> modifier un paramètre'
  );

  console.log(
    '  /help                   -> afficher les commandes'
  );

  console.log(
    '\nParle directement à ton propre chat WhatsApp pour discuter avec le bot.\n'
  );
}