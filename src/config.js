require('dotenv').config();
const path = require('path');

const root = path.join(__dirname, '..');
const env = (k, d = '') => String(process.env[k] ?? d).trim();
const digits = (s) => String(s || '').replace(/\D/g, '');
const dataDir = env('DATA_DIR') || path.join(root, 'data');

module.exports = {
  root,
  dataDir,
  jobsDir: path.join(dataDir, 'jobs'),
  readyDir: env('READY_DIR') || path.join(root, 'ready-to-post'),
  myClipsDir: path.join(root, 'my_clips'),
  musicDir: path.join(root, 'music'),

  llm: {
    provider: env('LLM_PROVIDER', 'ollama').toLowerCase(),
    ollamaModel: env('OLLAMA_MODEL', 'llama3.2:3b'),
    ollamaUrl: env('OLLAMA_URL', 'http://localhost:11434'),
    geminiKey: env('GEMINI_API_KEY'),
    geminiModel: env('GEMINI_MODEL', 'gemini-2.5-flash'),
  },

  pexelsKey: env('PEXELS_API_KEY'),
  voice: env('TTS_VOICE', 'en-KE-AsiliaNeural'),
  voiceRate: env('TTS_RATE', '+8%'),

  wa: {
    token: env('WA_TOKEN'),
    phoneId: env('WA_PHONE_NUMBER_ID'),
    verifyToken: env('WA_VERIFY_TOKEN', 'change-me'),
    appSecret: env('WA_APP_SECRET'),
    owner: digits(env('WA_OWNER_NUMBER')),
    templateName: env('WA_TEMPLATE_NAME', 'hello_world'),
    templateLang: env('WA_TEMPLATE_LANG', 'en_US'),
    apiVersion: env('WA_API_VERSION', 'v21.0'),
  },

  port: Number(env('PORT', '3000')),
  publicUrl: env('PUBLIC_URL').replace(/\/$/, ''),
  mediaKey: env('MEDIA_KEY', 'change-me-too'),

  videosPerDay: Number(env('VIDEOS_PER_DAY', '3')),
  maxPendingReview: Number(env('MAX_PENDING_REVIEW', '6')),
  generateCron: env('GENERATE_CRON', '0 2 * * *'),
  digestCron: env('DIGEST_CRON', '30 7 * * *'),
  postTimes: env('POST_TIMES', '08:00,13:00,19:00').split(',').map((s) => s.trim()).filter(Boolean),
  tz: 'Africa/Nairobi',
  tzOffset: '+03:00',

  meta: {
    autoPost: env('AUTO_POST_META') === 'true',
    token: env('META_PAGE_TOKEN'),
    igUserId: env('IG_USER_ID'),
    fbPageId: env('FB_PAGE_ID'),
    apiVersion: env('META_API_VERSION', 'v21.0'),
  },

  brand: {
    name: 'Njuguna Devs',
    whatsapp: digits(env('CONTACT_WHATSAPP', '254792629643')),
    email: env('CONTACT_EMAIL', 'njugunacyua@gmail.com'),
    website: env('CONTACT_WEBSITE'),
    outro: env('OUTRO_TEXT', 'Njuguna Devs - websites that work for you'),
  },
};
