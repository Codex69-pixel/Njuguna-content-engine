// Handles everything you send to the bot on WhatsApp (button taps + typed messages).
const cfg = require('./config');
const db = require('./db');
const wa = require('./whatsapp');
const ideas = require('./ideas');
const outbox = require('./outbox');
const pipeline = require('./pipeline');

const say = (text) => wa.sendText(text).catch((e) => console.error('reply failed:', e.message));

const HELP = `Hey! Here's what I understand 👇
• Just type an idea → I'll turn it into a video
• make 3 → build 3 videos from the idea bank now
• On any video: tap ✅ Approve, ✏️ Changes or 🗑️ Reject
• approve all → approve everything waiting
• tone: funnier / more chill / more serious → change my voice
• status → what's waiting + what's scheduled
• pause / resume → stop or restart autopilot
• cancel → forget the change I asked you for`;

function statusText() {
  const jobs = Object.values(db.get().jobs);
  const awaiting = jobs.filter((j) => ['queued', 'awaiting_review'].includes(j.status)).length;
  const building = jobs.filter((j) => ['building', 'revising'].includes(j.status)).length;
  const sched = jobs.filter((j) => j.status === 'approved').sort((a, b) => a.scheduledAt - b.scheduledAt);
  const posted = jobs.filter((j) => j.status === 'posted').length;
  let t = `📊 Status${db.get().state.paused ? ' (⏸️ PAUSED)' : ''}\n`;
  t += `• Waiting for your review: ${awaiting}\n• Being built: ${building}\n• Scheduled: ${sched.length}`;
  if (sched.length) t += ` (next: ${pipeline.fmtSlot(sched[0].scheduledAt)})`;
  t += `\n• Posted so far: ${posted}\n• Ideas in bank: ${ideas.unused().length}`;
  const tone = db.get().state.tone;
  if (tone) t += `\n• Tone: ${tone}`;
  return t;
}

function startIdea(text) {
  const idea = ideas.add(text, 'auto', true);
  pipeline.enqueue(() => pipeline.createFromIdea(idea)).catch((e) => console.error(e));
  return say("Love it 🔥 Building a video from that now. It'll land here in a few minutes.");
}

async function onButton(id) {
  const s = db.get().state;
  const [action, jobId] = String(id).split(':');
  const job = db.get().jobs[jobId];
  if (!job) return say("Hmm, I can't find that video anymore.");
  const label = `#${jobId.slice(1)}`;

  if (action === 'approve') {
    if (job.status === 'approved' || job.status === 'posted') return say(`${label} is already approved 👍`);
    const ts = pipeline.approve(jobId);
    return say(`✅ Approved ${label}. Scheduled for ${pipeline.fmtSlot(ts)}.`);
  }
  if (action === 'changes') {
    s.awaitingJob = jobId;
    db.save();
    return say(`✏️ What should I change on ${label}? Just type it, e.g.\n"make the hook funnier"\n"swap clip 2"\n"shorter and mention pricing"\n(or send "cancel")`);
  }
  if (action === 'reject') {
    pipeline.reject(jobId);
    if (s.awaitingJob === jobId) { s.awaitingJob = null; db.save(); }
    return say(`🗑️ Binned ${label}. Onto the next one.`);
  }
}

async function onText(raw) {
  const text = raw.trim();
  const low = text.toLowerCase();
  const s = db.get().state;

  if (/^(help|\?|menu|hi|hello|hey)$/.test(low)) return say(HELP);
  if (/^status\b/.test(low)) return say(statusText());
  if (/^pause\b/.test(low)) { s.paused = true; db.save(); return say('⏸️ Autopilot paused. Say "resume" when you want me back.'); }
  if (/^resume\b/.test(low)) { s.paused = false; db.save(); return say('▶️ Autopilot is back on.'); }
  if (/^cancel\b/.test(low)) { s.awaitingJob = null; db.save(); return say('No problem, cancelled.'); }

  if (/^approve all\b/.test(low)) {
    const open = Object.values(db.get().jobs).filter((j) => ['queued', 'awaiting_review'].includes(j.status));
    if (!open.length) return say('Nothing waiting for approval 🎉');
    open.forEach((j) => pipeline.approve(j.id));
    return say(`✅ Approved ${open.length} video${open.length > 1 ? 's' : ''}. Say "status" to see the schedule.`);
  }

  const mk = low.match(/^make\s+(\d{1,2})\b/);
  if (mk) {
    const n = Math.min(Number(mk[1]), 10);
    say(`On it 🎬 Building ${n} video${n > 1 ? 's' : ''}. They'll arrive one by one.`);
    pipeline.makeBatch(n).catch((e) => console.error(e));
    return;
  }

  if (/^tone[:\s]/.test(low)) {
    s.tone = text.replace(/^tone[:\s]+/i, '').trim();
    db.save();
    return say(s.tone ? `🎙️ Got it. From now on I'll write in this style: ${s.tone}` : 'Tone reset to my default.');
  }

  if (/^(idea|topic)\b[:\s]/i.test(text)) {
    const body = text.replace(/^(idea|topic)[:\s]*/i, '').trim();
    if (body.length < 5) return say('Tell me the idea after the word, e.g. "idea: clients who pay late".');
    return startIdea(body);
  }

  if (s.awaitingJob) {
    const id = s.awaitingJob;
    s.awaitingJob = null;
    db.save();
    say(`👍 On it. Reworking #${id.slice(1)}, I'll send the new version shortly.`);
    pipeline.enqueue(() => pipeline.reviseJob(id, text)).catch((e) => console.error(e));
    return;
  }

  if (text.length >= 15) return startIdea(text);
  return say('Not sure what you mean 😅 Send an idea in a sentence, or type "help".');
}

async function handle(msg) {
  const s = db.get().state;
  s.lastInbound = Date.now();
  db.save();
  outbox.flush().catch(() => {}); // the 24h window just reopened: deliver anything that was waiting

  try {
    if (msg.type === 'interactive') {
      const id = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id;
      return await onButton(id);
    }
    if (msg.type === 'button') return await onButton(msg.button?.payload);
    if (msg.type === 'text') return await onText(msg.text?.body || '');
    return await say('I can only read text and button taps for now. Type "help" to see what I can do.');
  } catch (e) {
    console.error('inbound error:', e);
    return say(`Something broke on my side: ${e.message.slice(0, 150)}`);
  }
}

module.exports = { handle, statusText };
