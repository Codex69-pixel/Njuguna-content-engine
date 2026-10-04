// The brain: makes a video from an idea, applies your feedback, schedules + publishes approved ones.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const db = require('./db');
const scripts = require('./script');
const ideas = require('./ideas');
const assets = require('./assets');
const stitch = require('./stitch');
const outbox = require('./outbox');
const poster = require('./poster');

// Only one video is built at a time (keeps your PC responsive)
let chain = Promise.resolve();
function enqueue(fn) {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
}

const jobDir = (id) => path.join(cfg.jobsDir, id);
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const notify = (text) => outbox.push({ kind: 'text', text }).catch(() => {});

function fmtSlot(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    timeZone: cfg.tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/** Download clips + make voice for every line, then stitch. Re-uses anything unchanged. */
async function render(job) {
  const d = db.get();
  const dir = jobDir(job.id);
  fs.mkdirSync(dir, { recursive: true });
  const lines = job.script.lines;
  job.clips = (job.clips || []).slice(0, lines.length);
  job.voices = (job.voices || []).slice(0, lines.length);
  const replace = job.replaceClips || [];
  job.replaceClips = [];

  for (let i = 0; i < lines.length; i++) {
    const clipFile = path.join(dir, `clip_${i}.mp4`);
    const meta = job.clips[i];
    const keep = meta && meta.search === lines[i].search && !replace.includes(i) && fs.existsSync(clipFile);
    if (!keep) {
      const exclude = [...d.state.usedClips, meta?.pid].filter(Boolean);
      const got = await assets.getClip(lines[i].search, clipFile, exclude);
      job.clips[i] = { search: lines[i].search, pid: got.id, source: got.source };
      if (got.id) d.state.usedClips = [...d.state.usedClips, got.id].slice(-400);
    }
    const voiceFile = path.join(dir, `voice_${i}.mp3`);
    const h = md5(lines[i].text + cfg.voice + cfg.voiceRate);
    if (job.voices[i] !== h || !fs.existsSync(voiceFile)) {
      await assets.tts(lines[i].text, voiceFile);
      job.voices[i] = h;
    }
    db.save();
  }
  fs.writeFileSync(path.join(dir, 'caption.txt'), scripts.buildCaption(job.script));
  await stitch.buildVideo(dir, lines.map((l) => l.text));
}

async function createFromIdea(idea, { deliver = true } = {}) {
  const d = db.get();
  const id = db.nextId('j');
  const job = { id, topic: idea.text, kind: idea.kind || 'auto', status: 'building', version: 1, createdAt: Date.now(), clips: [], voices: [] };
  d.jobs[id] = job;
  idea.used = true;
  idea.jobId = id;
  db.save();
  try {
    job.script = await scripts.generate(idea.text, idea.kind);
    db.save();
    await render(job);
    job.status = 'queued';
    db.save();
    if (deliver) await outbox.push({ kind: 'review', jobId: id });
  } catch (e) {
    job.status = 'failed';
    job.error = e.message;
    db.save();
    console.error(`Job ${id} failed:`, e.message);
    if (deliver) await notify(`⚠️ I couldn't build video #${id.slice(1)} ("${idea.text.slice(0, 50)}"): ${e.message.slice(0, 200)}`);
  }
  return job;
}

async function reviseJob(jobId, feedback, { deliver = true } = {}) {
  const job = db.get().jobs[jobId];
  if (!job) return null;
  try {
    job.status = 'revising';
    db.save();
    const next = await scripts.revise(job.script, feedback);
    job.replaceClips = next.replace_clips;
    delete next.replace_clips;
    job.script = next;
    job.version += 1;
    job.feedback = [...(job.feedback || []), feedback];
    db.save();
    await render(job);
    job.status = 'queued';
    db.save();
    if (deliver) await outbox.push({ kind: 'review', jobId });
  } catch (e) {
    job.status = 'awaiting_review';
    db.save();
    console.error(`Revise ${jobId} failed:`, e.message);
    if (deliver) await notify(`⚠️ I couldn't apply that change to #${jobId.slice(1)}: ${e.message.slice(0, 200)}. The earlier version is still there, so you can approve it or try different wording.`);
  }
  return job;
}

/** Next free posting slot (Nairobi time). */
function nextSlot() {
  const d = db.get();
  const taken = new Set(Object.values(d.jobs).filter((j) => j.status === 'approved' && j.scheduledAt).map((j) => j.scheduledAt));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: cfg.tz, year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date());
  const [y, m, dd] = today.split('-').map(Number);
  for (let off = 0; off < 90; off++) {
    const base = new Date(Date.UTC(y, m - 1, dd + off, 12));
    const day = base.toISOString().slice(0, 10);
    for (const raw of cfg.postTimes) {
      const time = raw.padStart(5, '0');
      const slot = new Date(`${day}T${time}:00${cfg.tzOffset}`);
      if (!Number.isNaN(slot.getTime()) && slot.getTime() > Date.now() + 10 * 60 * 1000 && !taken.has(slot.getTime())) return slot;
    }
  }
  return new Date(Date.now() + 3600 * 1000);
}

