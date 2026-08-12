import {
    makeWASocket,
    DisconnectReason,
    Browsers
} from '@whiskeysockets/baileys';

import pino from 'pino';
import { createAuthState } from './auth-state.js';
import { saveMessage } from './database.js';
import dotenv from 'dotenv';

dotenv.config();

let sock = null;
let reconnecting = false;
let pairingRequested = false;

const sentByBot = new Set();
const SENT_IDS_MAX = 200;

function rememberSentId(id) {
    sentByBot.add(id);
    if (sentByBot.size > SENT_IDS_MAX) {
        const oldest = sentByBot.values().next().value;
        sentByBot.delete(oldest);
    }
}

function extractNumber(jid) {
    if (!jid) return null;
    return jid.split('@')[0].split(':')[0];
}

function isOwnJid(remoteJid) {
    if (!remoteJid || !sock?.user) return false;
    const remoteNumber = extractNumber(remoteJid);
    if (remoteNumber === extractNumber(sock.user.id)) return true;
    if (remoteNumber === extractNumber(sock.user.lid)) return true;
    return false;
}

function setupEvents(sockInstance, saveCreds, handlers) {
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
                    `👤 Compte : ${
                        sockInstance.user?.id || 'inconnu'
                    }`
                );

                reconnecting = false;
                await saveCreds();
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
                    console.error(
                        '❌ Détails déconnexion:',
                        error
                    );
                }

                sock = null;

                if (
                    reason === DisconnectReason.loggedOut
                ) {
                    console.log(
                        '🚪 Session WhatsApp déconnectée.'
                    );

                    reconnecting = false;
                    pairingRequested = false;

                    return;
                }

                if (reconnecting) {
                    return;
                }

                reconnecting = true;

                console.log(
                    '🔄 Nouvelle tentative dans 2 secondes...'
                );

                setTimeout(async () => {
                    try {
                        await startWhatsApp(
                            handlers
                        );
                    } catch (err) {
                        console.error(
                            '❌ Erreur reconnexion:',
                            err
                        );
                    } finally {
                        reconnecting = false;
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
                console.error(
                    '❌ Erreur sauvegarde credentials:',
                    err
                );
            }
        }
    );

    sockInstance.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
          try {
            await handleIncomingMessage(msg, handlers);
          } catch (err) {
            console.error('❌ Erreur traitement message:', err);
          }
        }
      });
}

async function handleIncomingMessage(msg, handlers) {
    if (!msg?.key?.remoteJid) {
        return;
    }

    if (!msg.message) {
        return;
    }

    const remoteJid = msg.key.remoteJid;
    const isStatus = remoteJid === 'status@broadcast';
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
    const isSelfChat = fromMe && isOwnJid(remoteJid);

    if (fromMe && msg.key.id && sentByBot.has(msg.key.id)) {
        return;
    }

    if (fromMe && !isSelfChat) {
        return;
    }

    const isGroup = remoteJid.endsWith('@g.us');

    // Identifiant technique de l'expéditeur
    const sender = isSelfChat
        ? remoteJid
        : (msg.key.participant || remoteJid);

    // Nom humain de l'expéditeur
    const sender_name = isSelfChat
        ? null
        : (msg.pushName || null);

    // Nom de la conversation
    let chatName = null;

    if (isGroup) {
        try {
            const metadata = await sock.groupMetadata(remoteJid);
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
            chatId: remoteJid,
            chatName,
            sender,
            sender_name,
            content,
            timestamp,
            isGroup,
            isStatus
        });
    } catch (err) {
        console.error(
            '❌ Erreur archivage message:',
            err
        );

        return;
    }

    if (isStatus) {
        console.log(
            '📸 Statut archivé'
        );

        return;
    }

    if (isSelfChat) {
        const trimmed = content.trim();

        if (trimmed.startsWith('/')) {
            if (handlers?.onCommand) {
                await handlers.onCommand(trimmed, remoteJid);
            }
        } else if (handlers?.onSelfChat) {
            await handlers.onSelfChat(trimmed, remoteJid);
        }

        return;
    }

    if (handlers?.onMessage) {
        await handlers.onMessage({
            sender,
            sender_name,
            chatName,
            content,
            isGroup,
            timestamp,
            msg
        });
    }

    console.log(
        `✅ Message traité de ${sender_name || sender}`
    );
}

export async function startWhatsApp(handlers) {
    try {
        console.log(
            '🔄 Initialisation WhatsApp...'
        );

        const state =
            await createAuthState();

        console.log(
            `🔐 Session enregistrée : ${
                state.creds.registered
            }`
        );

        sock = makeWASocket({
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
            sock,
            state.saveCreds,
            handlers
        );

        const phoneNumber =
            process.env.PHONE_NUMBER;

        if (
            phoneNumber &&
            !state.creds.registered &&
            !pairingRequested
        ) {
            pairingRequested = true;

            setTimeout(async () => {
                try {
                    if (!sock) {
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
                        await sock.requestPairingCode(
                            cleanNumber
                        );

                    console.log(
                        `📱 Code de pairing : ${code}`
                    );

                } catch (err) {
                    pairingRequested = false;

                    console.error(
                        '❌ Erreur pairing code:',
                        err
                    );
                }
            }, 3000);
        }

        console.log(
            '✅ Socket WhatsApp initialisée'
        );

    } catch (err) {
        console.error(
            '❌ Erreur startWhatsApp:',
            err
        );

        throw err;
    }
}

export async function sendWhatsAppMessage(
    chatId,
    text
) {
    if (!sock) {
        throw new Error(
            "WhatsApp n'est pas initialisé"
        );
    }

    try {
        const result = await sock.sendMessage(
            chatId,
            { text }
        );

        if (result?.key?.id) {
            rememberSentId(result.key.id);
        }

        console.log(
            `✉️ Message envoyé à ${chatId}`
        );

    } catch (err) {
        console.error(
            '❌ Erreur envoi message:',
            err
        );

        throw err;
    }
}

export function getOwnJid() {
    if (!sock?.user) {
        return null;
    }

    return sock.user.id;
}