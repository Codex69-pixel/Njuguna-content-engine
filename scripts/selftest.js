// Offline wiring test: fakes the internet + AI voice, but runs REAL FFmpeg and the real logic.
//   npm run selftest
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-test-'));
Object.assign(process.env, {
  DATA_DIR: path.join(tmp, 'data'), READY_DIR: path.join(tmp, 'ready'),
  WA_TOKEN: 'x', WA_PHONE_NUMBER_ID: '111', WA_OWNER_NUMBER: '254700000000', PEXELS_API_KEY: '',
  POST_TIMES: '08:00,13:00,19:00',
});

const sent = [];
const script = (extra = {}) => ({
  format: 'business',
  lines: [
    { text: 'Customers keep asking if you have a website?', search: 'shop owner phone' },
    { text: 'And you keep saying, it is coming soon.', search: 'busy cafe' },
    { text: 'Meanwhile your competitor is getting the orders.', search: 'man laptop frustrated' },
    { text: 'A simple website fixes this fast.', search: 'typing code screen' },
  ],
  caption_body: 'A good website works for you 24/7, answers questions and brings in orders while you sleep.',
  hashtags: ['#webdesign', '#kenya'],
  ...extra,
});

global.fetch = async (url, init = {}) => {
  const u = String(url);
  const json = (o, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('/api/generate')) {
    const prompt = JSON.parse(init.body).prompt;
    return json({ response: JSON.stringify(prompt.includes('Njuguna\'s feedback') ? script({ replace_clips: [2] }) : script()) });
  }
  if (u.endsWith('/media')) return json({ id: 'MEDIA1' });
  if (u.endsWith('/messages')) { sent.push(JSON.parse(init.body)); return json({ messages: [{ id: 'wamid.x' }] }); }
  throw new Error('unexpected fetch ' + u);
};

const assert = (c, m) => { if (!c) { console.error('❌ FAIL:', m); process.exit(1); } console.log('✅', m); };

(async () => {
  const assets = require('../src/assets');
  assets.tts = async (text, out) => {  // fake voice: a beep whose length depends on the text
    const secs = Math.max(1.5, text.split(' ').length * 0.35);
    execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=330:duration=${secs}`, '-c:a', 'libmp3lame', out]);
  };
  const db = require('../src/db');
  const ideas = require('../src/ideas');
  const pipeline = require('../src/pipeline');
  const inbound = require('../src/inbound');

  db.get().state.lastInbound = Date.now();               // pretend you messaged the bot just now
  const idea = ideas.add('Customers keep asking if you have a website', 'business', true);
  const job = await pipeline.createFromIdea(idea);

  assert(job.status === 'awaiting_review', 'video built and sent for review');
  const dir = pipeline.jobDir(job.id);
  assert(fs.existsSync(path.join(dir, 'final.mp4')) && fs.existsSync(path.join(dir, 'review.mp4')), 'final.mp4 + review.mp4 exist');
  const mb = fs.statSync(path.join(dir, 'review.mp4')).size / 1048576;
  assert(mb < 16, `review.mp4 is under WhatsApp's 16MB limit (${mb.toFixed(1)}MB)`);
  const review = sent.find((m) => m.type === 'interactive');
  assert(review && review.interactive.action.buttons.length === 3 && review.to === '254700000000', 'WhatsApp message has video + 3 buttons');
  const cap = fs.readFileSync(path.join(dir, 'caption.txt'), 'utf8');
  assert(cap.includes('wa.me/') && cap.includes('#webdesign'), 'caption contains contact block + hashtags');

  const owner = '254700000000';
  await inbound.handle({ from: owner, type: 'interactive', interactive: { button_reply: { id: `changes:${job.id}` } } });
  assert(db.get().state.awaitingJob === job.id, '"Changes" button waits for your feedback');
  await inbound.handle({ from: owner, type: 'text', text: { body: 'swap clip 3 and make it funnier' } });
  await pipeline.enqueue(async () => {});
  await new Promise((r) => setTimeout(r, 200));
  await pipeline.enqueue(async () => {});
  assert(db.get().jobs[job.id].version === 2, 'feedback produced version 2');
  assert(sent.filter((m) => m.type === 'interactive').length === 2, 'new version sent back for review');

  await inbound.handle({ from: owner, type: 'interactive', interactive: { button_reply: { id: `approve:${job.id}` } } });
  const j = db.get().jobs[job.id];
  assert(j.status === 'approved' && j.scheduledAt > Date.now(), 'approve schedules a future slot');
  assert(fs.readdirSync(path.join(tmp, 'ready')).length === 2, 'HD video + caption copied to ready-to-post');

  j.scheduledAt = Date.now() - 1000;                      // pretend the slot has arrived
  await pipeline.publishDue();
  assert(db.get().jobs[job.id].status === 'posted', 'due video is published');
  assert(sent.some((m) => m.type === 'video'), 'post reminder with video sent to WhatsApp');

  db.get().state.lastInbound = 0;                          // 24h window closed
  const before = sent.length;
  await require('../src/outbox').push({ kind: 'text', text: 'hello' });
  assert(sent.length === before + 1 && sent[sent.length - 1].type === 'template', 'closed window -> wake-up template instead of failing');
  console.log('\nAll checks passed. Temp files:', tmp);
  process.exit(0);
})().catch((e) => { console.error('❌ Crashed:', e); process.exit(1); });
