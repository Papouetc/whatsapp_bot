import {
    makeWASocket,
    DisconnectReason,
    Browsers
} from '@whiskeysockets/baileys';

import pino from 'pino';
import { createAuthState } from './auth-state.js';
import {
    saveMessage,
    setUserWhatsAppJid
} from './database.js';
import dotenv from 'dotenv';
import { logSafeError } from './logger.js';

dotenv.config();

const SENT_IDS_MAX = 200;

const sessions = new Map();

function getSession(userId = 'legacy') {
    let session = sessions.get(userId);
    if (!session) {
        session = {
            userId,
            sock: null,
            reconnecting: false,
            pairingRequested: false,
            sentByBot: new Set(),
            sendQueue: Promise.resolve(),
            handlers: null
        };
        sessions.set(userId, session);
    }
    return session;
}

function rememberSentId(session, id) {
    session.sentByBot.add(id);
    if (session.sentByBot.size > SENT_IDS_MAX) {
        const oldest = session.sentByBot.values().next().value;
        session.sentByBot.delete(oldest);
    }
}

function extractNumber(jid) {
    if (!jid) return null;
    return jid.split('@')[0].split(':')[0];
}

function isOwnJid(session, remoteJid) {
    if (!remoteJid || !session.sock?.user) return false;
    const remoteNumber = extractNumber(remoteJid);
    if (remoteNumber === extractNumber(session.sock.user.id)) return true;
    if (remoteNumber === extractNumber(session.sock.user.lid)) return true;
    return false;
}

function setupEvents(session, sockInstance, saveCreds, handlers) {
    sockInstance.ev.on(
        'connection.update',
        async (update) => {
            const {
                connection,
                lastDisconnect
            } = update;

            if (connection === 'connecting') {
                console.log(
                    '🔄 Connexion WhatsApp en cours...'
                );

                return;
            }

            if (connection === 'open') {
                console.log(
                    '✅ Connecté à WhatsApp'
                );

                console.log(
                    `👤 Compte : ${sockInstance.user?.id || 'inconnu'
                    }`
                );

                session.reconnecting = false;
                await saveCreds();
                const connectedJid = sockInstance.user?.lid || sockInstance.user?.id;
                if (connectedJid && session.userId !== 'legacy') {
                    await setUserWhatsAppJid(session.userId, connectedJid);
                }
                await sockInstance.sendPresenceUpdate('unavailable');
                return;
            }

            if (connection === 'close') {
                const error =
                    lastDisconnect?.error;

                const reason =
                    error?.output?.statusCode;

                console.log(
                    `⚠️ Connexion fermée (code: ${reason})`
                );

                if (error) {
                    logSafeError('Détails déconnexion', error);
                }

                session.sock = null;

                if (
                    reason === DisconnectReason.loggedOut
                ) {
                    console.log(
                        '🚪 Session WhatsApp déconnectée.'
                    );

                    session.reconnecting = false;
                    session.pairingRequested = false;

                    return;
                }

                if (session.reconnecting) {
                    return;
                }

                session.reconnecting = true;

                console.log(
                    '🔄 Nouvelle tentative dans 2 secondes...'
                );

                setTimeout(async () => {
                    try {
                        await startWhatsApp(session.userId, handlers);
                    } catch (err) {
                        logSafeError('Erreur reconnexion', err);
                    } finally {
                        session.reconnecting = false;
                    }
                }, 2000);
            }
        }
    );

    sockInstance.ev.on(
        'creds.update',
        async (updatedCreds) => {
            try {
                await saveCreds(updatedCreds);
            } catch (err) {
                logSafeError('Erreur sauvegarde credentials', err);
            }
        }
    );

    sockInstance.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            try {
                await handleIncomingMessage(session, msg, handlers);
            } catch (err) {
                logSafeError('Erreur traitement message', err);
            }
        }
    });
}

