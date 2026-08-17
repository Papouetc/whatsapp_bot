import 'dotenv/config';

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
} from './database.js';

import {
  startWhatsApp,
  sendWhatsAppMessage,
  getOwnJid
} from './whatsapp.js';

import {
  startTelegramListener,
  sendTelegramMessage
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

process.on('uncaughtException', (err) => {
  console.error(
    '⚠️ Erreur non interceptée (le bot continue) :',
    err.message
  );
});

process.on('unhandledRejection', (err) => {
  console.error(
    '⚠️ Rejet de promesse non intercepté (le bot continue) :',
    err
  );
});

export async function main() {
  try {
    console.log('🚀 Démarrage du bot WhatsApp...');

    await initDB();
    console.log('✅ Base de données initialisée');

    await startWhatsApp({
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
    console.error(
      '❌ Erreur fatale au démarrage :',
      err
    );

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

  console.log(
    `📩 Message de ${sender_name || sender}: ${content?.substring(0, 50)}...`
  );

  const urgencyDetectionOn =
    (await getSetting('urgency_detection')) === 'on';
  console.log('urgency dtect:', urgencyDetectionOn);
  console.log('isPotentiallyUrgent(content):', isPotentiallyUrgent(content));
  
  if (
    urgencyDetectionOn &&
    isPotentiallyUrgent(content)
  ) {
    try {
      console.log('content', content);
      
      const {
        urgent,
        reason
      } = await confirmUrgency({sender, content});
      console.log('urgent',urgent);
      
      console.log('reason', reason);
      
      if (urgent) {
        const alertMessage =
          `🚨 Vous avez un message URGENT de ${sender_name || sender}:\n` +
          `${content}\n`;

        await sendTelegramMessage(alertMessage);

        await sendWhatsAppMessage(
          getOwnJid(),
          alertMessage
        );

        console.log(
          '🚨 Alerte urgence envoyée sur Telegram et WhatsApp'
        );
      }else console.log("Pas urgent");
      

    } catch (err) {
      console.error(
        '❌ Erreur détection urgence:',
        err
      );
    }
  }

  const draftModeOn =
    (await getSetting('draft_mode')) === 'on';

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
        msgData.id
      );

    console.log(
      `📚 Historique conversation : ${recentHistory.length} messages`
    );

    const draft =
      await generateDraftReply({
        sender,
        recentHistory,
        incomingContent: content
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
        sender_name
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
    const draftMessage=  `📝 Brouillon #${draftId}\n\n` +
    `Vous avez reçu un message de 👤 ${sender_name || sender}:\n\nMessage: ${content?.substring(0, 100)}...\n\n`+
    `Voici une proposition de réponse: \n\n` +
    `${draft.trim()}\n\n` +
    `📤 Entrez : /envoie ${draftId} pour que je lui envoie directement la réponse`
    let jid= getOwnJid();
    console.log('jid: ',jid);
    
    await sendTelegramMessage( draftMessage
    );
    await sendWhatsAppMessage(jid,draftMessage
     )
    console.log(
      `📲 Draft #${draftId} envoyé sur Telegram et whatsapp`
    );

  } catch (err) {
    console.error(
      '❌ Erreur génération brouillon:',
      err
    );
  }
}

function createReply(source, sender) {
  if (source === 'whatsapp') {
    return async (message) => {
      await sendWhatsAppMessage(
        sender,
        message
      );
    };
  }

  return async (message) => {
    await sendTelegramMessage(message);
  };
}

async function handleCommand(
  commandText,
  source,
  sender
) {
  const args =
    commandText.trim().split(/\s+/);

  const cmd =
    args[0]?.toLowerCase();

  const reply =
    createReply(source, sender);

  switch (cmd) {

    case '/resume':
      await handleResumeCommand(reply);
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
        reply
      );

      break;
    }

    case '/taches':
      await handleTasksCommand(reply);
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
        reply
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
      );

      break;
    }

    case '/settings':
      await handleSettingsCommand(reply);
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
        reply
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
  sender
) {
  await handleCommand(
    command,
    'whatsapp',
    sender
  );
}

async function handleTelegramCommand(
  commandText,
  sender
) {
  await handleCommand(
    commandText,
    'telegram',
    sender
  );
}

async function handleResumeCommand(reply) {
  try {
    const messages =
      await getUnsummarizedMessages();

    if (messages.length === 0) {
      await reply(
        '✅ Aucun nouveau message à résumer.'
      );
      return;
    }

    const {
      summary,
      tasks
    } = await summarizeMessages(messages);

    await reply(
      `📋 Résumé :\n${summary}`
    );

    if (
      tasks &&
      tasks.length > 0
    ) {
      await saveTasks(tasks);
    }

    const ids =
      messages.map(
        message => message.id
      );

    await markAsSummarized(ids);

  } catch (err) {
    console.error(
      'Erreur /resume :',
      err
    );

    await reply(
      '❌ Erreur lors de la génération du résumé.'
    );
  }
}

async function handleSearchCommand(
  query,
  reply
) {
  reply(`Je lance la recherche dans vos messages récent...`);
  
  try {
    if (!query?.trim()) {
      await reply(
        '❌ Utilisation : /search <question>'
      );
      return;
    }

    console.log(
      `🔎 Recherche : ${query}`
    );

    const results =
      await hybridSearch(query);

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

    console.log(
      '📚 CONTEXTE ENVOYÉ À L’IA:\n',
      context
    );

    const jid =
      getOwnJid();

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
        context
      );

    console.log(
      '🤖 Réponse IA:',
      answer
    );

    await reply(
      `🔎 Recherche : ${query}\n\n${answer}`
    );

  } catch (err) {
    console.error(
      '❌ Erreur /search :',
      err
    );

    await reply(
      '❌ Une erreur est survenue pendant la recherche.'
    );
  }
}

async function handleTasksCommand(reply) {
  try {
    const tasks =
      await getPendingTasks();

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
    console.error(
      '❌ Erreur /taches :',
      err
    );

    await reply(
      '❌ Impossible de récupérer les tâches.'
    );
  }
}

async function handleTaskDoneCommand(
  taskId,
  reply
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
      await markTaskDone(id);

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
    console.error(
      'Erreur /fait :',
      err
    );

    await reply(
      '❌ Erreur lors de la mise à jour de la tâche.'
    );
  }
}

async function handleSettingsCommand(reply) {
  try {
    const settings =
      await getAllSettings();

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
      `,`Parametres: ${JSON.stringify(settings)}`,
    {json: false})
      

    await reply(response);

  } catch (err) {
    console.error(
      'Erreur /settings :',
      err
    );

    await reply(
      '❌ Erreur lors de la récupération des paramètres.'
    );
  }
}

async function handleSetCommand(
  key,
  value,
  reply
) {
  try {
    await setSetting(
      key,
      value
    );

    await reply(
      `✅ ${key} défini à ${value}`
    );

  } catch (err) {
    console.error(
      'Erreur /set :',
      err
    );

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