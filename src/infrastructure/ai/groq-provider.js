const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export function isGroqAvailable() {
    return !!GROQ_API_KEY;
}

export async function callGroq(systemPrompt, userPrompt, { json = false } = {}) {
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY manquant');

    const body = {
        model: GROQ_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
    };
    if (json) body.response_format = { type: 'json_object' };

    const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errText = await res.text();
        const err = new Error(`Erreur Groq (${res.status}): ${errText}`);
        err.status = res.status;
        throw err;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
}
