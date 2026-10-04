// Everything we want to tell you goes through here. WhatsApp only lets a bot message you freely
// for 24h after you last messaged it, so if that window is closed we park messages here, nudge you
// with a template message, and deliver everything the moment you reply.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const db = require('./db');
const wa = require('./whatsapp');

const DAY_WINDOW = 23 * 3600 * 1000;
const windowOpen = () => Date.now() - db.get().state.lastInbound < DAY_WINDOW;

let flushing = false;

async function maybeTemplate() {
  const s = db.get().state;
  if (Date.now() - s.lastTemplateAt < 6 * 3600 * 1000) return;
  try {
    await wa.sendTemplate();
    s.lastTemplateAt = Date.now();
    db.save();
  } catch (e) {
    console.warn('Could not send wake-up template:', e.message);
  }
}

function postFile(dir) {
  const big = path.join(dir, 'final.mp4');
  return fs.existsSync(big) && fs.statSync(big).size < 15.5 * 1024 * 1024 ? big : path.join(dir, 'review.mp4');
}

async function deliver(item) {
  const d = db.get();
  if (item.kind === 'text') return wa.sendText(item.text);

  const job = d.jobs[item.jobId];
  if (!job) return;
  const dir = path.join(cfg.jobsDir, job.id);
  const caption = fs.existsSync(path.join(dir, 'caption.txt')) ? fs.readFileSync(path.join(dir, 'caption.txt'), 'utf8') : '';
  const label = `#${job.id.slice(1)}`;

  if (item.kind === 'review') {
    if (job.status === 'rejected') return;
    const mediaId = await wa.uploadVideo(path.join(dir, 'review.mp4'));
    const body = `🎬 Video ${label}${job.version > 1 ? ` (v${job.version})` : ''}\n"${job.script.lines[0].text}"\n\nTopic: ${job.topic.slice(0, 120)}\n\nHow does it look?`;
    await wa.sendReview(mediaId, body.slice(0, 1000), job.id);
    await wa.sendText(`📝 Caption for ${label}:\n\n${caption}`);
    job.status = 'awaiting_review';
    db.save();
    return;
  }

  if (item.kind === 'post') {
    const auto = item.auto || [];
    const all = ['Instagram', 'Facebook', 'TikTok', 'YouTube Shorts', 'WhatsApp Status'];
    const manual = all.filter((p) => !auto.includes(p));
    let msg = `📣 Time to post video ${label}!\n`;
    if (auto.length) msg += `✅ Posted automatically: ${auto.join(', ')}\n`;
    msg += `👉 Post by hand on: ${manual.join(', ')}\n`;
    if (item.errs?.length) msg += `⚠️ Auto-post problems: ${item.errs.join(' | ').slice(0, 300)}\n`;
    msg += `(The HD file + caption are also in your ready-to-post folder.)`;
    await wa.sendText(msg);
    const mediaId = await wa.uploadVideo(postFile(dir));
    await wa.sendVideo(mediaId);
    await wa.sendText(caption);
  }
}

async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    const d = db.get();
    while (d.outbox.length) {
      const item = d.outbox[0];
      if (item.retryAt && item.retryAt > Date.now()) break;
      if (!windowOpen()) { await maybeTemplate(); break; }
      try {
        await deliver(item);
        d.outbox.shift();
        db.save();
      } catch (e) {
        if (e.code === 131047) { d.state.lastInbound = 0; db.save(); await maybeTemplate(); break; }
        console.error(`Could not deliver "${item.kind}":`, e.message);
        item.fails = (item.fails || 0) + 1;
        if (item.fails >= 4) d.outbox.shift(); else item.retryAt = Date.now() + 5 * 60 * 1000;
        db.save();
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

function push(item) {
  const d = db.get();
  d.outbox.push({ id: db.nextId('o'), at: Date.now(), ...item });
  db.save();
  return flush();
}

module.exports = { push, flush, windowOpen };
