// Façade de compatibilité pendant le refactoring architectural.
// Le composition root (assemblage des repositories, adapters, services,
// use cases et interfaces, puis démarrage de l'application) vit désormais
// dans src/bootstrap/main.js.
export { main, getWhatsAppHandlers } from './src/bootstrap/main.js';
