import express from 'express';
import dotenv from 'dotenv';
import { main, getWhatsAppHandlers } from './index.js';
import { createWebUser, getWebUserByEmail } from './database.js';
import { startWhatsApp, requestPairingCode } from './whatsapp.js';
import {
    hashPassword,
    verifyPassword,
    createSessionToken,
    readSessionToken,
    parseCookies
} from './web-auth.js';
import { logSafeError } from './logger.js';

dotenv.config();

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static('.'));

function getAuthenticatedUser(req) {
    const cookies = parseCookies(req.headers.cookie);
    const session = readSessionToken(cookies.hakili_session);
    return session?.userId || null;
}

function requireAuth(req, res, next) {
    const userId = getAuthenticatedUser(req);

    if (!userId) {
        res.status(401).json({ error: 'Authentification requise' });
        return;
    }

    req.userId = userId;
    next();
}

function setSessionCookie(res, token) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader(
        'Set-Cookie',
        `hakili_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure}`
    );
}

app.get('/api/health', (req, res) => {
    res.json({ ok: true });
});

app.post('/api/register', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 12) {
            res.status(400).json({
                error: 'Email invalide ou mot de passe trop court (12 caractères minimum)'
            });
            return;
        }

        const user = await createWebUser(email, await hashPassword(password));
        setSessionCookie(res, createSessionToken(user.userId));
        res.status(201).json({ ok: true });
    } catch (error) {
        if (error.code === '23505') {
            res.status(409).json({ error: 'Ce compte existe déjà' });
            return;
        }

        logSafeError('Erreur inscription web', error);
        res.status(500).json({ error: 'Inscription impossible' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const user = await getWebUserByEmail(email);

        if (!user || !(await verifyPassword(password, user.password_hash))) {
            res.status(401).json({ error: 'Identifiants invalides' });
            return;
        }

        setSessionCookie(res, createSessionToken(user.userId));
        res.json({ ok: true, whatsappConnected: Boolean(user.whatsapp_jid) });
    } catch (error) {
        logSafeError('Erreur connexion web', error);
        res.status(500).json({ error: 'Connexion impossible' });
    }
});

app.post('/api/pair', requireAuth, async (req, res) => {
    try {
        const phoneNumber = String(req.body.phoneNumber || '');
        await startWhatsApp(req.userId, getWhatsAppHandlers());
        const code = await requestPairingCode(req.userId, phoneNumber);
        res.json({ ok: true, code });
    } catch (error) {
        logSafeError('Erreur pairing web', error);
        res.status(400).json({
            error: 'Pairing impossible. Vérifie le numéro international.'
        });
    }
});

app.post('/api/logout', (req, res) => {
    res.setHeader(
        'Set-Cookie',
        'hakili_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
    );
    res.json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
    console.log(`Serveur en écoute sur le port ${port}`);
    main().catch((error) => {
        logSafeError('Erreur démarrage bot', error);
        process.exit(1);
    });
});