async function handleIncomingMessage(session, msg, handlers) {
    if (!msg?.key?.remoteJid) {
        return;
    }

    if (!msg.message) {
        return;
    }

    const remoteJid = msg.key.remoteJid;
    const isStatus = (remoteJid === 'status@broadcast') || (remoteJid === 'status@newsletter');
    const isNewsletter = remoteJid.endsWith('@newsletter');
    const timestamp = Number(msg.messageTimestamp) * 1000;

    let content = '';

    if (msg.message?.conversation) {
        content = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
        content = msg.message.extendedTextMessage.text;
    }

    if (!content) {
        return;
    }

    const fromMe = msg.key.fromMe;
    const isSelfChat = fromMe && isOwnJid(session, remoteJid);

    if (fromMe && msg.key.id && session.sentByBot.has(msg.key.id)) {
        return;
    }



    const isGroup = remoteJid.endsWith('@g.us');

    // Identifiant technique de l'expéditeur
    const sender = isSelfChat
        ? (session.sock?.user?.id || remoteJid)
        : (msg.key.participant || remoteJid);

    // Nom humain de l'expéditeur
    const sender_name = isSelfChat
        ? null
        : (msg.pushName || null);

    // Nom de la conversation
    let chatName = null;

    if (isGroup) {
        try {
            const metadata = await session.sock.groupMetadata(remoteJid);
            chatName = metadata?.subject || null;
        } catch (err) {
            console.warn(
                `⚠️ Impossible de récupérer le nom du groupe ${remoteJid}:`,
                err.message
            );
        }
    } else {
        // Pour un DM, le pushName est généralement le nom du contact
        chatName = msg.pushName || null;
    }

    try {
        await saveMessage({
            userId: session.userId,
            chatId: remoteJid,
            chatName,
            sender,
            sender_name,
            content,
            timestamp,
            isGroup,
            isStatus,
            is_from_me: fromMe === true
        });
    } catch (err) {
        logSafeError('Erreur archivage message', err);

        return;
    }

    if (isStatus) {
        console.log(
            '📸 Statut archivé'
        );

        return;
    }

    if (isNewsletter) {
        console.log(
            '📸 Message chaine ignoré'
        );

        return;
    }
    if (fromMe && !isSelfChat) {

        return;
    }
    if (isSelfChat) {
        const trimmed = content.trim();
        await sendWhatsAppMessageReaction(session.userId, remoteJid, "😎", msg);
        if (trimmed.startsWith('/')) {
            if (handlers?.onCommand) {
                await handlers.onCommand(trimmed, remoteJid, session.userId);
            }
        } else if (handlers?.onSelfChat) {
            await handlers.onSelfChat(trimmed, remoteJid, session.userId);
        }

        return;
    }

    if (handlers?.onMessage) {
        await handlers.onMessage({
            userId: session.userId,
            sender,
            sender_name,
            chatName,
            content,
            isGroup,
            isStatus,
            isNewsletter,
            timestamp,
            msg
        });
    }

    console.log(
        `✅ Message traité de ${sender_name || sender}`
    );
}

export async function startWhatsApp(userIdOrHandlers = 'legacy', maybeHandlers) {
    const userId = typeof userIdOrHandlers === 'string'
        ? userIdOrHandlers
        : 'legacy';
    const handlers = typeof userIdOrHandlers === 'string'
        ? maybeHandlers
        : userIdOrHandlers;
    const session = getSession(userId);
    session.handlers = handlers;

    try {
        console.log(
            '🔄 Initialisation WhatsApp...'
        );

        const state =
            await createAuthState(userId);

        console.log(
            `🔐 Session enregistrée : ${state.creds.registered
            }`
        );

        session.sock = makeWASocket({
            auth: state,
            logger: pino({
                level: 'silent'
            }),
            browser:
                Browsers.ubuntu('Chrome'),
            defaultQueryTimeoutMs:
                undefined
        });

        setupEvents(
            session,
            session.sock,
            state.saveCreds,
            handlers
        );

        const phoneNumber =
            process.env.PHONE_NUMBER;

        if (
            userId === 'legacy' &&
            phoneNumber &&
            !state.creds.registered &&
            !session.pairingRequested
        ) {
            session.pairingRequested = true;

            setTimeout(async () => {
                try {
                    if (!session.sock) {
                        throw new Error(
                            'Socket WhatsApp indisponible'
                        );
                    }

                    const cleanNumber =
                        phoneNumber.replace(
                            /\D/g,
                            ''
                        );

                    console.log(
                        '📱 Demande du pairing code...'
                    );

                    const code =
                        await session.sock.requestPairingCode(
                            cleanNumber
                        );

                    console.log(
                        `📱 Code de pairing : ${code}`
                    );

                } catch (err) {
                    session.pairingRequested = false;

                    logSafeError('Erreur pairing code', err);
                }
            }, 3000);
        }

        console.log(
            '✅ Socket WhatsApp initialisée'
        );

    } catch (err) {
        logSafeError('Erreur startWhatsApp', err);

        throw err;
    }
}

