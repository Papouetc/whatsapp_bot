// commands.js
import { sendWhatsAppMessage,  } from './whatsapp.js';
import {sendTelegramMessage} from './telegram.js';
export async function handleCommand(commandText) {
  const args = commandText.trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  
  switch (cmd) {
    case '/resume':
      await sendTelegramMessage('📋 Génération du résumé...');
      break;
    
    case '/search':
      const query = args.slice(1).join(' ');
      await sendTelegramMessage(`🔍 Recherche: ${query}`);
      break;
    
    case '/taches':
      await sendTelegramMessage('📝 Affichage des tâches...');
      break;
    
    case '/help':
      const help = `
📱 Commandes disponibles:
/resume - Résumé immédiat
/search <query> - Recherche
/taches - Tâches en attente
/fait <id> - Marquer tâche finie
/envoie <id> - Envoyer brouillon
/settings - Voir paramètres
/set <clé> <valeur> - Modifier paramètre
      `;
      await sendTelegramMessage(help);
      break;
    
    default:
      await sendTelegramMessage(`❓ Commande inconnue: ${cmd}`);
  }
}