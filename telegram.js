import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { logSafeError } from './logger.js';
import {
  getOrCreateUser,
  getUserTelegramChatId
} from './database.js';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = token ? new TelegramBot(token, { polling: true }) : null;
const chatId = process.env.TELEGRAM_CHAT_ID;

let messageHandler = null;
const userChatIds = new Map();

function isAuthorizedChat(message) {
  return message.chat?.type === 'private' && Boolean(message.from?.id);
}

export function startTelegramListener(handler) {
  messageHandler = handler;

  if (!bot) {
    console.log('📱 Telegram désactivé');
    return;
  }

  bot.on('message', async (msg) => {
    if (!isAuthorizedChat(msg)) {
      return;
    }

    const text = msg.text;

    if (typeof text === 'string' && text.startsWith('/') && messageHandler) {
      const telegramUserId = msg.from?.id || msg.chat.id;
      await getOrCreateUser(
        telegramUserId,
        msg.from?.username || null,
        String(msg.chat.id)
      );
      userChatIds.set(String(telegramUserId), String(msg.chat.id));
      await messageHandler(
        text,
        String(msg.chat.id),
        String(telegramUserId)
      );
    }
  });

  console.log('📱 Telegram bot écouté');
}

export async function sendTelegramMessage(text, targetChatId = chatId) {
  try {
    if (!bot || !targetChatId) {
      console.warn('⚠️ TELEGRAM_CHAT_ID manquant, message non envoyé');
      return;
    }

    await bot.sendMessage(targetChatId, text);
    console.log('✉️ Message Telegram envoyé');
  } catch (err) {
    logSafeError('Erreur envoi Telegram', err);
  }
}

export async function sendTelegramMessageForUser(text, userId) {
  const targetChatId = userChatIds.get(String(userId))
    || await getUserTelegramChatId(userId)
    || (String(userId) === 'legacy' ? chatId : null);

  return sendTelegramMessage(text, targetChatId);
}