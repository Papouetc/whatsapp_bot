const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export function isGeminiAvailable() {
    return !!GEMINI_API_KEY;
}

export async function callGemini(systemPrompt, userPrompt, { json = false } = {}) {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY manquant');

    const generationConfig = json ? { responseMimeType: 'application/json' } : undefined;

    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            ...(generationConfig ? { generationConfig } : {}),
        }),
    });

    if (!res.ok) {
        const errText = await res.text();
        const err = new Error(`Erreur Gemini (${res.status}): ${errText}`);
        err.status = res.status;
        throw err;
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
