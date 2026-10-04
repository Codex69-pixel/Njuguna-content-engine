// Starts the web server (WhatsApp webhook + video links) and the autopilot clock.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cfg = require('./config');
const db = require('./db');
const inbound = require('./inbound');
const scheduler = require('./scheduler');
const outbox = require('./outbox');

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

function validSignature(req) {
  if (!cfg.wa.appSecret) return true;
  const sig = req.get('x-hub-signature-256') || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', cfg.wa.appSecret).update(req.rawBody || '').digest('hex');
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

app.get('/', (_req, res) => res.send('Njuguna content engine is running 🎬'));

// Meta calls this once to check your verify token
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === cfg.wa.verifyToken) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  return res.sendStatus(403);
});

// Meta calls this for every message you send to the bot
app.post('/webhook', (req, res) => {
  if (!validSignature(req)) return res.sendStatus(401);
  res.sendStatus(200); // answer fast, work after

  const values = (req.body?.entry || []).flatMap((e) => e.changes || []).map((c) => c.value || {});
  for (const v of values) {
    for (const st of v.statuses || []) {
      if (st.status === 'failed') console.warn('WhatsApp delivery failed:', JSON.stringify(st.errors || st).slice(0, 300));
    }
    for (const msg of v.messages || []) {
      if (String(msg.from).replace(/\D/g, '') !== cfg.wa.owner) continue; // only YOU can drive the bot
      const seen = db.get().state.seenMsgs;
      if (seen.includes(msg.id)) continue;
      seen.push(msg.id);
      db.get().state.seenMsgs = seen.slice(-200);
      db.save();
      inbound.handle(msg).catch((e) => console.error('handle error', e));
    }
  }
});

// Instagram/Facebook download your finished video from here (protected by MEDIA_KEY)
app.get('/media/:file', (req, res) => {
  const m = /^(j\d+)\.mp4$/.exec(req.params.file);
  if (!m || req.query.key !== cfg.mediaKey) return res.sendStatus(404);
  const file = path.join(cfg.jobsDir, m[1], 'final.mp4');
  if (!fs.existsSync(file)) return res.sendStatus(404);
  return res.sendFile(file);
});

function warnAboutSetup() {
  const missing = [];
  if (!cfg.wa.token) missing.push('WA_TOKEN');
  if (!cfg.wa.phoneId) missing.push('WA_PHONE_NUMBER_ID');
  if (!cfg.wa.owner) missing.push('WA_OWNER_NUMBER');
  if (!cfg.pexelsKey) missing.push('PEXELS_API_KEY (videos will use plain backgrounds)');
  if (cfg.llm.provider === 'gemini' && !cfg.llm.geminiKey) missing.push('GEMINI_API_KEY');
  if (missing.length) console.warn('⚠️  Missing in .env:', missing.join(', '));
}

app.listen(cfg.port, () => {
  console.log(`Server listening on port ${cfg.port}`);
  warnAboutSetup();
  scheduler.start();
  outbox.flush().catch(() => {});
});

process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
