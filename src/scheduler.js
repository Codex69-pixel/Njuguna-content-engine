// The autopilot clock: nightly batch, morning check-in, per-minute posting + retry.
const cron = require('node-cron');
const cfg = require('./config');
const db = require('./db');
const pipeline = require('./pipeline');
const outbox = require('./outbox');
const ideas = require('./ideas');

const log = (e) => console.error('[scheduler]', e?.message || e);

async function digest() {
  const d = db.get();
  if (d.state.paused) return;
  if (d.outbox.some((o) => o.tag === 'digest')) return; // don't pile up check-ins if you're away
  const jobs = Object.values(d.jobs);
  const awaiting = jobs.filter((j) => ['queued', 'awaiting_review'].includes(j.status)).length;
  const sched = jobs.filter((j) => j.status === 'approved').sort((a, b) => a.scheduledAt - b.scheduledAt);
  let t = `☀️ Morning Njuguna! Quick pulse:\n• Waiting for your review: ${awaiting}\n• Scheduled to post: ${sched.length}`;
  if (sched.length) t += ` (next: ${pipeline.fmtSlot(sched[0].scheduledAt)})`;
  t += `\n• Ideas in the bank: ${ideas.unused().length}`;
  if (sched.length < 3) t += `\n\n⚠️ Your schedule is getting thin. ${awaiting ? 'Approve a few videos' : 'Send me an idea or say "make 3"'} so you keep showing up 💪`;
  else if (awaiting) t += '\n\nTip: say "approve all" if they all look good.';
  await outbox.push({ kind: 'text', text: t, tag: 'digest' });
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await pipeline.publishDue();
    await outbox.flush();
  } finally {
    ticking = false;
  }
}

function start() {
  cron.schedule(cfg.generateCron, () => pipeline.dailyBatch().catch(log), { timezone: cfg.tz });
  cron.schedule(cfg.digestCron, () => digest().catch(log), { timezone: cfg.tz });
  cron.schedule('* * * * *', () => tick().catch(log), { timezone: cfg.tz });
  console.log(`Autopilot on: builds ${cfg.videosPerDay}/night (cron "${cfg.generateCron}"), posts at ${cfg.postTimes.join(', ')} Nairobi time.`);
}

module.exports = { start, digest, tick };
