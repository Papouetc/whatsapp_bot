import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN manquant dans .env');
}

const bot = new TelegramBot(token, { polling: true });
const chatId = process.env.TELEGRAM_CHAT_ID;

let messageHandler = null;

export function startTelegramListener(handler) {
  messageHandler = handler;
  
  bot.on('message', async (msg) => {
    const text = msg.text;
    
    if (text.startsWith('/')) {
      if (messageHandler) {
        await messageHandler(text);
      }
    }
  });
  
  bot.onText(/\//, async (msg, match) => {
    if (messageHandler) {
      await messageHandler(msg.text);
    }
  });
  
  console.log('📱 Telegram bot écouté');
}

export async function sendTelegramMessage(text) {
  try {
    if (!chatId) {
      console.warn('⚠️ TELEGRAM_CHAT_ID manquant, message non envoyé');
      return;
    }
    
    await bot.sendMessage(chatId, text);
    console.log('✉️ Message Telegram envoyé');
  } catch (err) {
    console.error('❌ Erreur envoi Telegram :', err);
  }
}