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
  searchArchiveByKeyword
} from './database.js';

import {
  startWhatsApp,
  sendWhatsAppMessage
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
  summarizeMessages
} from './ai.js';

import {
  addDraft,
  handleDraftCommand
} from './drafts.js';

import { handleChatMessage } from './chat.js';

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
    console.error('❌ Erreur fatale au démarrage :', err);

    await closeDB();

    process.exit(1);
  }
}

async function handleWhatsAppMessage(msgData) {
  const {
    sender,
    content,
    isGroup,
    timestamp
  } = msgData;

  console.log(
    `📩 Message de ${sender}: ${content.substring(0, 50)}...`
  );

  const urgencyDetectionOn =
    (await getSetting('urgency_detection')) === 'on';

  if (
    urgencyDetectionOn &&
    isPotentiallyUrgent(content)
  ) {
    try {
      const {
        urgent,
        reason
      } = await confirmUrgency({
        content,
        sender
      });

      if (urgent) {
        await sendTelegramMessage(
          `🚨 URGENT de ${sender}:\n${content}\n\nRaison: ${reason}`
        );

        console.log(
          '🚨 Alerte urgence envoyée à Telegram'
        );
      }

    } catch (err) {
      console.error(
        'Erreur détection urgence :',
        err
      );
    }
  }

  if (!isGroup) {
    const draftModeOn =
      (await getSetting('draft_mode')) === 'on';

    if (draftModeOn) {
      try {
        const recentHistory =
          await searchArchiveByKeyword('', 20);

        const draft =
          await generateDraftReply({
            sender,
            recentHistory,
            incomingContent: content
          });

        if (draft) {
          await addDraft(sender, draft);

          await sendTelegramMessage(
            `📝 Brouillon pour ${sender}:\n${draft}\n\nCommande: /envoie <id>`
          );
        }

      } catch (err) {
        console.error(
          'Erreur génération brouillon :',
          err
        );
      }
    }
  }
}

function createReply(source, sender) {
  if (source === 'whatsapp') {
    return async (message) => {
      await sendWhatsAppMessage(sender, message);
    };
  }

  return async (message) => {
    await sendTelegramMessage(message);
  };
}

async function handleCommand(commandText, source, sender) {
  const args = commandText.trim().split(/\s+/);
  const cmd = args[0]?.toLowerCase();

  const reply = createReply(source, sender);

  switch (cmd) {

    case '/resume':
      await handleResumeCommand(reply);
      break;

    case '/search': {
      const query = args.slice(1).join(' ');

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

      if (source !== 'whatsapp') {
        await reply(
          '⚠️ /envoie est actuellement disponible uniquement depuis WhatsApp.'
        );
        return;
      }

      await handleDraftCommand(
        draftId,
        sender
      );

      break;
    }

    case '/settings':
      await handleSettingsCommand(reply);
      break;

    case '/set': {
      const key = args[1];
      const value = args.slice(2).join(' ');

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
        (message) => message.id
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
  try {
    const results =
      await searchArchiveByKeyword(
        query,
        10
      );

    if (results.length === 0) {
      await reply(
        `❌ Aucun résultat pour : ${query}`
      );
      return;
    }

    let response =
      `🔍 Résultats pour "${query}" :\n\n`;

    results.forEach(
      (msg, index) => {
        response +=
          `${index + 1}. ${msg.sender}: ${msg.content.substring(0, 100)}\n`;
      }
    );

    await reply(response);

  } catch (err) {
    console.error(
      'Erreur /search :',
      err
    );

    await reply(
      '❌ Erreur lors de la recherche.'
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

    tasks.forEach((task) => {
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

    let response =
      '⚙️ Paramètres actuels\n\n';

    for (
      const [key, value]
      of Object.entries(settings)
    ) {
      response +=
        `${key}: ${value}\n`;
    }

    response +=
      '\n/set <clé> <valeur>';

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