export async function sendWhatsAppMessage(...args) {
    const [userId, chatId, text] = args.length === 2
        ? ['legacy', ...args]
        : args;
    const session = getSession(userId);
    if (!session.sock) {
        throw new Error(
            "WhatsApp n'est pas initialisé"
        );
    }

    // On chaîne cet envoi à la suite du précédent, pour ne jamais avoir
    // deux sendMessage() en vol simultanément (source probable de la perte
    // silencieuse de messages en self-chat).
    const task = session.sendQueue.then(async () => {
        try {
            const result = await session.sock.sendMessage(
                chatId,
                { text }
            );

            if (result?.key?.id) {
                rememberSentId(session, result.key.id);
            }

            console.log(
                `✉️ Message envoyé à ${chatId}`
            );

        } catch (err) {
            logSafeError('Erreur envoi message', err);

            throw err;
        }
    });

    // On avale l'erreur ici pour ne pas casser la chaîne de la queue pour
    // les envois suivants, mais on la repropage à l'appelant.
    session.sendQueue = task.catch(() => { });

    return task;
}

export async function logoutWhatsApp(userId = 'legacy') {
    const session = getSession(userId);
    const currentSock = session.sock;

    if (!currentSock) {
        return;
    }

    await session.sendQueue;
    await currentSock.logout();
    session.sock = null;
}

export async function sendWhatsAppMessageReaction(...args) {
    const [userId, chatId, text, incomingMessage] = args.length === 3
        ? ['legacy', ...args]
        : args;
    const session = getSession(userId);
    if (!session.sock) {
        throw new Error(
            "WhatsApp n'est pas initialisé"
        );
    }

    const task = session.sendQueue.then(async () => {
        try {
            const result = await session.sock.sendMessage(
                chatId,
                {
                    react: {
                        text: text,
                        key: incomingMessage.key
                    }
                });

            if (result?.key?.id) {
                rememberSentId(session, result.key.id);
            }

            console.log(
                `reaction envoyée à ${chatId}`
            );

        } catch (err) {
            logSafeError('Erreur envoi reaction', err);

            throw err;
        }
    });

    // On avale l'erreur ici pour ne pas casser la chaîne de la queue pour
    // les envois suivants, mais on la repropage à l'appelant.
    session.sendQueue = task.catch(() => { });

    return task;
}
function stripDeviceSuffix(jid) {

    if (!jid) return jid;

    const [userPart, domain] = jid.split('@');

    const bareUser = userPart.split(':')[0];

    return `${bareUser}@${domain}`;

}


export function getOwnJid(userId = 'legacy') {
    const session = getSession(userId);
    if (!session.sock?.user) {
        return null;
    }

    const jid = session.sock.user.lid || session.sock.user.id;

    return stripDeviceSuffix(jid);
}

export async function requestPairingCode(userId, phoneNumber) {
    if (typeof userId !== 'string' || !userId.trim() || userId === 'legacy') {
        throw new Error('Utilisateur WhatsApp invalide');
    }

    const cleanNumber = String(phoneNumber || '').replace(/\D/g, '');
    if (cleanNumber.length < 8 || cleanNumber.length > 15) {
        throw new Error('Numéro WhatsApp invalide');
    }

    const session = getSession(userId);
    const deadline = Date.now() + 15000;
    while (!session.sock && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 250));
    }

    if (!session.sock) {
        throw new Error('Socket WhatsApp indisponible');
    }

    return session.sock.requestPairingCode(cleanNumber);
}