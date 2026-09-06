// Façade de compatibilité pendant le refactoring architectural.
// La logique technique WhatsApp (Baileys, sessions, reconnexion, envoi de
// messages, pairing) vit désormais dans src/infrastructure/whatsapp/.
export * from './src/infrastructure/whatsapp/whatsapp-client.js';
