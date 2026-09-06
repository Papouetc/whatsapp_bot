const SOURCES = new Set([
    'web',
    'whatsapp',
    'telegram',
    'scheduler',
    'system'
]);

export function createExecutionContext({
    userId,
    source,
    conversationId = null,
    messageId = null,
    requestId = null,
    sessionId = null
} = {}) {
    if (typeof userId !== 'string' || !userId.trim()) {
        throw new Error('ExecutionContext.userId est obligatoire');
    }

    if (!SOURCES.has(source)) {
        throw new Error(`Source d execution inconnue : ${source}`);
    }

    return Object.freeze({
        userId: userId.trim(),
        source,
        conversationId,
        messageId,
        requestId,
        sessionId
    });
}

export function createCanonicalUserId(databaseId) {
    const id = Number(databaseId);

    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error('Identifiant utilisateur interne invalide');
    }

    return `user:${id}`;
}

export function getDatabaseUserId(userId) {
    if (typeof userId !== 'string') {
        return null;
    }

    const match = /^(?:user|web):(\d+)$/.exec(userId.trim());
    if (!match) {
        return null;
    }

    const id = Number(match[1]);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function isLegacyUserId(userId) {
    return userId === 'legacy';
}

export { SOURCES };
