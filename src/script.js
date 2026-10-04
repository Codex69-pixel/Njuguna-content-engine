// Writes (and rewrites) the video script + caption.
const cfg = require('./config');
const llm = require('./llm');
const db = require('./db');

const DEFAULT_TONE =
  'friendly, social, upbeat and relatable - like a smart friend chatting, never stiff or corporate';

function brandIntro() {
  const tone = db.get().state.tone || DEFAULT_TONE;
  return `You write short-form vertical video content (TikTok, Reels, YouTube Shorts, Facebook) for Njuguna, a Kenyan web developer who runs ${cfg.brand.name}, a company that builds websites, software and digital solutions for businesses and corporations.
TONE: ${tone}. Keep it clean: no swearing or vulgar phrasing, even for hot takes.`;
}

const FORMATS = `Two kinds of videos:
A) BUSINESS: audience is business owners and companies. The video shows a relatable problem (hook, then the pain). The caption gives the solution: how a good website, software or automation fixes it, and invites them to message.
B) DEVELOPER: audience is developers and tech people. The video is a relatable, funny or opinionated take on developer life or tech news (for example AI changing how developers work). The caption gives Njuguna's honest view in a few short sentences and ends with a question to start discussion.`;

const JSON_SHAPE = `Return ONLY JSON in exactly this shape:
{"format":"business" or "developer",
 "lines":[{"text":"spoken line","search":"stock footage query"}],
 "caption_body":"...",
 "hashtags":["#tag1","#tag2"]}`;

const RULES = `Rules:
- 4 to 6 lines. Each line max 14 words, written to be spoken aloud. Line 1 is a scroll-stopping hook. The last line leads into the caption.
- "search" is a 2-3 word stock footage query for something simple to film, e.g. "man laptop frustrated", "busy cafe owner", "typing code screen". Never name movies, celebrities, brands or real people.
- caption_body: 3-5 short sentences, no hashtags, no contact details (those are added automatically). At most 2 emojis.
- 6 to 8 hashtags: mix broad and niche (Kenya, web design, developers...).
- Never say Njuguna is a student. No fake statistics, no guaranteed results, no false claims.`;

function validate(raw) {
  if (!raw || !Array.isArray(raw.lines)) throw new Error('lines missing');
  const lines = raw.lines
    .map((l) => ({
      text: String(l.text || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      search: String(l.search || '').replace(/[^\w\s-]/g, '').trim().slice(0, 60),
    }))
    .filter((l) => l.text);
  if (lines.length < 3 || lines.length > 7) throw new Error('need 3-7 lines');
  lines.forEach((l) => { if (!l.search) l.search = 'business owner'; });
  const caption = String(raw.caption_body || '').trim();
  if (caption.length < 20) throw new Error('caption too short');
  const tags = (Array.isArray(raw.hashtags) ? raw.hashtags : [])
    .map((t) => String(t).trim().replace(/\s+/g, ''))
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : '#' + t))
    .slice(0, 10);
  const replace = (Array.isArray(raw.replace_clips) ? raw.replace_clips : [])
    .map((n) => Number(n) - 1)
    .filter((n) => Number.isInteger(n) && n >= 0 && n < lines.length);
  return {
    format: raw.format === 'developer' ? 'developer' : 'business',
    lines,
    caption_body: caption,
    hashtags: tags,
    replace_clips: replace,
  };
}

function generate(topic, kind = 'auto') {
  const prompt = `${brandIntro()}

${FORMATS}

Topic: ${topic}
Format hint: ${kind} (business, developer, or auto = pick whichever fits the topic best)

${JSON_SHAPE}

${RULES}`;
  return llm.json(prompt, validate);
}

function revise(script, feedback) {
  const current = JSON.stringify(
    { format: script.format, lines: script.lines, caption_body: script.caption_body, hashtags: script.hashtags },
    null, 2
  );
  const prompt = `${brandIntro()}

${FORMATS}

Here is the current video script:
${current}

Njuguna's feedback: "${feedback}"

Rewrite the script so it follows the feedback. Keep what already works. Lines are numbered from 1 in the order above.
If the feedback is about a specific clip/visual (e.g. "swap clip 3", "that footage is offensive"), keep the text, change that line's "search" to something different, and list its number in "replace_clips". Only list clips that should be swapped.

${JSON_SHAPE.replace('"hashtags":["#tag1","#tag2"]}', '"hashtags":["#tag1","#tag2"],\n "replace_clips":[]}')}

${RULES}`;
  return llm.json(prompt, validate);
}

function contactBlock() {
  const b = cfg.brand;
  const rows = [
    '━━━━━━━━━━━━━━',
    "Need a website or software for your business? Let's talk 👇",
    `💬 WhatsApp: https://wa.me/${b.whatsapp}`,
    `📧 ${b.email}`,
  ];
  if (b.website) rows.push(`🌐 ${b.website}`);
  return rows.join('\n');
}

function buildCaption(script) {
  return `${script.caption_body}\n\n${contactBlock()}\n\n${script.hashtags.join(' ')}`.trim();
}

module.exports = { generate, revise, buildCaption, brandIntro, validate };
