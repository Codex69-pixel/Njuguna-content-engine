// Tiny JSON-file database. One process, so no locking needed.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const FILE = path.join(cfg.dataDir, 'db.json');

const fresh = () => ({
  counter: 0,
  ideas: [],
  jobs: {},
  outbox: [],
  state: {
    paused: false,
    tone: '',
    awaitingJob: null,
    lastInbound: 0,
    lastTemplateAt: 0,
    usedClips: [],
    seenMsgs: [],
  },
});

let db = null;

function get() {
  if (db) return db;
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  let loaded = {};
  try { loaded = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* first run */ }
  const d = fresh();
  db = { ...d, ...loaded, state: { ...d.state, ...(loaded.state || {}) } };
  return db;
}

function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(get(), null, 2));
  fs.renameSync(tmp, FILE);
}

function nextId(prefix) {
  const d = get();
  d.counter += 1;
  save();
  return `${prefix}${d.counter}`;
}

module.exports = { get, save, nextId };
