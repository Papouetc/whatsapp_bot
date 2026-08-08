import 'dotenv/config';
import { initDB, closeDB, saveMessage, getUnsummarizedMessages, markAsSummarized, getSetting, getAllSettings, setSetting, getPendingTasks, markTaskDone, saveTasks, searchArchiveByKeyword } from './database.js';
import { startWhatsApp, sendWhatsAppMessage, getOwnJid } from './whatsapp.js';
import { startTelegramListener, sendTelegramMessage } from './telegram.js';
import { handleCommand } from './commands.js';
import { scheduleDailySummary } from './scheduler.js';
import { isPotentiallyUrgent } from './urgency.js';
import { confirmUrgency, generateDraftReply, summarizeMessages } from './ai.js';
import { addDraft, handleDraftCommand } from './drafts.js';
import { handleChatMessage } from './chat.js';

process.on('uncaughtException', (err) => {
  console.error('⚠️ Erreur non interceptée (le bot continue) :', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('⚠️ Rejet de promesse non intercepté (le bot continue) :', err);
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
  const { sender, content, isGroup, timestamp } = msgData;
  
  console.log(`📩 Message de ${sender}: ${content.substring(0, 50)}...`);
  
  const urgencyDetectionOn = (await getSetting('urgency_detection')) === 'on';
  if (urgencyDetectionOn && isPotentiallyUrgent(content)) {
    try {
      const { urgent, reason } = await confirmUrgency({ content, sender });
      if (urgent) {
        await sendTelegramMessage(`🚨 URGENT de ${sender}:\n${content}\n\nRaison: ${reason}`);
        console.log('🚨 Alerte urgence envoyée à Telegram');
      }
    } catch (err) {
      console.error('Erreur détection urgence :', err);
    }
  }
  
  if (!isGroup) {
    const draftModeOn = (await getSetting('draft_mode')) === 'on';
    if (draftModeOn) {
      try {
        const recentHistory = await searchArchiveByKeyword('', 20);
        const draft = await generateDraftReply({ sender, recentHistory, incomingContent: content });
        if (draft) {
          await addDraft(sender, draft);
          await sendTelegramMessage(`📝 Brouillon pour ${sender}:\n${draft}\n\nCommande: /envoie <id>`);
        }
      } catch (err) {
        console.error('Erreur génération brouillon :', err);
      }
    }
  }
}

async function handleWhatsAppCommand(command, sender) {
  const args = command.split(' ');
  const cmd = args[0].toLowerCase();
  
  switch (cmd) {
    case '/resume':
      await handleResumeCommand(sender);
      break;
    
    case '/search':
      const query = args.slice(1).join(' ');
      await handleSearchCommand(query, sender);
      break;
    
    case '/taches':
      await handleTasksCommand(sender);
      break;
    
    case '/fait':
      const taskId = args[1];
      await handleTaskDoneCommand(taskId, sender);
      break;
    
    case '/envoie':
      const draftId = args[1];
      await handleDraftCommand(draftId, sender);
      break;
    
    case '/settings':
      await handleSettingsCommand(sender);
      break;
    
    case '/set':
      const key = args[1];
      const value = args.slice(2).join(' ');
      await handleSetCommand(key, value, sender);
      break;
    
    default:
      await sendWhatsAppMessage(sender, '❓ Commande inconnue. Tape /help pour voir les commandes.');
  }
}

async function handleTelegramCommand(commandText) {
  await handleCommand(commandText);
}

async function handleResumeCommand(sender) {
  try {
    const messages = await getUnsummarizedMessages();
    if (messages.length === 0) {
      await sendWhatsAppMessage(sender, '✅ Aucun nouveau message à résumer.');
      return;
    }
    
    const { summary, tasks } = await summarizeMessages(messages);
    await sendWhatsAppMessage(sender, `📋 Résumé :\n${summary}`);
    
    if (tasks && tasks.length > 0) {
      await saveTasks(tasks);
    }
    
    const ids = messages.map(m => m.id);
    await markAsSummarized(ids);
    
  } catch (err) {
    console.error('Erreur /resume :', err);
    await sendWhatsAppMessage(sender, '❌ Erreur lors de la génération du résumé.');
  }
}

async function handleSearchCommand(query, sender) {
  try {
    const results = await searchArchiveByKeyword(query, 10);
    
    if (results.length === 0) {
      await sendWhatsAppMessage(sender, `❌ Aucun résultat pour: ${query}`);
      return;
    }
    
    let response = `🔍 Résultats pour "${query}":\n\n`;
    results.forEach((msg, i) => {
      response += `${i + 1}. ${msg.sender}: ${msg.content.substring(0, 60)}...\n`;
    });
    
    await sendWhatsAppMessage(sender, response);
    
  } catch (err) {
    console.error('Erreur /search :', err);
    await sendWhatsAppMessage(sender, '❌ Erreur lors de la recherche.');
  }
}

async function handleTasksCommand(sender) {
  try {
    const tasks = await getPendingTasks();
    
    if (tasks.length === 0) {
      await sendWhatsAppMessage(sender, '✅ Aucune tâche en attente.');
      return;
    }
    
    let response = '📝 Tâches en attente:\n\n';
    tasks.forEach(t => {
      response += `[${t.id}] ${t.description}\n`;
    });
    
    await sendWhatsAppMessage(sender, response);
    
  } catch (err) {
    console.error('Erreur /taches :', err);
    await sendWhatsAppMessage(sender, '❌ Erreur lors de la récupération des tâches.');
  }
}

async function handleTaskDoneCommand(taskId, sender) {
  try {
    const success = await markTaskDone(parseInt(taskId));
    
    if (success) {
      await sendWhatsAppMessage(sender, `✅ Tâche ${taskId} marquée comme terminée.`);
    } else {
      await sendWhatsAppMessage(sender, `❌ Tâche ${taskId} introuvable.`);
    }
    
  } catch (err) {
    console.error('Erreur /fait :', err);
    await sendWhatsAppMessage(sender, '❌ Erreur lors de la mise à jour de la tâche.');
  }
}

async function handleSettingsCommand(sender) {
  try {
    const settings = await getAllSettings();
    
    let response = '⚙️ Paramètres actuels:\n\n';
    for (const [key, value] of Object.entries(settings)) {
      response += `${key}: ${value}\n`;
    }
    response += '\nCommande: /set <clé> <valeur>';
    
    await sendWhatsAppMessage(sender, response);
    
  } catch (err) {
    console.error('Erreur /settings :', err);
    await sendWhatsAppMessage(sender, '❌ Erreur lors de la récupération des paramètres.');
  }
}

async function handleSetCommand(key, value, sender) {
  try {
    await setSetting(key, value);
    await sendWhatsAppMessage(sender, `✅ ${key} défini à ${value}`);
  } catch (err) {
    console.error('Erreur /set :', err);
    await sendWhatsAppMessage(sender, '❌ Erreur lors de la mise à jour du paramètre.');
  }
}

function printAvailableCommands() {
  console.log('\n📱 Commandes disponibles (depuis WhatsApp ou Telegram):');
  console.log('  /resume                 -> résumé immédiat');
  console.log('  /search <question>      -> recherche en langage naturel');
  console.log('  /taches                 -> tâches en attente');
  console.log('  /fait <id>              -> marquer une tâche finie');
  console.log('  /envoie <id>            -> envoyer un brouillon');
  console.log('  /settings               -> voir tous les paramètres');
  console.log('  /set <clé> <valeur>     -> modifier un paramètre');
  console.log('\nParle directement (message à toi-même) pour discuter avec le bot.\n');
}

/* main().catch((err) => {
  console.error('❌ Erreur fatale :', err);
  process.exit(1);
}); */