function approve(jobId) {
  const job = db.get().jobs[jobId];
  if (!job) return null;
  const slot = nextSlot();
  job.status = 'approved';
  job.scheduledAt = slot.getTime();
  db.save();
  try {
    fs.mkdirSync(cfg.readyDir, { recursive: true });
    const stamp = slot.toLocaleString('sv-SE', { timeZone: cfg.tz }).replace(/[: ]/g, '-').slice(0, 16);
    const dir = jobDir(jobId);
    fs.copyFileSync(path.join(dir, 'final.mp4'), path.join(cfg.readyDir, `${stamp}_${jobId}.mp4`));
    fs.copyFileSync(path.join(dir, 'caption.txt'), path.join(cfg.readyDir, `${stamp}_${jobId}.txt`));
  } catch (e) {
    console.warn('Could not copy to ready-to-post:', e.message);
  }
  return slot.getTime();
}

function reject(jobId) {
  const job = db.get().jobs[jobId];
  if (job) { job.status = 'rejected'; db.save(); }
  return job;
}

const waiting = () => Object.values(db.get().jobs).filter((j) => ['queued', 'awaiting_review', 'revising', 'building'].includes(j.status));

/** Nightly: make today's batch (skips if you already have a pile waiting). */
async function dailyBatch() {
  const s = db.get().state;
  if (s.paused) return;
  const room = Math.max(0, cfg.maxPendingReview - waiting().length);
  const n = Math.min(cfg.videosPerDay, room);
  if (n > 0) await makeBatch(n);
}

async function makeBatch(n) {
  await ideas.ensure(n + 3);
  for (let i = 0; i < n; i++) {
    const idea = ideas.next();
    if (!idea) break;
    await enqueue(() => createFromIdea(idea));
  }
}

/** Every minute: post anything that's due. */
async function publishDue() {
  const d = db.get();
  if (d.state.paused) return;
  const due = Object.values(d.jobs).filter((j) => j.status === 'approved' && j.scheduledAt && j.scheduledAt <= Date.now());
  for (const job of due) {
    job.status = 'posting';
    db.save();
    const auto = [];
    const errs = [];
    if (cfg.meta.autoPost && cfg.meta.token) {
      const caption = fs.readFileSync(path.join(jobDir(job.id), 'caption.txt'), 'utf8');
      if (cfg.meta.igUserId) {
        try { await poster.instagram(job, caption); auto.push('Instagram'); } catch (e) { errs.push(`Instagram: ${e.message}`); }
      }
      if (cfg.meta.fbPageId) {
        try { await poster.facebook(job, caption); auto.push('Facebook'); } catch (e) { errs.push(`Facebook: ${e.message}`); }
      }
    }
    job.status = 'posted';
    job.postedAt = Date.now();
    job.autoPosted = auto;
    db.save();
    await outbox.push({ kind: 'post', jobId: job.id, auto, errs });
  }
}

module.exports = {
  enqueue, createFromIdea, reviseJob, approve, reject, dailyBatch, makeBatch, publishDue,
  nextSlot, fmtSlot, waiting, notify, jobDir,
};
