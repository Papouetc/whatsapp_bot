import { sendWhatsAppMessage } from './whatsapp.js';
import { sendTelegramMessage } from './telegram.js';

export async function handleCommand(commandText, source = 'whatsapp', sender = null) {

    const args = commandText.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    // Fonction permettant d'envoyer la réponse au bon endroit
    const reply = async (message) => {
        if (source === 'whatsapp') {
            if (!sender) {
                console.error('❌ Impossible de répondre sur WhatsApp : sender manquant');
                return;
            }

            await sendWhatsAppMessage(sender, message);
        } else {
            await sendTelegramMessage(message);
        }
    };

    switch (cmd) {

        case '/resume':
            await reply('📋 Génération du résumé...');
            break;

        case '/search': {
            const query = args.slice(1).join(' ');

            if (!query) {
                await reply('❌ Utilisation : /search <question>');
                return;
            }

            await reply(`🔍 Recherche : ${query}`);
            break;
        }

        case '/taches':
            await reply('📝 Affichage des tâches...');
            break;

        case '/fait': {
            const id = args[1];

            if (!id) {
                await reply('❌ Utilisation : /fait <id>');
                return;
            }

            await reply(`⏳ Traitement de la tâche #${id}...`);
            break;
        }

        case '/envoie': {
            const id = args[1];

            if (!id) {
                await reply('❌ Utilisation : /envoie <id>');
                return;
            }

            await reply(`📤 Préparation de l'envoi du brouillon #${id}...`);
            break;
        }

        case '/settings':
            await reply('⚙️ Affichage des paramètres...');
            break;

        case '/set': {
            const key = args[1];
            const value = args.slice(2).join(' ');

            if (!key || !value) {
                await reply('❌ Utilisation : /set <clé> <valeur>');
                return;
            }

            await reply(`⚙️ Modification de ${key}...`);
            break;
        }

        case '/help': {
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
            break;
        }

        default:
            await reply(`❓ Commande inconnue : ${cmd}`);
    }
}