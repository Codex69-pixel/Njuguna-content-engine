// "Is everything installed and connected?"  ->  npm run check
const { execFile } = require('child_process');
const { promisify } = require('util');
const cfg = require('../src/config');
const run = promisify(execFile);

const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m, fix) => { console.log(`  ❌ ${m}${fix ? `\n     → ${fix}` : ''}`); failed++; };
const warn = (m) => console.log(`  ⚠️  ${m}`);
let failed = 0;

async function tryCmd(cmd, args) {
  try { const { stdout, stderr } = await run(cmd, args); return (stdout || stderr).split('\n')[0]; } catch { return null; }
}

(async () => {
  console.log('\nChecking your setup...\n');

  const major = Number(process.versions.node.split('.')[0]);
  major >= 20 ? ok(`Node.js ${process.versions.node}`) : bad(`Node.js ${process.versions.node} is too old`, 'Install Node 20 or newer from nodejs.org');

  (await tryCmd('ffmpeg', ['-version'])) ? ok('FFmpeg found') : bad('FFmpeg not found', 'Windows: run  winget install ffmpeg  then reopen the terminal');
  (await tryCmd('ffprobe', ['-version'])) ? ok('ffprobe found') : bad('ffprobe not found', 'It comes with FFmpeg. Reinstall FFmpeg.');

  const edge = (await tryCmd('edge-tts', ['--version'])) || (await tryCmd('python', ['-m', 'edge_tts', '--version'])) || (await tryCmd('py', ['-m', 'edge_tts', '--version']));
  edge ? ok('edge-tts (AI voice) found') : bad('edge-tts not found', 'Run:  pip install edge-tts');

  if (cfg.llm.provider === 'gemini') {
    cfg.llm.geminiKey ? ok(`Gemini key set (${cfg.llm.geminiModel})`) : bad('LLM_PROVIDER=gemini but GEMINI_API_KEY is empty', 'Get a free key at aistudio.google.com');
  } else {
    try {
      const r = await fetch(`${cfg.llm.ollamaUrl}/api/tags`);
      const j = await r.json();
      const have = (j.models || []).some((m) => m.name.startsWith(cfg.llm.ollamaModel.split(':')[0]));
      have ? ok(`Ollama running, model ${cfg.llm.ollamaModel} available`) : bad(`Ollama is running but model "${cfg.llm.ollamaModel}" isn't downloaded`, `Run:  ollama pull ${cfg.llm.ollamaModel}`);
    } catch { bad('Ollama is not running', 'Install from ollama.com, open it, then run:  ollama pull ' + cfg.llm.ollamaModel); }
  }

  if (!cfg.pexelsKey) bad('PEXELS_API_KEY is empty', 'Free key: pexels.com/api');
  else {
    try {
      const r = await fetch('https://api.pexels.com/videos/search?query=laptop&per_page=1', { headers: { Authorization: cfg.pexelsKey } });
      r.ok ? ok('Pexels key works') : bad(`Pexels rejected the key (HTTP ${r.status})`, 'Re-copy the key from pexels.com/api');
    } catch (e) { bad('Could not reach Pexels', e.message); }
  }

  if (!cfg.wa.token || !cfg.wa.phoneId || !cfg.wa.owner) {
    bad('WhatsApp settings incomplete', 'Fill WA_TOKEN, WA_PHONE_NUMBER_ID and WA_OWNER_NUMBER in .env (README Part 3)');
  } else {
    try {
      const r = await fetch(`https://graph.facebook.com/${cfg.wa.apiVersion}/${cfg.wa.phoneId}`, { headers: { Authorization: `Bearer ${cfg.wa.token}` } });
      r.ok ? ok('WhatsApp token + phone number ID work') : bad(`WhatsApp rejected the token/ID (HTTP ${r.status})`, 'Temporary tokens expire after 24h. Make a permanent one (README Part 3, step 5).');
    } catch (e) { bad('Could not reach the WhatsApp API', e.message); }
  }

  cfg.publicUrl.startsWith('https://') ? ok(`Public URL: ${cfg.publicUrl}`) : warn('PUBLIC_URL not set yet (needed so WhatsApp can reach you; README Part 4)');
  cfg.wa.appSecret ? ok('WA_APP_SECRET set (webhook is protected)') : warn('WA_APP_SECRET empty: webhook works but is less secure');

  console.log(failed ? `\n${failed} thing(s) to fix above, then run  npm run check  again.\n` : '\nAll good! Next: npm run make -- "your first topic"\n');
  process.exit(failed ? 1 : 0);
})();
