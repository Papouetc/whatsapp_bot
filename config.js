import dotenv from 'dotenv';

dotenv.config();

export function validateEnvironment() {
    const missing = [];

    for (const name of [
        'DATABASE_URL',
        'WA_AUTH_ENCRYPTION_KEY',
        'WEB_SESSION_SECRET'
    ]) {
        if (!process.env[name]?.trim()) {
            missing.push(name);
        }
    }

    if (!process.env.GROQ_API_KEY?.trim() && !process.env.GEMINI_API_KEY?.trim()) {
        missing.push('GROQ_API_KEY ou GEMINI_API_KEY');
    }

    if (missing.length > 0) {
        throw new Error(
            `Variables d'environnement manquantes : ${missing.join(', ')}`
        );
    }
}
