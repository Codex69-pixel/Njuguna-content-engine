// Asks the AI (Ollama on your PC, or Gemini online) for JSON and retries if it rambles.
const cfg = require('./config');

function extractJSON(text) {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('No JSON in model reply');
  return JSON.parse(text.slice(a, b + 1));
}

async function ollama(prompt) {
  const r = await fetch(`${cfg.llm.ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.llm.ollamaModel,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0.8 },
    }),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).response || '';
}

async function gemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.llm.geminiModel}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.llm.geminiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
}

/** Ask for JSON; `validate` can throw to force a retry. */
async function json(prompt, validate = (x) => x, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const raw = cfg.llm.provider === 'gemini' ? await gemini(prompt) : await ollama(prompt);
      return validate(extractJSON(raw));
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`The AI writer failed after ${tries} tries (${last?.message})`);
}

module.exports = { json };
