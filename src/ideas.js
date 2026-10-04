// The idea bank. Refills itself with the AI when it runs low; you can push your own ideas any time.
const llm = require('./llm');
const db = require('./db');
const script = require('./script');

const SEED = [
  { text: 'Customers keep asking if your business has a website', kind: 'business' },
  { text: 'Your Instagram page looks great but nobody can book or order from it', kind: 'business' },
  { text: 'You lose orders because people cannot find your prices online', kind: 'business' },
  { text: 'Your competitor shows up on Google and you do not', kind: 'business' },
  { text: 'Answering the same WhatsApp questions all day instead of running your business', kind: 'business' },
  { text: 'Your website takes forever to load on a phone and customers leave', kind: 'business' },
  { text: 'AI is writing half the code now, so what is a developer actually for', kind: 'developer' },
  { text: 'Client says it is a small change, it is not a small change', kind: 'developer' },
  { text: 'Debugging for 3 hours to find a missing semicolon', kind: 'developer' },
  { text: 'Why a cheap website ends up costing you more', kind: 'business' },
];

const unused = () => db.get().ideas.filter((i) => !i.used);

function add(text, kind = 'auto', priority = false) {
  const d = db.get();
  const idea = { id: db.nextId('i'), text: text.trim(), kind, used: false, source: priority ? 'you' : 'auto', at: Date.now() };
  if (priority) d.ideas.unshift(idea); else d.ideas.push(idea);
  db.save();
  return idea;
}

const next = () => unused()[0];

async function ensure(min = 6) {
  const d = db.get();
  if (d.ideas.length === 0) SEED.forEach((s) => add(s.text, s.kind));
  if (unused().length >= min) return;
  try {
    const recent = d.ideas.slice(-40).map((i) => `- ${i.text}`).join('\n');
    const prompt = `${script.brandIntro()}

Give me 15 fresh topic ideas for short videos. Mix: about 60% BUSINESS (relatable problems that business owners and companies face which a website, software or automation solves) and 40% DEVELOPER (developer life, AI and developers, tech hot takes, things clients say).
Each idea is one plain sentence. Do not repeat or closely paraphrase these existing ideas:
${recent}

Return ONLY JSON: {"ideas":[{"text":"...","kind":"business" or "developer"}]}`;
    const out = await llm.json(prompt, (r) => {
      if (!Array.isArray(r.ideas) || !r.ideas.length) throw new Error('no ideas');
      return r.ideas;
    });
    const have = new Set(d.ideas.map((i) => i.text.toLowerCase()));
    for (const i of out) {
      const text = String(i.text || '').trim();
      if (text.length < 10 || have.has(text.toLowerCase())) continue;
      have.add(text.toLowerCase());
      add(text, i.kind === 'developer' ? 'developer' : 'business');
    }
  } catch (e) {
    console.warn('Could not brainstorm new ideas:', e.message);
  }
}

module.exports = { add, next, unused, ensure };
