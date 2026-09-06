// Façade de compatibilité pendant le refactoring architectural.
// La logique technique Telegram (node-telegram-bot-api, polling, routage
// des commandes vers le handler applicatif) vit désormais dans
// src/infrastructure/telegram/.
export * from './src/infrastructure/telegram/telegram-client.js';
